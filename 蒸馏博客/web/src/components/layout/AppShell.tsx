import { Menu, SquarePen } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { BrandMark } from '@/components/ui/BrandMark'
import { useProfile } from '@/lib/profile-context'
import { MobileNav } from './MobileNav'
import { Sidebar } from './Sidebar'

interface AppShellProps {
  children: ReactNode
  onNewChat: () => void
  mobileNavOpen: boolean
  onOpenMobileNav: () => void
  onCloseMobileNav: () => void
  showNewChatButton?: boolean
}

/** 全站外壳：桌面窄栏 + 移动端顶部栏 + 抽屉导航 */
export function AppShell({
  children,
  onNewChat,
  mobileNavOpen,
  onOpenMobileNav,
  onCloseMobileNav,
  showNewChatButton = true,
}: AppShellProps) {
  const profile = useProfile()

  // 抽屉打开时锁住页面滚动，避免背景跟着滑动
  useEffect(() => {
    if (!mobileNavOpen) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [mobileNavOpen])

  // Esc 关闭移动端抽屉
  useEffect(() => {
    if (!mobileNavOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseMobileNav()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [mobileNavOpen, onCloseMobileNav])

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg text-ink">
      <Sidebar onNewChat={onNewChat} />
      <MobileNav open={mobileNavOpen} onClose={onCloseMobileNav} onNewChat={onNewChat} />

      <div className="flex min-w-0 flex-1 flex-col" inert={mobileNavOpen}>
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={onOpenMobileNav}
            aria-label="打开菜单"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-dim transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Menu size={20} strokeWidth={1.7} />
          </button>

          <div className="flex min-w-0 items-center gap-2">
            <BrandMark size="sm" />
            <span className="truncate font-serif text-[15px] font-medium">
              {profile.siteName}
            </span>
          </div>

          <div className="ml-auto">
            {showNewChatButton && (
              <button
                type="button"
                onClick={onNewChat}
                aria-label="新对话"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-dim transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <SquarePen size={18} strokeWidth={1.7} />
              </button>
            )}
          </div>
        </header>

        <main className="relative min-h-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
