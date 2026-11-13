import crypto from 'node:crypto'
import os from 'node:os'

/**
 * 极简加密盒子：AES-256-GCM。
 *
 * 为什么要加密存 key：`.env` 是明文，一旦整个项目目录被打包/分享/上传备份，
 * key 就直接泄露出去了。改成「用会话密钥 + 机器指纹派生的密钥」加密后落盘，
 * 换一台机器或丢了 `.session-secret` 都解不开，等于多了一层保险。
 */
const ALGORITHM = 'aes-256-gcm'
const VERSION = 1

/** 机器指纹：优先用环境变量覆盖，方便迁移到新机器时手动指定 */
function machineFingerprint() {
  if (process.env.MACHINE_SECRET) return `custom:${process.env.MACHINE_SECRET}`
  return `${os.hostname()}|${os.platform()}|${os.arch()}`
}

/** 由会话密钥 + 机器指纹派生 32 字节密钥 */
function deriveKey(secret) {
  return crypto
    .createHash('sha256')
    .update(`chatblog-secret-v${VERSION}|${secret}|${machineFingerprint()}`)
    .digest()
}

/** 把任意可序列化的值加密成字符串 */
export function sealValue(value, secret) {
  const key = deriveKey(secret)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8')
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()

  return JSON.stringify({
    v: VERSION,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  })
}

/** 解密；密钥不对、机器变了、文件被改过都会返回 null，调用方按「没配置」处理 */
export function openValue(payload, secret) {
  try {
    const envelope = JSON.parse(payload)
    if (!envelope || envelope.v !== VERSION) return null

    const key = deriveKey(secret)
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(envelope.iv, 'base64'),
    )
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, 'base64')),
      decipher.final(),
    ])
    return JSON.parse(decrypted.toString('utf8'))
  } catch {
    return null
  }
}
