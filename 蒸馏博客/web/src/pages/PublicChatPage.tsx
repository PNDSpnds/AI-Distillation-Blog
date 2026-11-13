import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ContentPreviewDialog } from '@/components/cards/ContentPreviewDialog'
import { ChatView } from '@/components/chat/ChatView'
import { EmptyState } from '@/components/chat/EmptyState'
import { AppShell } from '@/components/layout/AppShell'
import { useChat } from '@/hooks/useChat'
import { useProfile } from '@/lib/profile-context'
import { useDocumentTitle } from '@/lib/use-document-title'
import { cn } from '@/lib/utils'
import type { ContentCardData } from '@/types/chat'

/** 分享链接里问题长度上限，防止有人用超长 URL 塞垃圾 */
const MAX_SHARED_QUESTION = 200

/** 公开首页：空状态和对话状态叠在同一块区域上，用透明度过渡 */
export function PublicChatPage() {
  const { messages, hasMessages, isStreaming, sendMessage, stopStreaming, resetChat, regenerateLast } =
    useChat()
  const profile = useProfile()
  useDocumentTitle(`${profile.siteName} · 对话主页`)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [previewCard, setPreviewCard] = useState<ContentCardData | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  // 分享链接只自动发送一次，避免刷新或参数变化又发一遍
  const sharedQuestionSentRef = useRef(false)

  /**
   * `/?q=问题` 分享链接：进页面自动把问题发出去。
   * 发送后把 q 从地址栏去掉——否则刷新会重复发送，用户也会以为链接没生效。
   */
  useEffect(() => {
    if (sharedQuestionSentRef.current) return

    const raw = searchParams.get('q')
    if (!raw) return

    const question = raw.trim().slice(0, MAX_SHARED_QUESTION)
    sharedQuestionSentRef.current = true
    // 分享链接就是"我要问这个"，即使之前聊过也照发一次；发完立刻清掉地址栏参数
    if (question) sendMessage(question)
    setSearchParams({}, { replace: true })
  }, [hasMessages, searchParams, sendMessage, setSearchParams])

  const handleNewChat = useCallback(() => {
    resetChat()
    setMobileNavOpen(false)
  }, [resetChat])

  const closePreview = useCallback(() => setPreviewCard(null), [])

  return (
    <AppShell
      onNewChat={handleNewChat}
      mobileNavOpen={mobileNavOpen}
      onOpenMobileNav={() => setMobileNavOpen(true)}
      onCloseMobileNav={() => setMobileNavOpen(false)}
      showNewChatButton={hasMessages}
    >
      <div className="relative h-full min-h-0">
        {/* 空状态始终挂载，只做透明度和位移过渡；隐藏时不可点击、不可聚焦 */}
        <div
          aria-hidden={hasMessages}
          inert={hasMessages}
          className={cn(
            'absolute inset-0 transition-all duration-300 ease-out',
            hasMessages ? 'pointer-events-none -translate-y-2 opacity-0' : 'opacity-100',
          )}
        >
          <EmptyState onSend={sendMessage} isStreaming={isStreaming} onStop={stopStreaming} />
        </div>

        {hasMessages && (
          <div className="absolute inset-0 animate-fade-in">
            <ChatView
              messages={messages}
              isStreaming={isStreaming}
              onSend={sendMessage}
              onStop={stopStreaming}
              onRetry={regenerateLast}
              onPreviewCard={setPreviewCard}
            />
          </div>
        )}
      </div>

      <ContentPreviewDialog card={previewCard} onClose={closePreview} />
    </AppShell>
  )
}
