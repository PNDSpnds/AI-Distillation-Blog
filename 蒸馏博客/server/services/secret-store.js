import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR, ROOT_DIR, SESSION_SECRET } from '../config.js'
import { writeEnvValues } from '../lib/env.js'
import { openValue, sealValue } from '../lib/secret-box.js'

/**
 * 模型 API Key 的安全存储。
 *
 * 三条规矩：
 * 1. 不写 `.env`（明文，容易被随项目一起打包带走）。
 * 2. 不写 `db.json`（会跟着自动备份和后台下载跑出去）。
 * 3. 只存在 `data/secrets/llm-key.enc`，AES-256-GCM 加密，密钥由会话密钥 + 机器指纹派生。
 *
 * 副作用：把项目整体拷到另一台机器后，key 解不开，需要重新填一次。这是有意为之。
 */
const SECRET_DIR = path.join(DATA_DIR, 'secrets')
const KEY_FILE = path.join(SECRET_DIR, 'llm-key.enc')

let cached = null
let loaded = false

function ensureDir() {
  fs.mkdirSync(SECRET_DIR, { recursive: true })
}

/** 把文件权限收紧成只有当前用户可读写（Windows 上基本无效果，Linux/macOS 有效） */
function lockDown(filePath) {
  try {
    fs.chmodSync(filePath, 0o600)
  } catch {
    // 某些文件系统不支持 chmod，忽略
  }
}

function readFileValue() {
  if (!fs.existsSync(KEY_FILE)) return null
  const opened = openValue(fs.readFileSync(KEY_FILE, 'utf8'), SESSION_SECRET)
  return typeof opened?.apiKey === 'string' && opened.apiKey ? opened : null
}

/**
 * 读取当前 key。
 * 首次读取时会尝试把旧版本存在 `.env` 里的明文 key 迁移到加密文件，并清掉明文。
 */
export function getLlmKey() {
  if (loaded) return cached
  loaded = true

  const stored = readFileValue()
  if (stored) {
    cached = stored.apiKey
    return cached
  }

  const legacy = (process.env.LLM_API_KEY || '').trim()
  if (legacy) {
    try {
      ensureDir()
      fs.writeFileSync(KEY_FILE, sealValue({ apiKey: legacy }, SESSION_SECRET), 'utf8')
      lockDown(KEY_FILE)
      // 清掉 .env 里的明文，避免迁移后还留一份
      writeEnvValues(ROOT_DIR, { LLM_API_KEY: '' })
      console.log('[security] 已把 .env 里的模型 Key 迁移到加密存储，并清空明文')
      cached = legacy
      return cached
    } catch (error) {
      console.warn(`[security] 迁移模型 Key 失败：${error.message}`)
      cached = legacy
      return cached
    }
  }

  cached = ''
  return cached
}

/** 保存新 key（覆盖） */
export function setLlmKey(apiKey) {
  const key = String(apiKey ?? '').trim()
  if (!key) return

  ensureDir()
  fs.writeFileSync(KEY_FILE, sealValue({ apiKey: key }, SESSION_SECRET), 'utf8')
  lockDown(KEY_FILE)
  cached = key
  loaded = true
  // 顺手清掉可能残留的明文
  writeEnvValues(ROOT_DIR, { LLM_API_KEY: '' })
}

/** 清除 key */
export function clearLlmKey() {
  if (fs.existsSync(KEY_FILE)) fs.rmSync(KEY_FILE, { force: true })
  cached = ''
  loaded = true
  writeEnvValues(ROOT_DIR, { LLM_API_KEY: '' })
}

export function hasLlmKey() {
  return Boolean(getLlmKey())
}

/** 启动自检：加密文件存在但解不开时提示重新填写 */
export function getKeyStorageWarning() {
  if (!fs.existsSync(KEY_FILE)) return ''
  if (readFileValue()) return ''
  return '模型 Key 已加密保存，但当前机器解不开（换过机器或丢失过会话密钥）。请到设置页重新填写。'
}
