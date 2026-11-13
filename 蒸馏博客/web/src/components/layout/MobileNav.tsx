import { Library, Settings, SquarePen, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { BrandMark } from '@/components/ui/BrandMark'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useProfile } from '@/lib/profile-context'
import { cn } from '@/lib/utils'

interface MobileNavProps {
  open: boolean
  onClose: () => void
  onNewChat: () => void
}

const navItems = [
  { id: 'new', label: '新对话', hint: '从空白开始', icon: SquarePen },
  { id: 'contents', label: '内容', hint: '看看我做过什么', icon: Library },
] as const

/** 移动端抽屉导航：保留桌面窄栏的入口，但显示完整文字 */
export function MobileNav({ open, onClose, onNewChat }: MobileNavProps) {
  const profile = useProfile()
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // 打开后把焦点移进抽屉，关闭时 inert 会阻止 Tab 跑到屏幕外
  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => closeButtonRef.current?.focus(), 60)
    return () => window.clearTimeout(timer)
  }, [open])

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 md:hidden',
        open ? 'pointer-events-auto' : 'pointer-events-none',
      )}
      aria-hidden={!open}
      inert={!open}
    >
      <div
        className={cn(
          'absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
        role="presentation"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="站点导航"
        className={cn(
          'absolute inset-y-0 left-0 flex w-[280px] flex-col border-r border-line bg-sidebar p-4 transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-2.5 px-1 pb-4">
          <BrandMark />
          <div className="min-w-0">
            <p className="truncate font-serif text-[16px] font-medium">{profile.siteName}</p>
            <p className="truncate text-[11px] text-dim">个人对话主页</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="关闭菜单"
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-dim transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        <div className="h-px bg-line" />

        <nav className="mt-3 flex flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const rowClass =
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2'
            const body = (
              <>
                <Icon size={18} strokeWidth={1.7} className="shrink-0 text-dim" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] text-ink">{item.label}</span>
                  <span className="mt-0.5 block text-[11px] text-dim">{item.hint}</span>
                </span>
              </>
            )

            // 「内容」是真的会跳转的页面，其余是动作按钮
            return item.id === 'contents' ? (
              <Link key={item.id} to="/contents" onClick={onClose} className={rowClass}>
                {body}
              </Link>
            ) : (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onNewChat()
                  onClose()
                }}
                className={rowClass}
              >
                {body}
              </button>
            )
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-1 border-t border-line pt-3">
          <ThemeToggle withLabel />
          <Link
            to="/admin"
            onClick={onClose}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] text-dim transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Settings size={18} strokeWidth={1.7} />
            后台
          </Link>
        </div>
      </aside>
    </div>
  )
}
