import crypto from 'node:crypto'

/**
 * 后台密码策略。
 *
 * 这个项目是单密码后台：密码一旦被猜中，攻击者就能进后台改模型地址，
 * 下一次对话把 LLM Key 原封不动送到他的服务器上。所以"密码够不够安全"
 * 不是建议，而是"能不能配置模型"的前置条件。
 *
 * 这里只放公开的常见口令，绝不写入任何真实在用的密码。
 */
const WEAK_PASSWORDS = new Set([
  'admin',
  'admin123',
  'admin888',
  'administrator',
  'password',
  'password1',
  'passw0rd',
  'p@ssw0rd',
  'change-me',
  'changeme',
  'changeme123',
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  '123123',
  '111111',
  '000000',
  'abc123',
  'qwerty',
  'qwerty123',
  'iloveyou',
  'letmein',
  'welcome',
  'woaini',
  'woaini1314',
  '5201314',
])

/**
 * 最短长度：默认 12 位。
 * 想放松可以用 .env 的 MIN_ADMIN_PASSWORD_LENGTH 覆盖（下限 6），
 * 但要知道：长度越短、越是键盘连排，越容易在几小时内被字典试出来。
 */
const DEFAULT_MIN_LENGTH = 12
const HARD_FLOOR = 6

export function minimumPasswordLength() {
  const parsed = Number.parseInt(process.env.MIN_ADMIN_PASSWORD_LENGTH ?? '', 10)
  if (Number.isFinite(parsed) && parsed >= HARD_FLOOR && parsed <= 64) return parsed
  return DEFAULT_MIN_LENGTH
}

/**
 * 评估后台密码强度。
 * @returns {{ safe: boolean, reason: string }}
 */
export function evaluatePassword(password) {
  const value = String(password ?? '')
  const minLength = minimumPasswordLength()

  if (!value) return { safe: false, reason: '还没有设置后台密码' }

  if (value.length < minLength) {
    return {
      safe: false,
      reason: `后台密码只有 ${value.length} 位，至少要有 ${minLength} 位`,
    }
  }

  if (WEAK_PASSWORDS.has(value.toLowerCase())) {
    return { safe: false, reason: '后台密码是常见口令，字典一猜就中' }
  }

  // 字符种类太少（纯数字、纯小写）也当弱口令：位数够但熵不够
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((pattern) =>
    pattern.test(value),
  ).length
  if (classes < 2) {
    return { safe: false, reason: '后台密码只用了同一类字符，建议字母 + 数字 + 符号混用' }
  }

  return { safe: true, reason: '' }
}

export function isWeakPassword(password) {
  return !evaluatePassword(password).safe
}

/** 生成一个 24 位的随机后台密码（首次启动时用） */
export function generateStrongPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%^*-_'
  let password = ''
  for (let index = 0; index < 24; index += 1) {
    // randomInt 是均匀分布，避免取模偏差
    password += chars[crypto.randomInt(0, chars.length)]
  }
  return password
}
