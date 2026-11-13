import crypto from 'node:crypto'
import fs from 'node:fs'
import { TLS_CERT_FILE, TLS_KEY_FILE } from '../config.js'

/**
 * HTTPS 证书加载。
 *
 * 为什么让 Node 自己终结 TLS，而不是依赖外部反向代理：
 * 这个项目默认只听 127.0.0.1，交给 frp / 隧道做 TCP 透传就能直接对外提供 HTTPS，
 * 不需要额外装 Caddy/Nginx，也不用在服务器上再配一遍证书。部署形态最简单。
 *
 * 配置方式（三选一，优先级从高到低）：
 * 1. .env 里指定 TLS_CERT_FILE / TLS_KEY_FILE 的绝对路径；
 * 2. 把 fullchain.pem + privkey.pem 放进 data/certs/（默认位置）；
 * 3. 什么都不放 → 保持纯 HTTP（本机开发用）。
 */

/** 从证书里读域名与到期时间，用于启动自检提示 */
function describeCertificate(certPem) {
  try {
    const cert = new crypto.X509Certificate(certPem)
    return {
      subject: cert.subject.replace(/\n/g, ' / '),
      altNames: cert.subjectAltName || '',
      validTo: cert.validTo,
      daysLeft: Math.floor((new Date(cert.validTo) - Date.now()) / 86400000),
    }
  } catch {
    return null
  }
}

/**
 * 读取证书与私钥。
 * 返回 null 表示"没有配置 HTTPS"，调用方应继续用 http 起服务。
 * @returns {null | { cert: Buffer, key: Buffer, info: object }}
 */
export function loadTlsOptions({ certFile = TLS_CERT_FILE, keyFile = TLS_KEY_FILE } = {}) {
  const hasCert = fs.existsSync(certFile)
  const hasKey = fs.existsSync(keyFile)

  // 只放了一个文件：多半是漏拷，明确提示而不是静默降级到 http
  if (hasCert !== hasKey) {
    console.warn('')
    console.warn('  [!] HTTPS 证书或私钥只找到一半，已退回 HTTP：')
    console.warn(`  [${hasCert ? '有' : '缺'}] ${certFile}`)
    console.warn(`  [${hasKey ? '有' : '缺'}] ${keyFile}`)
    return null
  }

  if (!hasCert) return null

  let cert
  let key
  try {
    cert = fs.readFileSync(certFile)
    key = fs.readFileSync(keyFile)
  } catch (error) {
    console.warn(`  [!] 读取证书失败，已退回 HTTP：${error.message}`)
    return null
  }

  // 证书与私钥不配对时 https.createServer 也能起，但每次握手都失败，极难排查，所以这里先自检
  try {
    const leaf = new crypto.X509Certificate(cert)
    const fromCert = leaf.publicKey.export({ type: 'spki', format: 'pem' })
    const fromKey = crypto.createPublicKey(key).export({ type: 'spki', format: 'pem' })
    if (fromCert !== fromKey) {
      console.warn('')
      console.warn('  [!] 证书与私钥不匹配，已退回 HTTP。请确认两者来自同一张证书。')
      return null
    }
  } catch (error) {
    console.warn(`  [!] 证书或私钥格式不对，已退回 HTTP：${error.message}`)
    return null
  }

  return { cert, key, info: describeCertificate(cert) ?? {} }
}

/** 启动日志用的证书摘要 */
export function describeTls(info) {
  if (!info || !info.validTo) return []
  const lines = [`  证书域名：${info.altNames || info.subject}`]
  lines.push(`  到期时间：${new Date(info.validTo).toISOString().slice(0, 10)}（还剩 ${info.daysLeft} 天）`)
  if (info.daysLeft < 20) {
    lines.push('  [!] 证书快到期了，请尽快续期并替换 data/certs/ 里的两个文件')
  }
  return lines
}
