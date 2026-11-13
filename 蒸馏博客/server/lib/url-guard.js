import dns from 'node:dns/promises'
import { badRequest } from './http-error.js'

/**
 * 模型服务地址校验。
 *
 * 为什么需要：模型 Key 会以 `Authorization: Bearer …` 的形式发到 baseUrl。
 * 一旦后台会话被盗（XSS、Cookie 泄露、弱密码），攻击者只要把 baseUrl 改成自己的域名，
 * 下一次聊天就会把 key 原封不动送到他手里。所以这里必须：
 * 1. 只允许 http/https；
 * 2. 明确禁止 file:/javascript:/data: 这类协议；
 * 3. 拦住内网与本机地址（防 SSRF）；
 * 4. 公网地址必须是 HTTPS，否则 key 明文传输；
 * 5. 变更地址时额外要求输入后台密码（在 settings-service 里做）。
 *
 * 自建本地模型（Ollama 之类）确实需要内网地址：用 .env 的 LLM_ALLOW_PRIVATE=1 显式放行。
 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

/** 内网/本机/保留地址：默认一律拒绝，避免被当成 SSRF 跳板 */
export function isPrivateHost(hostname) {
  if (!hostname) return true
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')

  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host.endsWith('.internal') || host.endsWith('.local')) return true
  if (host === '::1' || host === '::' || host === '0.0.0.0') return true

  // IPv6：fc00::/7（唯一本地）、fe80::/10（链路本地）、IPv4 映射地址
  if (host.includes(':')) {
    if (/^f[cd][0-9a-f]{2}:/.test(host)) return true
    if (/^fe[89ab][0-9a-f]:/.test(host)) return true
    const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateHost(mapped[1])
    return false
  }

  if (/^127\./.test(host)) return true
  if (/^10\./.test(host)) return true
  if (/^192\.168\./.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true
  if (/^169\.254\./.test(host)) return true
  // CGNAT 与云厂商元数据常用的保留段
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return true
  if (/^0\./.test(host)) return true
  if (/^198\.1[89]\./.test(host)) return true
  return false
}

/** 解析域名后逐个检查，防止 "公网域名解析到 127.0.0.1" 这类绕过 */
async function assertResolvedAddressSafe(hostname) {
  let addresses
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true })
  } catch {
    throw badRequest('模型服务地址解析不了，请检查域名是否正确')
  }

  if (!addresses.length) throw badRequest('模型服务地址解析不到任何 IP')
  for (const entry of addresses) {
    if (isPrivateHost(entry.address)) {
      throw badRequest('模型服务地址指向了内网/本机，出于安全考虑不允许')
    }
  }
}

/**
 * 校验并归一化 baseUrl（只做格式与协议判断，不解析 DNS）。
 * @returns {{ url: string, isPrivate: boolean, isInsecure: boolean }}
 */
export function normalizeBaseUrl(input) {
  const raw = String(input ?? '').trim().replace(/\/+$/, '')
  if (!raw) throw badRequest('模型服务地址不能为空')

  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw badRequest('模型服务地址格式不对，应该像 https://api.deepseek.com 这样')
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw badRequest('模型服务地址只支持 http 或 https')
  }
  if (parsed.username || parsed.password) {
    throw badRequest('模型服务地址里不能带用户名密码')
  }
  if (!parsed.hostname) throw badRequest('模型服务地址缺少域名')

  return {
    url: raw,
    isPrivate: isPrivateHost(parsed.hostname),
    isInsecure: parsed.protocol === 'http:',
  }
}

/**
 * 保存 / 调用前的强制校验：格式 + 私网 + HTTPS。
 * LLM_ALLOW_PRIVATE=1 时放行内网地址（自建模型），公网地址仍然必须 https。
 */
export async function assertBaseUrlSafe(input) {
  const { url, isPrivate, isInsecure } = normalizeBaseUrl(input)
  const allowPrivate = process.env.LLM_ALLOW_PRIVATE === '1'
  const parsed = new URL(url)

  if (isPrivate && !allowPrivate) {
    throw badRequest(
      '模型服务地址不能是内网或本机地址。确实要用本地模型（如 Ollama），请在 .env 里设 LLM_ALLOW_PRIVATE=1',
    )
  }

  if (isInsecure && !isPrivate) {
    throw badRequest('模型服务地址必须是 https://，否则 API Key 会在网络上明文传输')
  }

  if (!isPrivate) await assertResolvedAddressSafe(parsed.hostname)

  return { url, isPrivate, isInsecure }
}
