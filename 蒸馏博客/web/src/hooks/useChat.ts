import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { httpTransport } from '@/lib/chatTransport'
import { clearConversation, loadConversation, saveConversation } from '@/lib/chat-storage'
import { createId } from '@/lib/utils'
import type { AssistantChatMessage, ChatMessage } from '@/types/chat'

/**
 * 对话状态管理。
 * 真实链路：把历史消息发给 /api/chat，逐字接收正文，最后补上卡片、追问与依据。
 * 历史同步到 localStorage，刷新页面不丢。
 */
export function useChat() {
  // 初始值直接从本地读，避免先渲染空状态再"跳"出历史
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadConversation())
  const [isStreaming, setIsStreaming] = useState(false)
  const cancelRef = useRef<null | (() => void)>(null)
  const activeAssistantIdRef = useRef<string | null>(null)
  // 保存最新消息，避免发送时拿到旧闭包
  const messagesRef = useRef<ChatMessage[]>([])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // 每次消息变化都落一次本地；生成中也会存，刷新后至少能看到已经出来的部分
  useEffect(() => {
    saveConversation(messages)
  }, [messages])

  const stopStreaming = useCallback(() => {
    cancelRef.current?.()
    cancelRef.current = null
    const activeId = activeAssistantIdRef.current
    activeAssistantIdRef.current = null
    setIsStreaming(false)
    if (!activeId) return

    setMessages((prev) =>
      prev.flatMap((message) => {
        if (message.id !== activeId || message.role !== 'assistant') return [message]
        // 一个字都还没出来时，直接移除空消息
        if (!message.content) return []
        return [{ ...message, status: 'done' as const }]
      }),
    )
  }, [])

  const resetChat = useCallback(() => {
    cancelRef.current?.()
    cancelRef.current = null
    activeAssistantIdRef.current = null
    setIsStreaming(false)
    setMessages([])
    clearConversation()
  }, [])

  const runReply = useCallback((history: Array<{ role: 'user' | 'assistant'; content: string }>) => {
    const assistantId = createId()
    const assistantMessage: AssistantChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      status: 'thinking',
      cards: [],
      followups: [],
      sources: [],
      createdAt: Date.now(),
    }

    activeAssistantIdRef.current = assistantId
    setIsStreaming(true)
    setMessages((prev) => [...prev, assistantMessage])

    cancelRef.current = httpTransport.streamReply(history, {
      onDelta: (delta) => {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId && message.role === 'assistant'
              ? { ...message, content: message.content + delta, status: 'streaming' }
              : message,
          ),
        )
      },
      onDone: ({ cards, followups, sources, general }) => {
        cancelRef.current = null
        activeAssistantIdRef.current = null
        setIsStreaming(false)
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId && message.role === 'assistant'
              ? {
                  ...message,
                  status: 'done',
                  cards,
                  followups,
                  sources,
                  usedGeneralKnowledge: general,
                }
              : message,
          ),
        )
      },
      onError: (error) => {
        cancelRef.current = null
        activeAssistantIdRef.current = null
        setIsStreaming(false)
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId && message.role === 'assistant'
              ? { ...message, status: 'error', error: error.message }
              : message,
          ),
        )
      },
    })
  }, [])

  const sendMessage = useCallback(
    (rawText: string) => {
      const text = rawText.trim()
      if (!text || isStreaming) return

      const userMessage: ChatMessage = {
        id: createId(),
        role: 'user',
        content: text,
        createdAt: Date.now(),
      }

      // 只带真正有内容的助手消息，避免空回复污染上下文
      const history = messagesRef.current
        .filter((message) => message.role === 'user' || message.content)
        .map((message) => ({ role: message.role, content: message.content }))

      setMessages((prev) => [...prev, userMessage])
      runReply([...history, { role: 'user', content: text }])
    },
    [isStreaming, runReply],
  )

  /** 重跑最后一条问题：删掉它后面的回答，用同样的历史再问一次（报错时是重试，正常时是重新生成） */
  const regenerateLast = useCallback(() => {
    if (isStreaming) return

    const current = messagesRef.current
    const lastUserIndex = [...current].reverse().findIndex((message) => message.role === 'user')
    if (lastUserIndex === -1) return

    const index = current.length - 1 - lastUserIndex
    const lastUser = current[index]
    if (!lastUser || lastUser.role !== 'user') return

    const history = current
      .slice(0, index)
      .filter((message) => message.role === 'user' || message.content)
      .map((message) => ({ role: message.role, content: message.content }))

    // 移除上次的失败回答，避免界面里堆两条
    setMessages(current.slice(0, index + 1))
    runReply([...history, { role: 'user', content: lastUser.content }])
  }, [isStreaming, runReply])

  useEffect(() => {
    return () => {
      cancelRef.current?.()
    }
  }, [])

  const hasMessages = useMemo(() => messages.length > 0, [messages])

  return {
    messages,
    hasMessages,
    isStreaming,
    sendMessage,
    stopStreaming,
    resetChat,
    regenerateLast,
  }
}
