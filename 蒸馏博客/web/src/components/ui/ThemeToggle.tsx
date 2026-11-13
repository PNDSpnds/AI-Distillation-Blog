import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  className?: string
  withLabel?: boolean
}

/** 深浅主题切换：图标显示的是“点下去会变成什么” */
export function ThemeToggle({ className, withLabel = false }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()
  const nextLabel = theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'
  const Icon = theme === 'dark' ? Sun : Moon

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={nextLabel}
      className={cn(
        'flex items-center gap-2.5 rounded-xl text-dim transition-colors hover:bg-surface-2 hover:text-ink',
        withLabel ? 'px-3 py-2.5 text-[13px]' : 'h-10 w-10 justify-center',
        className,
      )}
    >
      <Icon size={18} strokeWidth={1.7} />
      {withLabel && <span>{theme === 'dark' ? '浅色模式' : '深色模式'}</span>}
    </button>
  )
}
