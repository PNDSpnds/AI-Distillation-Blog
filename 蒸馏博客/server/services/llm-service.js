import { getDb } from '../repositories/db.js'
import { HttpError } from '../lib/http-error.js'
import { assertBaseUrlSafe } from '../lib/url-guard.js'
import { takeAdminAiQuota } from './quota-service.js'
import { getLlmKey } from './secret-store.js'

/** 读取当前生效的模型配置；Key 来自加密存储，永不落库也永不回传 */
export function resolveLlmConfig() {
  const { settings } = getDb()
  const baseUrl = (settings.model?.baseUrl || process.env.LLM_BASE_URL || 'https://api.deepseek.com')
    .trim()
    .replace(/\/+$/, '')
  const model = (settings.model?.model || process.env.LLM_MODEL || 'deepseek-flash').trim()
  const apiKey = getLlmKey()

  return { baseUrl, model, apiKey, configured: Boolean(apiKey) }
}

/**
 * 每次真正发请求前再校验一次地址。
 * 为什么不能只在保存时校验：库里可能躺着一条历史保存的私网地址（改代码之前存进去的），
 * 那种配置会在调用时把 Key 送给内网或攻击者服务器。
 */
async function resolveSafeConfig() {
  const config = resolveLlmConfig()
  if (!config.configured) {
    throw new HttpError(400, '还没有配置模型 API Key，请到后台「设置 → 模型服务」填写')
  }
  await assertBaseUrlSafe(config.baseUrl)
  return config
}

/**
 * 上游错误原文脱敏：极少数代理会在报错里回显请求头，
 * 万一把 Key 带出来就会写进日志或返回给浏览器，这里统一抹掉。
 */
function sanitizeUpstream(text, apiKey) {
  let output = String(text ?? '').slice(0, 300)
  if (apiKey && apiKey.length >= 8) {
    output = output.split(apiKey).join('••••')
  }
  // 兜底：把 sk- 开头的长串也抹掉
  return output.replace(/\b(sk|xai|gsk)-[A-Za-z0-9_-]{12,}/g, '••••')
}

/** 拼接对话接口地址：允许填到 /v1 或直接根路径，也允许直接填完整地址 */
function buildEndpoint(baseUrl) {
  if (baseUrl.endsWith('/chat/completions')) return baseUrl
  return `${baseUrl}/chat/completions`
}

/**
 * 非流式调用：蒸馏用（生成知识、人设草稿、题目都不需要逐字展示）。
 * jsonMode=true 时要求模型返回 JSON 对象，DeepSeek 与 OpenAI 都支持。
 */
export async function requestChatCompletion({
  messages,
  maxTokens = 2000,
  temperature = 0.4,
  jsonMode = false,
  signal,
}) {
  // 后台 AI 调用计入独立预算，防止后台失守后被用来刷爆 Key
  takeAdminAiQuota()
  const config = await resolveSafeConfig()

  const body = {
    model: config.model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: false,
  }
  if (jsonMode) body.response_format = { type: 'json_object' }

  const response = await fetch(buildEndpoint(config.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
    // 不允许跟随重定向：否则 30x 可以把请求（连同 Authorization 头）转到别的主机
    redirect: 'error',
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new HttpError(
      502,
      `模型服务返回 ${response.status}：${sanitizeUpstream(detail, config.apiKey) || '无内容'}`,
    )
  }

  const payload = await response.json()
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new HttpError(502, '模型没有返回内容')
  }
  return content
}

/**
 * 从模型输出里取出 JSON：容忍 ```json 包裹与前后多余文字
 */
export function parseJsonFromModel(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return null

  const stripped = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    return JSON.parse(stripped)
  } catch {
    // 继续尝试截取第一个 { 到最后一个 }
  }

  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end <= start) return null

  try {
    return JSON.parse(stripped.slice(start, end + 1))
  } catch {
    return null
  }
}

/**
 * 要求模型返回 JSON，并在解析失败时重试一次。
 *
 * 为什么需要重试：DeepSeek 这类带推理的模型，reasoning 也算在 max_tokens 里，
 * 预算偏小的时候正文 JSON 会被截断，表现就是「解析失败」而不是报错。
 * 所以第一次失败就把预算翻倍再试，仍然失败才放弃，避免让人重试按钮点好几次。
 */
export async function requestJsonCompletion({
  messages,
  maxTokens = 3000,
  temperature = 0.3,
  attempts = 2,
}) {
  let lastRaw = ''
  for (let index = 0; index < attempts; index += 1) {
    const budget = Math.min(maxTokens * 2 ** index, 8000)
    lastRaw = await requestChatCompletion({
      messages,
      maxTokens: budget,
      temperature,
      jsonMode: true,
    })

    const parsed = parseJsonFromModel(lastRaw)
    if (parsed) return parsed

    console.warn(`[llm] JSON 解析失败（第 ${index + 1} 次，max_tokens=${budget}）：`, lastRaw.slice(0, 500))
  }

  return null
}

/**
 * 流式调用 OpenAI 兼容接口。
 * 逐块回调正文，忽略模型内部的 reasoning_content（不展示给访客）。
 */
export async function streamChatCompletion({ messages, signal, onDelta, maxTokens = 800, temperature = 0.8 }) {
  // 访客对话的额度在路由层已经扣过，这里只做地址安全校验，不重复计数
  const config = await resolveSafeConfig()

  const response = await fetch(buildEndpoint(config.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
    signal,
    redirect: 'error',
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    // 把服务商的报错原文带出来，方便在后台/页面直接看到原因（Key 一律脱敏）
    throw new HttpError(
      502,
      `模型服务返回 ${response.status}：${sanitizeUpstream(detail, config.apiKey) || '无内容'}`,
    )
  }
  if (!response.body) {
    throw new HttpError(502, '模型服务没有返回数据流')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // SSE 以空行分隔事件；逐个取出 data: 负载
      let sepIndex = buffer.indexOf('\n\n')
      while (sepIndex !== -1) {
        const rawEvent = buffer.slice(0, sepIndex)
        buffer = buffer.slice(sepIndex + 2)
        sepIndex = buffer.indexOf('\n\n')

        for (const line of rawEvent.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue

          const payload = trimmed.slice(5).trim()
          if (!payload || payload === '[DONE]') continue

          try {
            const parsed = JSON.parse(payload)
            const delta = parsed?.choices?.[0]?.delta
            const text = delta?.content
            if (typeof text === 'string' && text) onDelta(text)
          } catch {
            // 单个事件解析失败不影响整体流
          }
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {})
  }
}
