import { ArrowLeft, ArrowUpRight, Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { InlineNotice } from '@/components/ui/InlineNotice'
import { BrandMark } from '@/components/ui/BrandMark'
import { ApiError, fetchPublicContent } from '@/lib/api'
import { useProfile } from '@/lib/profile-context'
import { useDocumentTitle } from '@/lib/use-document-title'
import { CONTENT_KIND_LABELS } from '@/types/chat'
import type { AdminContent } from '@/types/content'

/** 站内内容详情页：卡片没有外链时，访客在这里读全文 */
export function PublicContentPage() {
  const { id } = useParams<{ id: string }>()
  const profile = useProfile()
  const [item, setItem] = useState<AdminContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    let cancelled = false

    fetchPublicContent(id)
      .then(({ item: data }) => {
        if (!cancelled) setItem(data)
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(
            requestError instanceof ApiError ? requestError.message : '内容加载失败',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  // 打开详情页时把标签页标题换成内容标题；加载完成前先用站点名占位
  useDocumentTitle(item ? `${item.title} · ${profile.siteName}` : profile.siteName)

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[720px] items-center gap-2 px-5">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[12.5px] text-dim transition-colors hover:text-ink"
          >
            <ArrowLeft size={15} />
            回到对话
          </Link>
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-dim">
            <BrandMark size="sm" />
            {profile.siteName}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[720px] px-5 py-8">
        {loading && (
          <div className="space-y-3">
            <div className="h-6 w-24 animate-pulse rounded bg-surface-2" />
            <div className="h-10 w-3/4 animate-pulse rounded bg-surface-2" />
            <div className="h-40 animate-pulse rounded-xl bg-surface-2" />
          </div>
        )}

        {!loading && error && (
          <InlineNotice tone="error">{error}</InlineNotice>
        )}

        {!loading && item && (
          <article className="animate-fade-up">
            {item.coverUrl && (
              <div className="mb-5 overflow-hidden rounded-xl border border-line">
                <img
                  src={item.coverUrl}
                  alt=""
                  className="max-h-[320px] w-full object-cover"
                  loading="eager"
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-dim">
              <span className="rounded bg-accent-soft px-2 py-0.5 text-accent">
                {CONTENT_KIND_LABELS[item.kind] ?? item.kindLabel}
              </span>
              {item.category && <span>{item.category}</span>}
              <span>{(item.publishedAt || item.createdAt)?.slice(0, 10)}</span>
            </div>

            <h1 className="mt-3 font-serif text-[28px] font-medium leading-[1.35]">
              {item.title}
            </h1>
            <p className="mt-3 text-[14px] leading-[1.85] text-dim">{item.summary}</p>

            {item.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {item.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-line px-2 py-0.5 text-[11px] text-dim"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {item.body && (
              <div className="mt-6 whitespace-pre-wrap border-l-2 border-line pl-4 text-[15px] leading-[1.9] text-ink">
                {item.body}
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-2">
              {item.downloadUrl && (
                <a
                  href={item.downloadUrl}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accent-contrast transition-all hover:brightness-105"
                >
                  <Download size={15} strokeWidth={1.9} />
                  下载{item.fileName ? ` · ${item.fileName}` : ''}
                </a>
              )}
              {item.jumpUrl && (
                <a
                  href={item.jumpUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-4 py-2 text-[13px] text-dim transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <ArrowUpRight size={15} strokeWidth={1.9} />
                  打开原链接
                </a>
              )}
            </div>
          </article>
        )}
      </main>

      <footer className="mx-auto w-full max-w-[720px] px-5 pb-10 text-[11px] text-dim">
        {profile.footer}
      </footer>
    </div>
  )
}
