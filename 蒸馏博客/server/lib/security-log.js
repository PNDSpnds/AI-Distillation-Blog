import fs from 'node:fs'
import path from 'node:path'
import { LOG_DIR } from '../config.js'

/**
 * 安全审计日志。
 * 只记「谁在什么时候做了什么敏感操作」，永远不记 key、密码等具体值。
 */
const FILE = path.join(LOG_DIR, 'security.log')
/** 单文件上限，超过就滚一份 .1，避免日志无限长大 */
const MAX_BYTES = 1024 * 1024

function rotateIfNeeded() {
  try {
    const stat = fs.statSync(FILE)
    if (stat.size < MAX_BYTES) return
    fs.renameSync(FILE, `${FILE}.1`)
  } catch {
    // 文件不存在就算了
  }
}

/**
 * 写一条审计记录。
 * @param {string} action 动作，例如 login_failed / change_base_url / change_llm_key
 * @param {{ ip?: string, detail?: string }} extra 附加信息（不含敏感值）
 */
export function audit(action, extra = {}) {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    action,
    ip: extra.ip ?? '',
    detail: extra.detail ?? '',
  })

  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    rotateIfNeeded()
    fs.appendFileSync(FILE, `${line}\n`, 'utf8')
  } catch {
    // 日志失败不能影响主流程
  }

  if (action !== 'login_failed') return
  console.warn(`[security] ${action} ${line}`)
}
