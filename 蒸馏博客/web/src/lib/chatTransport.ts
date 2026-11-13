import type { ChatSource, ContentCardData } from '@/types/chat'

export interface ReplyPayload {
  cards: ContentCardData[]
  followups: string[]
  sources: ChatSource[]
  /** 这次回答用到了模型自己的常识 */
  general: boolean
}

export interface StreamCallbacks {
  onDelta: (text: string) => void
  onDone: (payload: ReplyPayload) => void
  onError: (error: Error) => void
}

export interface ChatTransport {
  /** 返回取消函数，用于“停止生成” */
  streamReply: (
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    callbacks: StreamCallbacks,
  ) => () => void
}

/**
 * 真实对话传输层：调用 /api/chat，解析 SSE。
 * 上层组件只依赖 ChatTransport 接口，换实现不用改 UI。
 */
export const httpTransport: ChatTransport = {
  streamReply(messages, callbacks) {
    const controller = new AbortController()
    let stopped = false

    const run = async () => {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
        signal: controller.signal,
      })

      if (!response.ok) {
        // 限流等错误走普通 JSON
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.message ?? `请求失败（${response.status}）`)
      }
      if (!response.body) throw new Error('浏览器不支持流式响应')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let payload: ReplyPayload = { cards: [], followups: [], sources: [], general: false }

      const handleEvent = (rawEvent: string) => {
        for (const line of rawEvent.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue

          const raw = trimmed.slice(5).trim()
          if (!raw) continue

          let event: {
            type?: string
            text?: string
            cards?: ContentCardData[]
            followups?: string[]
            sources?: ChatSource[]
            general?: boolean
            message?: string
          }
          try {
            event = JSON.parse(raw)
          } catch {
            continue
          }

          if (event.type === 'delta' && typeof event.text === 'string') {
            callbacks.onDelta(event.text)
            return
          }
          if (event.type === 'meta') {
            payload = {
              cards: Array.isArray(event.cards) ? event.cards : [],
              followups: Array.isArray(event.followups) ? event.followups : [],
              sources: Array.isArray(event.sources) ? event.sources : [],
              general: event.general === true,
            }
            return
          }
          if (event.type === 'error') {
            throw new Error(event.message || '模型没有返回结果')
          }
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        let separator = buffer.indexOf('\n\n')
        while (separator !== -1) {
          const rawEvent = buffer.slice(0, separator)
          buffer = buffer.slice(separator + 2)
          separator = buffer.indexOf('\n\n')
          handleEvent(rawEvent)
        }
      }

      // 服务端可能没发 done（比如异常），此时也算结束，避免界面卡在生成中
      if (!stopped) {
        callbacks.onDone(payload)
      }
    }

    run().catch((error: unknown) => {
      if (stopped || controller.signal.aborted) return
      callbacks.onError(error instanceof Error ? error : new Error(String(error)))
    })

    return () => {
      stopped = true
      controller.abort()
    }
  },
}
