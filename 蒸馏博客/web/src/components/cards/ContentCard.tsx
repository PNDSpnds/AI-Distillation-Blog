import { ArrowUpRight, ChevronRight, Download } from 'lucide-react'
import { CONTENT_KIND_LABELS, type ContentCardData } from '@/types/chat'

interface ContentCardProps {
  card: ContentCardData
  onOpen: (card: ContentCardData) => void
}

/** 根据填写情况决定卡片动作：有下载文件就下载，否则打开链接，再否则看站内详情 */
function getAction(card: ContentCardData) {
  if (card.downloadUrl) return { label: '下载', icon: Download }
  if (card.jumpUrl) return { label: '打开', icon: ArrowUpRight }
  return { label: '查看', icon: ChevronRight }
}

/** 回答下方的内容卡片：封面 + 名称 + 简介 + 动作 */
export function ContentCard({ card, onOpen }: ContentCardProps) {
  const action = getAction(card)
  const ActionIcon = action.icon

  return (
    <button
      type="button"
      onClick={() => onOpen(card)}
      className="group flex w-full items-stretch gap-3 overflow-hidden rounded-xl border border-line bg-surface p-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/35 hover:bg-surface-2"
    >
      <span
        className="relative flex h-[74px] w-[92px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2"
        style={card.coverUrl ? undefined : { background: card.coverTone }}
      >
        {card.coverUrl ? (
          <img
            src={card.coverUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="select-none font-serif text-[30px] text-white/80">
            {card.title.slice(0, 1)}
          </span>
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
        <span>
          <span className="text-[10px] uppercase tracking-[0.16em] text-accent">
            {CONTENT_KIND_LABELS[card.kind]}
          </span>
          <span className="mt-0.5 block truncate text-[14px] font-medium text-ink">
            {card.title}
          </span>
          <span className="mt-1 line-clamp-2 block text-[12px] leading-[1.6] text-dim">
            {card.summary}
          </span>
        </span>

        <span className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] text-dim transition-colors group-hover:text-accent">
          <ActionIcon size={13} strokeWidth={1.8} />
          {action.label}
        </span>
      </span>
    </button>
  )
}
