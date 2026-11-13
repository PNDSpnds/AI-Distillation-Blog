import crypto from 'node:crypto'

/** 恒定时间比较，避免通过响应时间猜测密码 */
export function safeEqual(left, right) {
  const a = Buffer.from(String(left ?? ''), 'utf8')
  const b = Buffer.from(String(right ?? ''), 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/**
 * 会话签名密钥 = 会话密钥 + 当前后台密码。
 * 密码一变，已签发的 token 全部验不过，不需要维护黑名单。
 */
export function deriveSessionKey(secret, password) {
  return crypto
    .createHmac('sha256', String(secret ?? ''))
    .update(`admin-password:${String(password ?? '')}`)
    .digest('hex')
}

function signPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url')
}

/**
 * 会话 token 形如 "<过期时间戳>.<代次>.<签名>"，不需要服务端存 session 表。
 * 代次用来支持"退出登录即全部失效"。
 */
export function createSessionToken(secret, ttlMs, epoch = 0) {
  const expiresAt = Date.now() + ttlMs
  const payload = `${expiresAt}.${epoch}`
  return `${payload}.${signPayload(payload, secret)}`
}

/** 校验 token：签名不对、代次不符或已过期都返回 null */
export function verifySessionToken(token, secret, expectedEpoch = 0) {
  if (typeof token !== 'string') return null

  const separator = token.lastIndexOf('.')
  if (separator <= 0) return null

  const payload = token.slice(0, separator)
  const signature = token.slice(separator + 1)
  if (!safeEqual(signature, signPayload(payload, secret))) return null

  const [expiresText, epochText = '0'] = payload.split('.')
  const expiresAt = Number.parseInt(expiresText, 10)
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null

  // 旧格式（没有代次）按 0 处理，升级后不会把所有人立刻踢下线
  if (Number.parseInt(epochText, 10) !== expectedEpoch) return null

  return expiresAt
}
