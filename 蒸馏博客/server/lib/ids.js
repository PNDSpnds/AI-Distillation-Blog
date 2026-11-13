import crypto from 'node:crypto'

/** 生成短 id：前缀 + 时间戳 + 随机串，足够本地单机使用且可读 */
export function createId(prefix = 'c') {
  const time = Date.now().toString(36)
  const random = crypto.randomBytes(4).toString('hex')
  return `${prefix}_${time}${random}`
}

/** 生成安全的文件名：只保留扩展名，主体用随机串 */
export function createStoredName(originalName) {
  const ext = (originalName.match(/\.[a-zA-Z0-9]{1,8}$/)?.[0] ?? '').toLowerCase()
  return `${Date.now().toString(36)}${crypto.randomBytes(6).toString('hex')}${ext}`
}
