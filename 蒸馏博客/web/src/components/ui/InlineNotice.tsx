import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

type NoticeTone = 'info' | 'success' | 'error'

interface InlineNoticeProps {
  tone?: NoticeTone
  children: React.ReactNode
  className?: string
}

const TONE_STYLES: Record<NoticeTone, string> = {
  info: 'border-line bg-surface-2 text-dim',
  success: 'border-emerald-600/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  error: 'border-[#B4322F]/30 bg-[#B4322F]/10 text-[#B4322F] dark:text-[#F08C7A]',
}

const TONE_ICONS = {
  info: Info,
  success: CircleCheck,
  error: CircleAlert,
}

/** 页面内的状态提示条，比弹窗轻，比 console 可见 */
export function InlineNotice({ tone = 'info', children, className }: InlineNoticeProps) {
  const Icon = TONE_ICONS[tone]

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-[12.5px] leading-[1.7] animate-fade-in',
        TONE_STYLES[tone],
        className,
      )}
    >
      <Icon size={15} strokeWidth={1.8} className="mt-0.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  )
}
