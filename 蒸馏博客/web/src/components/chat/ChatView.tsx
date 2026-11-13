import { useEffect, useRef } from 'react'
import type { ChatMessage, ContentCardData } from '@/types/chat'
import { AssistantMessage } from './AssistantMessage'
import { Composer } from './Composer'
import { UserMessage } from './UserMessage'

interface ChatViewProps {
  messages: ChatMessage[]
  isStreaming: boolean
  onSend: (text: string) => void
  onStop: () => void
  onRetry: () => void
  onPreviewCard: (card: ContentCardData) => void
}

/** 对话状态：可滚动的消息流 + 固定在底部的输入框 */
export function ChatView({
  messages,
  isStreaming,
  onSend,
  onStop,
  onRetry,
  onPreviewCard,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)

  const handleScroll = () => {
    const element = scrollRef.current
    if (!element) return
    nearBottomRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 120
  }

  // 用户自己发了新消息时总是跟到底部；否则只在原本接近底部时跟随流式输出
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role === 'user' || nearBottomRef.current) {
      element.scrollTop = element.scrollHeight
      nearBottomRef.current = true
    }
  }, [messages])

  return (
    <div className="flex h-full min-h-0 flex-col animate-fade-in">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="chat-scroll min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-[780px] px-5 py-8 md:px-8 md:py-10">
          <div className="mb-8 flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-dim">
            <span className="h-px flex-1 bg-line" />
            对话
            <span className="h-px flex-1 bg-line" />
          </div>

          <div className="space-y-8">
            {messages.map((message, index) =>
              message.role === 'user' ? (
                <UserMessage key={message.id} message={message} />
              ) : (
                <AssistantMessage
                  key={message.id}
                  message={message}
                  onPreviewCard={onPreviewCard}
                  onFollowup={onSend}
                  onRetry={onRetry}
                  canRegenerate={!isStreaming && index === messages.length - 1}
                />
              ),
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-line/60 bg-bg/95 px-5 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:px-8">
        <div className="mx-auto w-full max-w-[780px]">
          <Composer variant="docked" onSend={onSend} isStreaming={isStreaming} onStop={onStop} />
        </div>
      </div>
    </div>
  )
}
