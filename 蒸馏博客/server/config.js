import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv, writeEnvValues } from './lib/env.js'
import { generateStrongPassword } from './lib/password-policy.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))

/** 项目根目录：所有路径都从这里推导，保证数据不跑到目录外面 */
export const ROOT_DIR = path.resolve(currentDir, '..')

/** 先记住外部注入的值（Docker / 命令行临时覆盖）：loadEnv 只补空缺，之后分不清来源 */
const externalAdminPassword = process.env.ADMIN_PASSWORD
loadEnv(ROOT_DIR)

const toNumber = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const PORT = toNumber(process.env.PORT, 8787)

/**
 * 监听地址。默认只听本机：
 * - 本机访问走 http 就够了，外网访问必须经反向代理 + HTTPS（见 session.js 的 Cookie 规则）；
 * - 需要局域网/手机调试时，在 .env 里显式写 BIND_HOST=0.0.0.0。
 */
export const BIND_HOST = (process.env.BIND_HOST || '127.0.0.1').trim()

export const DATA_DIR = path.join(ROOT_DIR, 'data')
export const DB_FILE = path.join(DATA_DIR, 'db.json')
export const BACKUP_DIR = path.join(DATA_DIR, 'backups')
export const LOG_DIR = path.join(DATA_DIR, 'logs')
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')
export const COVER_DIR = path.join(UPLOAD_DIR, 'covers')
export const FILE_DIR = path.join(UPLOAD_DIR, 'files')
export const DISTILL_DIR = path.join(UPLOAD_DIR, 'distill')
export const SECRET_FILE = path.join(DATA_DIR, '.session-secret')
/** HTTPS 证书目录：完整链 + 私钥。放在 data/ 下，天然不进快照与打包 */
export const CERT_DIR = path.join(DATA_DIR, 'certs')
/** 可用 .env 覆盖，便于把已有证书放在任意位置（例如 Caddy 的 live 目录） */
export const TLS_CERT_FILE = (process.env.TLS_CERT_FILE || path.join(CERT_DIR, 'fullchain.pem')).trim()
export const TLS_KEY_FILE = (process.env.TLS_KEY_FILE || path.join(CERT_DIR, 'privkey.pem')).trim()

export const WEB_DIST = path.join(ROOT_DIR, 'web', 'dist')

/** 默认密码只用于本地首次体验，部署前必须改掉 */
export const DEFAULT_ADMIN_PASSWORD = 'admin123'

export const ENV_FILE = path.join(ROOT_DIR, '.env')

/** 直接从 .env 文本里取 ADMIN_PASSWORD；没写这一行返回 null */
function readAdminPasswordFromFile() {
  const text = fs.readFileSync(ENV_FILE, 'utf8').replace(/^\uFEFF/, '')

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const eqIndex = line.indexOf('=')
    if (eqIndex === -1) continue
    if (line.slice(0, eqIndex).trim() !== 'ADMIN_PASSWORD') continue

    let value = line.slice(eqIndex + 1).trim()
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    if (quoted) value = value.slice(1, -1)
    return value || null
  }

  return null
}

let cachedAdminPassword = null
let cachedEnvMtime = -1
let generatedOnFirstBoot = false

/**
 * 全新安装时生成随机密码并写回 .env。
 * 拿到仓库直接跑（.env 在 .gitignore 里，所以通常不存在）和 .env 里漏写这一行，
 * 都必须走这里——否则后台口令就会是代码里写死的默认值，等于把门敞开。
 */
function generateAndPersistPassword(knownMtime) {
  const generated = generateStrongPassword()
  try {
    writeEnvValues(ROOT_DIR, { ADMIN_PASSWORD: generated })
    console.log('')
    console.log('  [安全] 已自动生成后台密码并写入 .env：')
    console.log(`  [安全]   ${generated}`)
    console.log('  [安全] 请尽快改成你自己记得住的强密码（至少 12 位）')
    console.log('')
    generatedOnFirstBoot = true
  } catch (error) {
    console.warn(`[config] 无法写入自动生成的密码：${error.message}`)
  }
  cachedAdminPassword = generated
  cachedEnvMtime = fs.statSync(ENV_FILE, { throwIfNoEntry: false })?.mtimeMs ?? knownMtime ?? 0
  return generated
}

/**
 * 当前后台密码。
 *
 * 每次调用先用 .env 的修改时间判断有没有被改过：改完保存即生效，不用重启服务。
 * 会话签名会混入这个密码（见 session.js），所以改密码会顺带让所有旧登录失效。
 *
 * 安全默认值：如果 .env 里压根没有这一行（全新安装），自动生成一个 24 位随机密码
 * 并写回 .env，同时在控制台打印一次——避免"装完就是公开默认密码"。
 */
export function getAdminPassword() {
  // 外部环境变量优先，便于部署时临时覆盖；这种情况下不再跟随文件变化
  if (externalAdminPassword !== undefined) {
    return externalAdminPassword || DEFAULT_ADMIN_PASSWORD
  }

  let mtime
  try {
    mtime = fs.statSync(ENV_FILE).mtimeMs
  } catch {
    // 运行期间 .env 被删了：沿用内存里的值，别让后台突然退回默认密码
    if (cachedAdminPassword !== null) return cachedAdminPassword
    // 全新克隆：仓库里只有 .env.example，直接生成随机密码
    return generateAndPersistPassword(null)
  }

  if (cachedAdminPassword !== null && mtime === cachedEnvMtime) return cachedAdminPassword

  let next = null
  try {
    next = readAdminPasswordFromFile()
  } catch (error) {
    console.warn(`[config] 读取 .env 失败，沿用上一次的后台密码：${error.message}`)
    return cachedAdminPassword ?? DEFAULT_ADMIN_PASSWORD
  }

  // 这一行被写空多半是手滑：保留上一次的密码，避免后台突然退回默认密码
  if (next === null) {
    if (cachedAdminPassword !== null) {
      cachedEnvMtime = mtime
      return cachedAdminPassword
    }
    return generateAndPersistPassword(mtime)
  }

  if (cachedAdminPassword !== null && cachedAdminPassword !== next) {
    console.log('[config] 检测到 .env 里的 ADMIN_PASSWORD 已变更：立即生效，旧的后台登录全部失效')
  }

  cachedAdminPassword = next
  cachedEnvMtime = mtime
  return next
}

/** 首次启动是否自动生成过密码（启动日志用来提示用户去 .env 里看） */
export function wasPasswordGenerated() {
  return generatedOnFirstBoot
}

/**
 * 让下一次 getAdminPassword() 强制重读 .env。
 * 后台"改密码"写完文件后必须调一次：同一秒内多次写入时 mtime 可能不变，
 * 不主动失效缓存就会读到旧密码，表现成"改了但提示密码不对"。
 */
export function invalidateAdminPasswordCache() {
  cachedEnvMtime = -1
}

/** 后台改密码用：把新密码写进 .env，并回读确认能被正确解析 */
export function persistAdminPassword(password) {
  const value = String(password ?? '')
  writeEnvValues(ROOT_DIR, { ADMIN_PASSWORD: value })
  invalidateAdminPasswordCache()
  return getAdminPassword()
}

export const SESSION_DAYS = toNumber(process.env.SESSION_DAYS, 7)
export const MAX_UPLOAD_MB = toNumber(process.env.MAX_UPLOAD_MB, 100)

/* 后端只读一次配置；key 允许在后台修改，因此这里用 getter 拿最新值 */
export const DEFAULT_LLM = {
  baseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com',
  model: process.env.LLM_MODEL || 'deepseek-flash',
}

/** 没有配置 SESSION_SECRET 时，生成一次并落盘，保证重启后登录态不失效 */
export function resolveSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET

  try {
    if (fs.existsSync(SECRET_FILE)) {
      const saved = fs.readFileSync(SECRET_FILE, 'utf8').trim()
      if (saved) return saved
    }
    const generated = crypto.randomBytes(32).toString('hex')
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(SECRET_FILE, generated, 'utf8')
    return generated
  } catch (error) {
    console.warn(`[config] 无法持久化会话密钥，本次使用临时密钥：${error.message}`)
    return crypto.randomBytes(32).toString('hex')
  }
}

export const SESSION_SECRET = resolveSessionSecret()

/** 启动时确保数据目录齐全，避免首次运行报错 */
export function ensureDataDirs() {
  for (const dir of [
    DATA_DIR,
    BACKUP_DIR,
    LOG_DIR,
    UPLOAD_DIR,
    COVER_DIR,
    FILE_DIR,
    DISTILL_DIR,
    CERT_DIR,
  ]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}
