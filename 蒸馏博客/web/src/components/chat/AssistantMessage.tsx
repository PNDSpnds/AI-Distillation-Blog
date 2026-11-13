import { ArrowUpRight, Check, ChevronDown, Copy, Link2, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { ContentCard } from '@/components/cards/ContentCard'
import { BrandMark } from '@/components/ui/BrandMark'
import { cn } from '@/lib/utils'
import type { AssistantChatMessage, ChatSource, ContentCardData } from '@/types/chat'

interface AssistantMessageProps {
  message: AssistantChatMessage
  onPreviewCard: (card: ContentCardData) => void
  onFollowup: (text: string) => void
  onRetry?: () => void
  /** 只有最后一条回答才给「重新生成」，避免把历史回答也重跑 */
  canRegenerate?: boolean
}

/** 依据区：默认收起，点开才展开，避免打扰"只是在聊天"的感觉 */
function SourceList({
  sources,
  cards,
  onPreviewCard,
}: {
  sources: ChatSource[]
  cards: ContentCardData[]
  onPreviewCard: (card: ContentCardData) => void
}) {
  const [open, setOpen] = useState(false)
  if (!sources || sources.length === 0) return null

  return (
    <div className="mt-3 animate-fade-in">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-[11.5px] text-dim transition-colors hover:text-ink"
      >
        <Link2 size={11} />
        依据 {sources.length} 条
        <ChevronDown
          size={11}
          className={cn('transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      {open && (
        <ul className="mt-1.5 space-y-1 animate-fade-up">
          {sources.map((source) => {
            // 内容类依据可以点开卡片；词条与资料片段只做展示
            const card = cards.find((item) => item.code === source.code)
            const clickable = Boolean(card)

            return (
              <li key={`${source.code}-${source.title}`}>
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => {
                    if (card) onPreviewCard(card)
                  }}
                  className={cn(
                    'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-left transition-colors',
                    clickable ? 'hover:border-accent/40 hover:bg-accent-soft/30' : 'cursor-default',
                  )}
                >
                  <span className="flex items-baseline gap-1.5">
                    <span className="shrink-0 rounded bg-surface-2 px-1 text-[10px] text-dim">
                      {source.label}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
                      {source.title}
                    </span>
                    {clickable && <ArrowUpRight size={11} className="shrink-0 text-dim" />}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** 把正文里的 [[c1]] 渲染成上标序号；旁边没有对应卡片时直接去掉标记 */
function renderContent(content: string, cards: ContentCardData[]) {
  // 模型常在 META 前多打几个换行，渲染前去掉尾部的空白
  const trimmed = content.replace(/\s+$/, '')
  if (!trimmed) return null

  const parts = trimmed.split(/\[\[(c\d+)\]\]/g)
  if (parts.length === 1) return trimmed

  return parts.map((part, index) => {
    // 奇数位是被捕获的编号
    if (index % 2 === 0) {
      // 上标前面不留空格，避免出现「没填 ¹ 。」这种空隙
      return <span key={index}>{part.replace(/\s+$/, '')}</span>
    }

    const cardIndex = cards.findIndex((card) => card.code === part)
    if (cardIndex === -1) return null

    return (
      <sup key={index} className="ml-0.5 text-[10px] text-accent">
        {cardIndex + 1}
      </sup>
    )
  })
}

/** 兜底复制：非 HTTPS 环境下 navigator.clipboard 不可用，退回 textarea + execCommand */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(area)
      return ok
    } catch {
      return false
    }
  }
}

/** 回答下方的轻量操作：复制、重新生成（只有最后一条能重跑） */
function MessageActions({
  content,
  canRegenerate,
  onRegenerate,
}: {
  content: string
  canRegenerate: boolean
  onRegenerate?: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const ok = await copyText(content)
    setCopied(ok)
    if (ok) window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="mt-2 flex items-center gap-3 text-[11.5px] text-dim">
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-1 transition-colors hover:text-ink"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? '已复制' : '复制'}
      </button>

      {canRegenerate && onRegenerate && (
        <button
          type="button"
          onClick={onRegenerate}
          className="inline-flex items-center gap-1 transition-colors hover:text-ink"
        >
          <RotateCcw size={12} />
          重新生成
        </button>
      )}
    </div>
  )
}

/** 一条回答：正文 + 出处卡片 + 追问；流式期间显示光标 */
export function AssistantMessage({
  message,
  onPreviewCard,
  onFollowup,
  onRetry,
  canRegenerate = false,
}: AssistantMessageProps) {
  return (
    <div className="flex gap-3 animate-fade-up md:gap-4">
      <BrandMark size="sm" className="mt-0.5 shrink-0" />

      <div className="min-w-0 flex-1">
        {message.status === 'thinking' && (
          <p className="animate-breathe text-[14px] leading-[1.9] text-dim">正在想…</p>
        )}

        {message.status === 'error' && (
          <div className="rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-dim">
            <span className="text-ink">{message.error || '没接上，再说一次？'}</span>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="ml-3 inline-flex items-center gap-1 text-accent hover:underline"
              >
                <RotateCcw size={13} />
                重试
              </button>
            )}
          </div>
        )}

        {(message.status === 'streaming' || message.status === 'done') && (
          <p className="whitespace-pre-wrap text-[15px] leading-[1.9] text-ink">
            {renderContent(message.content, message.cards)}
            {message.status === 'streaming' && (
              <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] animate-blink rounded-full bg-accent align-baseline" />
            )}
          </p>
        )}

        {/* 用了模型自己的常识时，在回答下面加一行小字，不打断正文 */}
        {/* 只说「含」：同一条回答常常是材料事实 + 常识补充混在一起，不能笼统说整条都是常识 */}
        {message.status === 'done' && message.usedGeneralKnowledge && (
          <p className="mt-1 text-[10.5px] leading-[1.6] text-dim/80 animate-fade-in">
            本回复含 AI 常识补充，非本人经历
          </p>
        )}

        {message.status === 'done' && message.content && (
          <MessageActions
            content={message.content}
            canRegenerate={canRegenerate}
            onRegenerate={onRetry}
          />
        )}

        {message.cards.length > 0 && (
          <div
            className={cn(
              'mt-4 grid gap-3',
              message.cards.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1',
            )}
          >
            {message.cards.map((card, index) => (
              <div
                key={card.id}
                className="animate-fade-up"
                style={{ animationDelay: `${80 + index * 70}ms` }}
              >
                <ContentCard card={card} onOpen={onPreviewCard} />
              </div>
            ))}
          </div>
        )}

        <SourceList sources={message.sources} cards={message.cards} onPreviewCard={onPreviewCard} />

        {message.followups.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {message.followups.map((followup, index) => (
              <button
                key={followup}
                type="button"
                onClick={() => onFollowup(followup)}
                className="group inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12.5px] text-dim transition-all duration-200 hover:border-accent/40 hover:bg-accent-soft hover:text-ink animate-fade-up"
                style={{ animationDelay: `${160 + index * 70}ms` }}
              >
                {followup}
                <ArrowUpRight
                  size={13}
                  strokeWidth={1.8}
                  className="text-dim transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
