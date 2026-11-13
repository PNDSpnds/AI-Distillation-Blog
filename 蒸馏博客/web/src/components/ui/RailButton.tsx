import type { LucideIcon } from 'lucide-react'
import type { MouseEventHandler } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface RailButtonProps {
  label: string
  icon: LucideIcon
  active?: boolean
  to?: string
  onClick?: MouseEventHandler<HTMLButtonElement>
}

/** 左侧窄栏上的图标按钮，悬停时在右侧显示文字提示 */
export function RailButton({ label, icon: Icon, active, to, onClick }: RailButtonProps) {
  const base = cn(
    'group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200',
    active ? 'bg-surface-2 text-ink' : 'text-dim hover:bg-surface-2 hover:text-ink',
  )

  const tooltip = (
    <span className="pointer-events-none absolute left-full top-1/2 z-30 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
      {label}
    </span>
  )

  if (to) {
    return (
      <Link to={to} aria-label={label} className={base}>
        <Icon size={19} strokeWidth={1.7} />
        {tooltip}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} aria-label={label} className={base}>
      <Icon size={19} strokeWidth={1.7} />
      {tooltip}
    </button>
  )
}
