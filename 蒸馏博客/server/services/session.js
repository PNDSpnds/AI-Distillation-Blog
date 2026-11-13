import { SESSION_DAYS, SESSION_SECRET, getAdminPassword } from '../config.js'
import {
  createSessionToken,
  deriveSessionKey,
  safeEqual,
  verifySessionToken,
} from '../lib/auth.js'
import { forbidden, unauthorized } from '../lib/http-error.js'
import { audit } from '../lib/security-log.js'

export const SESSION_COOKIE = 'chatblog_session'

/** 实际的签名密钥：混入当前后台密码，改密码即刻让旧会话失效 */
function sessionKey() {
  return deriveSessionKey(SESSION_SECRET, getAdminPassword())
}

/**
 * 会话代次。退出登录时 +1，所有已签发的 token 立刻作废。
 * 只存在内存里：重启服务等于全部重新登录，对单人后台是可以接受的代价。
 */
let sessionEpoch = 0

/* ---------------- 登录失败节流 ---------------- */

const WINDOW_MS = 15 * 60 * 1000
/** 同一 IP（IPv6 按 /64 聚合）在窗口内允许的失败次数 */
const IP_MAX_FAILURES = 10
/** 全站失败总数达到这个值就先锁一段时间，挡住"换 IP 继续试" */
const GLOBAL_MAX_FAILURES = 40
const GLOBAL_LOCK_MS = 15 * 60 * 1000

const ipFailures = new Map()
let globalFailures = 0
let globalWindowStart = Date.now()
let globalLockedUntil = 0

/**
 * IPv6 按 /64 聚合：同一台机器可以随手换几十亿个地址，
 * 按完整地址计数等于没限制。这里只保留前 4 段。
 */
export function normalizeIp(rawIp) {
  const ip = String(rawIp ?? 'unknown')
    // ::ffff:127.0.0.1 这类 IPv4 映射地址还原成 IPv4
    .replace(/^::ffff:/i, '')
    .trim()

  if (!ip.includes(':')) return ip

  const parts = ip.split(':')
  return `${parts.slice(0, 4).join(':')}::/64`
}

function rollGlobalWindow(now) {
  if (now - globalWindowStart <= WINDOW_MS) return
  globalWindowStart = now
  globalFailures = 0
}

function isLockedOut(ipKey) {
  const now = Date.now()
  rollGlobalWindow(now)
  if (now < globalLockedUntil) return true

  const record = ipFailures.get(ipKey)
  if (!record) return false
  if (now - record.firstAt > WINDOW_MS) {
    ipFailures.delete(ipKey)
    return false
  }
  return record.count >= IP_MAX_FAILURES
}

function recordFailure(ipKey) {
  const now = Date.now()
  rollGlobalWindow(now)

  const record = ipFailures.get(ipKey)
  if (!record || now - record.firstAt > WINDOW_MS) {
    ipFailures.set(ipKey, { count: 1, firstAt: now })
  } else {
    record.count += 1
  }

  globalFailures += 1
  if (globalFailures >= GLOBAL_MAX_FAILURES) {
    globalLockedUntil = now + GLOBAL_LOCK_MS
    globalFailures = 0
    globalWindowStart = now
    return true
  }
  return false
}

/**
 * 失败后的指数退避：前 2 次不等，之后每多 3 次翻一倍，最多 3s。
 * 不直接硬锁，是为了避免攻击者用几十个请求把你自己锁在门外。
 */
function backoffDelay(ipKey) {
  const failures = ipFailures.get(ipKey)?.count ?? 0
  if (failures < 3) return 0
  return Math.min(3000, 300 * 2 ** Math.floor((failures - 3) / 3))
}

const sleep = (ms) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve())

/* ---------------- Cookie 与鉴权 ---------------- */

/** 从 Cookie 头里取指定名字的值（量小，不引第三方 cookie 解析库） */
export function readCookie(request, name) {
  const header = request.headers.cookie
  if (!header) return null

  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim())
    }
  }
  return null
}

export function isAuthenticated(request) {
  const token = readCookie(request, SESSION_COOKIE)
  return Boolean(verifySessionToken(token, sessionKey(), sessionEpoch))
}

export function requireAuth(request, response, next) {
  if (!isAuthenticated(request)) {
    next(unauthorized('登录已失效，请重新登录'))
    return
  }
  next()
}

/**
 * 请求本身是否走 HTTPS（直连或本机反向代理转发）。
 *
 * 必须用 Express 的 request.secure，不要手读 X-Forwarded-Proto：
 * 那个头任何人都能自己加上，直接读它等于把"强制 HTTPS"这道防线变成摆设
 * （局域网/公网用 http + 假头就能拿到登录 Cookie）。
 * request.secure 会结合 app.set('trust proxy', 'loopback')，只采信本机反代给的值。
 */
export function isSecureRequest(request) {
  return Boolean(request.secure)
}

/** 本机回环地址：本机用 http 访问是允许的 */
export function isLoopbackRequest(request) {
  const ip = normalizeIp(request.ip ?? request.socket?.remoteAddress ?? '')
  return ip === '::1' || ip.startsWith('127.')
}

/**
 * 下发会话 Cookie。
 * 非本机访问必须走 HTTPS：否则密码、Cookie、保存 Key 的请求体都会在网络上裸奔。
 */
export function startSession(response, request) {
  if (!isSecureRequest(request) && !isLoopbackRequest(request)) {
    throw forbidden('后台只能通过 HTTPS 访问：请用域名 + HTTPS 反向代理，或在本机打开')
  }

  const ttlMs = SESSION_DAYS * 24 * 60 * 60 * 1000
  const token = createSessionToken(sessionKey(), ttlMs, sessionEpoch)
  const secure = isSecureRequest(request)

  response.setHeader(
    'Set-Cookie',
    [
      `${SESSION_COOKIE}=${token}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${Math.floor(ttlMs / 1000)}`,
      secure ? 'Secure' : '',
    ]
      .filter(Boolean)
      .join('; '),
  )
}

/** 退出登录：清 Cookie 并把会话代次 +1，已泄露的 token 也一起作废 */
export function endSession(response) {
  sessionEpoch += 1
  response.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  )
}

/* ---------------- 密码校验 ---------------- */

/**
 * 校验后台密码，并复用同一套节流逻辑。
 * 登录、以及"改模型地址时的二次确认"都走这里，避免两处防护强度不一致。
 */
export async function verifyAdminPassword(providedInput, request, { action = 'login' } = {}) {
  const ipKey = normalizeIp(request.ip ?? request.socket?.remoteAddress ?? 'unknown')
  const provided = typeof providedInput === 'string' ? providedInput : ''

  if (isLockedOut(ipKey)) {
    audit(`${action}_locked`, { ip: ipKey })
    return { ok: false, locked: true, message: '尝试次数过多，请 15 分钟后再试' }
  }

  const adminPassword = getAdminPassword()
  const matched = provided.length === adminPassword.length && safeEqual(provided, adminPassword)

  if (!matched) {
    const locked = recordFailure(ipKey)
    audit(`${action}_failed`, {
      ip: ipKey,
      detail: `第 ${ipFailures.get(ipKey)?.count ?? 1} 次失败`,
    })
    await sleep(backoffDelay(ipKey))
    if (locked) {
      audit(`${action}_locked`, { ip: ipKey, detail: '全站失败次数过多' })
      return { ok: false, locked: true, message: '尝试次数过多，请 15 分钟后再试' }
    }
    return { ok: false, locked: false, message: '密码不正确' }
  }

  ipFailures.delete(ipKey)
  return { ok: true, locked: false, message: 'ok' }
}

/** 登录入口：包含锁定判断与恒定时间密码比较 */
export async function attemptLogin(request, password) {
  return verifyAdminPassword(password, request, { action: 'login' })
}
