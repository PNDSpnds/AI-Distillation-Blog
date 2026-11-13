import { Library, Settings, SquarePen } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { BrandMark } from '@/components/ui/BrandMark'
import { RailButton } from '@/components/ui/RailButton'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

interface SidebarProps {
  onNewChat: () => void
}

/** 桌面端左侧窄栏：只放图标，给对话区留出最大宽度 */
export function Sidebar({ onNewChat }: SidebarProps) {
  const { pathname } = useLocation()

  return (
    <aside className="hidden w-[68px] shrink-0 flex-col items-center border-r border-line bg-sidebar py-4 md:flex">
      <Link to="/" aria-label="回到首页" className="mb-5 transition-opacity hover:opacity-80">
        <BrandMark />
      </Link>

      <div className="flex flex-col items-center gap-1.5">
        <RailButton label="新对话" icon={SquarePen} active onClick={onNewChat} />
        <RailButton label="内容" icon={Library} to="/contents" active={pathname === '/contents'} />
      </div>

      <div className="mt-auto flex flex-col items-center gap-1.5">
        <ThemeToggle />
        <RailButton label="后台" icon={Settings} to="/admin" />
      </div>
    </aside>
  )
}
