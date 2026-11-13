import fs from 'node:fs'
import { ENV_FILE, getAdminPassword, persistAdminPassword } from '../config.js'
import { badRequest, forbidden } from '../lib/http-error.js'
import { evaluatePassword, minimumPasswordLength } from '../lib/password-policy.js'
import { audit } from '../lib/security-log.js'
import { verifyAdminPassword } from './session.js'

/**
 * 后台改密码。
 *
 * 为什么允许在「登录页」改：这是唯一不需要先进后台就能改密码的地方，
 * 忘了密码、或者想换成强密码时特别顺手。安全性靠两条：
 * 1. 必须先输对当前密码（复用登录那套失败计数与退避，避免这里变成爆破入口）；
 * 2. 新密码同样过强度校验，不能比原来的更弱。
 *
 * 写入的是 .env 的 ADMIN_PASSWORD。会话签名密钥由密码派生，
 * 所以改完之后所有旧登录（包括别的浏览器）立刻失效，这里再给当前浏览器换一张新票。
 */

/** .env 的解析规则：首尾成对的引号会被剥掉，换行会把值截断 */
function assertWritableIntoEnv(value) {
  if (/[\r\n]/.test(value)) {
    throw badRequest('新密码不能包含换行')
  }
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  if (quoted) {
    throw badRequest('新密码不要用首尾成对的引号包着：配置文件会把它剥掉，导致密码和你输入的不一致')
  }
}

export async function changeAdminPassword({ currentPassword, newPassword }, request) {
  const ip = request?.ip ?? ''
  const next = typeof newPassword === 'string' ? newPassword : ''

  // 1) 先验当前密码：这一步同时消耗失败计数，防止被拿来爆破
  const verified = await verifyAdminPassword(currentPassword, request, {
    action: 'change_password',
  })
  if (!verified.ok) {
    audit('blocked_password_change', { ip, detail: verified.locked ? 'locked out' : 'wrong current password' })
    throw forbidden(verified.locked ? verified.message : '当前密码不正确')
  }

  // 2) 新密码要能安全写进配置文件，并且足够安全
  assertWritableIntoEnv(next)

  const strength = evaluatePassword(next)
  if (!strength.safe) {
    throw badRequest(`${strength.reason}（当前要求至少 ${minimumPasswordLength()} 位）`)
  }

  if (next === getAdminPassword()) {
    throw badRequest('新密码和当前密码一样，不需要修改')
  }

  // 3) 写文件 + 回读校验；不一致就整体回滚，避免"密码变了但没人知道"
  const backup = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE) : null
  const written = persistAdminPassword(next)

  if (written !== next) {
    try {
      if (backup) fs.writeFileSync(ENV_FILE, backup)
    } catch {
      // 回滚失败也要把真实原因告诉调用方
    }
    audit('password_change_failed', { ip, detail: 'written value mismatch' })
    throw badRequest('新密码没能正确写入 .env（可能含有配置解析不支持的字符），请换一个再试')
  }

  audit('change_admin_password', { ip, detail: 'ok' })
  return { ok: true }
}
