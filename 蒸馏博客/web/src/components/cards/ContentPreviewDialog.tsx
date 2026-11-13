import { ArrowUpRight, Download, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { CONTENT_KIND_LABELS, type ContentCardData } from '@/types/chat'

interface ContentPreviewDialogProps {
  card: ContentCardData | null
  onClose: () => void
}

/** 卡片详情：能下载就给下载，有外链就跳转，都没有就展示正文 */
export function ContentPreviewDialog({ card, onClose }: ContentPreviewDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!card) return
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [card, onClose])

  useEffect(() => {
    if (!card) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [card])

  if (!card) return null

  const hasDownload = Boolean(card.downloadUrl)
  const hasJump = Boolean(card.jumpUrl)
  const body = (card.body ?? '').trim()

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 backdrop-blur-sm animate-fade-in md:items-center md:p-6"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="content-preview-title"
        onClick={(event) => event.stopPropagation()}
        className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-surface shadow-2xl animate-scale-in md:rounded-2xl"
      >
        <div
          className="relative h-36 w-full overflow-hidden bg-surface-2"
          style={card.coverUrl ? undefined : { background: card.coverTone }}
        >
          {card.coverUrl ? (
            <img src={card.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="absolute bottom-3 left-4 select-none font-serif text-[26px] text-white/85">
              {card.title.slice(0, 1)}
            </span>
          )}
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="关闭预览"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur transition-colors hover:bg-black/40"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 pb-[max(20px,env(safe-area-inset-bottom))]">
          <div className="text-[10px] uppercase tracking-[0.18em] text-accent">
            {CONTENT_KIND_LABELS[card.kind] ?? '内容'}
          </div>
          <h2
            id="content-preview-title"
            className="mt-1 font-serif text-[22px] font-medium text-ink"
          >
            {card.title}
          </h2>
          <p className="mt-2 text-[13.5px] leading-[1.85] text-dim">{card.summary}</p>

          {body && body !== card.summary && (
            <div className="mt-4 max-h-[36dvh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface-2/60 px-3.5 py-3 text-[13px] leading-[1.85] text-dim">
              {body}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {hasDownload && (
              <a
                href={card.downloadUrl}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-accent-contrast transition-all hover:brightness-105"
              >
                <Download size={15} strokeWidth={1.9} />
                下载
              </a>
            )}

            {hasJump && (
              <a
                href={card.jumpUrl}
                target="_blank"
                rel="noreferrer noopener"
                className={
                  hasDownload
                    ? 'inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-[13px] text-dim transition-colors hover:bg-surface-2 hover:text-ink'
                    : 'inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-accent-contrast transition-all hover:brightness-105'
                }
              >
                <ArrowUpRight size={15} strokeWidth={1.9} />
                打开链接
              </a>
            )}

            {!hasDownload && !hasJump && (
              <span className="text-[12px] text-dim">这条内容没有附件或外链</span>
            )}

            <Link
              to={`/p/${card.id}`}
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-[13px] text-dim transition-colors hover:bg-surface-2 hover:text-ink"
            >
              详情页
            </Link>

            <button
              type="button"
              onClick={onClose}
              className="ml-auto rounded-lg border border-line px-3.5 py-2 text-[13px] text-dim transition-colors hover:bg-surface-2 hover:text-ink"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
