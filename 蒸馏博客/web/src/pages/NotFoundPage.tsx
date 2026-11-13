import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 text-center text-ink">
      <p className="font-serif text-[56px] leading-none text-accent">404</p>
      <h1 className="mt-4 font-serif text-[24px]">这页还没有写</h1>
      <p className="mt-2 text-[13.5px] text-dim">地址可能变了，也可能从来不存在。</p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-1.5 rounded-lg border border-line px-4 py-2 text-[13px] text-dim transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <ArrowLeft size={15} />
        回到主页
      </Link>
    </div>
  )
}
