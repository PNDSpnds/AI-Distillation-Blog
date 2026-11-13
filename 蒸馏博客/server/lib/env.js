import fs from 'node:fs'
import path from 'node:path'

/**
 * 极简 .env 读取器。
 * 只支持 KEY=VALUE、# 注释、成对引号；已存在的环境变量优先，便于临时覆盖。
 */
export function loadEnv(rootDir) {
  const file = path.join(rootDir, '.env')
  if (!fs.existsSync(file)) return {}

  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  const parsed = {}

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const eqIndex = line.indexOf('=')
    if (eqIndex === -1) continue

    const key = line.slice(0, eqIndex).trim()
    if (!key) continue

    let value = line.slice(eqIndex + 1).trim()
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    if (quoted) value = value.slice(1, -1)

    parsed[key] = value
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }

  return parsed
}

/**
 * 把若干键写回 .env（保留原有注释与顺序）。
 * 只用于后台保存模型 key 这类必须落在配置文件里的值，不写进 db.json。
 */
export function writeEnvValues(rootDir, updates) {
  const file = path.join(rootDir, '.env')
  const pending = new Map(Object.entries(updates))

  const existing = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
    : ['# 对话式博客配置，由后台或手工维护']

  const output = existing.map((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return line

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) return line

    const key = trimmed.slice(0, eqIndex).trim()
    if (!pending.has(key)) return line

    const value = pending.get(key)
    pending.delete(key)
    return `${key}=${value}`
  })

  // 文件里原本没有的键追加到末尾
  for (const [key, value] of pending) {
    output.push(`${key}=${value}`)
  }

  while (output.length > 0 && output[output.length - 1].trim() === '') {
    output.pop()
  }

  fs.writeFileSync(file, `${output.join('\n')}\n`, 'utf8')
}

/** 把 key 处理成可展示的样子，只保留末尾 4 位 */
export function maskSecret(value) {
  if (!value) return ''
  if (value.length <= 8) return '••••'
  return `••••${value.slice(-4)}`
}
