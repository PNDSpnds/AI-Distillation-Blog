import { ArrowLeft, LayoutDashboard, Library, LogOut, Settings, Sparkles, Upload } from 'lucide-react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { BrandMark } from '@/components/ui/BrandMark'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useAdminSession } from '@/hooks/useAdminSession'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/admin', label: '概览', icon: LayoutDashboard, match: (path: string) => path === '/admin' },
  { to: '/admin/contents', label: '内容管理', icon: Library, match: (path: string) => path === '/admin/contents' || /^\/admin\/contents\/.+\/edit$/.test(path) },
  { to: '/admin/contents/new', label: '上传内容', icon: Upload, match: (path: string) => path === '/admin/contents/new' },
  { to: '/admin/distill', label: '蒸馏', icon: Sparkles, match: (path: string) => path.startsWith('/admin/distill') },
  { to: '/admin/settings', label: '设置', icon: Settings, match: (path: string) => path.startsWith('/admin/settings') },
] as const

/** 后台外壳：左侧固定导航 + 移动端顶部横向标签 */
export function AdminLayout() {
  const { status, passwordNeedsChange, passwordWarning, logout } = useAdminSession()
  const location = useLocation()

  const handleLogout = async () => {
    // 退出后状态变 anonymous，下面的守卫会把页面送去登录页；
    // 这里只负责清会话，不再自己 navigate——否则守卫读到的已是 /admin/login，
    // 会把 next 记成 /admin/login，登录后又回到登录页，卡成死循环
    await logout()
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg text-[13px] text-dim">
        <span className="animate-breathe">正在确认登录状态…</span>
      </div>
    )
  }

  // 未登录直接送去登录页，带上来源地址方便登录后跳回
  // 用 router 的 location 而不是 window.location：状态切换时它才和即将渲染的路由一致
  if (status === 'anonymous') {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/admin/login?next=${encodeURIComponent(next)}`} replace />
  }

  return (
    <div className="flex min-h-dvh bg-bg text-ink">
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-line bg-sidebar px-3 py-4 md:flex">
        <Link
          to="/admin"
          className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-opacity hover:opacity-85"
        >
          <BrandMark />
          <span className="min-w-0">
            <span className="block truncate font-serif text-[15px] font-medium">管理后台</span>
            <span className="block text-[11px] text-dim">蒸馏与内容</span>
          </span>
        </Link>

        <nav className="mt-5 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = item.match(location.pathname)
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] transition-colors',
                  active
                    ? 'bg-surface text-ink'
                    : 'text-dim hover:bg-surface-2 hover:text-ink',
                )}
              >
                <Icon size={17} strokeWidth={1.7} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-1 border-t border-line pt-3">
          <ThemeToggle withLabel />
          <Link
            to="/"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] text-dim transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <ArrowLeft size={17} strokeWidth={1.7} />
            返回主页
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] text-dim transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <LogOut size={17} strokeWidth={1.7} />
            退出登录
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
          <div className="flex h-14 items-center gap-2 px-4 md:hidden">
            <BrandMark size="sm" />
            <span className="font-serif text-[14px] font-medium">管理后台</span>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="退出登录"
              className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-dim transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <LogOut size={17} strokeWidth={1.8} />
            </button>
          </div>

          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
            {NAV_ITEMS.map((item) => {
              const active = item.match(location.pathname)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] transition-colors',
                    active ? 'bg-surface-2 text-ink' : 'text-dim hover:bg-surface-2',
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {passwordNeedsChange && (
            <div className="border-t border-line bg-accent-soft px-4 py-2 text-[11.5px] text-accent md:px-6">
              后台密码不够安全：{passwordWarning}。请退出后在登录页点「修改密码」改成更强的密码。
            </div>
          )}
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-[980px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
