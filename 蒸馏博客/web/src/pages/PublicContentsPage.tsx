import { ArrowLeft, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ContentCard } from '@/components/cards/ContentCard'
import { BrandMark } from '@/components/ui/BrandMark'
import { InlineNotice } from '@/components/ui/InlineNotice'
import { ApiError, fetchPublicContents } from '@/lib/api'
import { useProfile } from '@/lib/profile-context'
import { useDocumentTitle } from '@/lib/use-document-title'
import { cn } from '@/lib/utils'
import { CONTENT_KIND_LABELS, type ContentCardData, type ContentKind } from '@/types/chat'
import type { AdminContent } from '@/types/content'

/** 没有封面时按标题取一个固定的渐变色，保证同一条内容每次都是同一个样子 */
const COVER_TONES = [
  'linear-gradient(135deg, #d98e6a 0%, #8c4a32 100%)',
  'linear-gradient(135deg, #7d8f7a 0%, #3f4f3d 100%)',
  'linear-gradient(135deg, #6f7f9a 0%, #354257 100%)',
  'linear-gradient(135deg, #a8837a 0%, #5f4642 100%)',
]

function toneFor(title: string) {
  let sum = 0
  for (const char of title) sum += char.codePointAt(0) ?? 0
  return COVER_TONES[sum % COVER_TONES.length]
}

/** 后端给的公开内容 → 卡片组件要的形状 */
function toCardData(item: AdminContent): ContentCardData {
  return {
    id: item.id,
    kind: item.kind as ContentKind,
    title: item.title,
    summary: item.summary,
    coverUrl: item.coverUrl || undefined,
    coverTone: toneFor(item.title),
    jumpUrl: item.jumpUrl || undefined,
    downloadUrl: item.downloadUrl || undefined,
  }
}

/** 内容库：把所有已上架内容列成一页，可按类型筛、按关键词搜 */
export function PublicContentsPage() {
  const profile = useProfile()
  const navigate = useNavigate()
  const [items, setItems] = useState<AdminContent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [kind, setKind] = useState<'' | ContentKind>('')

  useDocumentTitle(`内容 · ${profile.siteName}`)

  useEffect(() => {
    let cancelled = false

    fetchPublicContents()
      .then(({ items: data }) => {
        if (!cancelled) setItems(data)
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError instanceof ApiError ? requestError.message : '内容加载失败')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // 只在本地筛选：内容量不大，来回请求反而慢
  const kinds = useMemo(() => {
    const used = new Set(items.map((item) => item.kind))
    return [...used]
  }, [items])

  const visible = useMemo(() => {
    const text = keyword.trim().toLowerCase()
    return items.filter((item) => {
      if (kind && item.kind !== kind) return false
      if (!text) return true
      return `${item.title} ${item.summary} ${item.category} ${item.tags.join(' ')}`
        .toLowerCase()
        .includes(text)
    })
  }, [items, keyword, kind])

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[920px] items-center gap-2 px-5">
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

      <main className="mx-auto w-full max-w-[920px] px-5 py-8">
        <h1 className="font-serif text-[26px] font-medium leading-[1.35]">内容</h1>
        <p className="mt-1.5 text-[13px] leading-[1.8] text-dim">
          这里是我做的东西和写过的东西，按最新排序。想聊某一条，回到对话直接问就行。
        </p>

        {/* 工具栏：搜索 + 类型筛选，都是前端过滤 */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
            <Search size={14} className="shrink-0 text-dim" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜标题、简介、分类或标签"
              aria-label="搜索内容"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-dim/80"
            />
            {keyword && (
              <button
                type="button"
                onClick={() => setKeyword('')}
                aria-label="清空搜索"
                className="shrink-0 text-dim transition-colors hover:text-ink"
              >
                <X size={14} />
              </button>
            )}
          </label>

          {kinds.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setKind('')}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[12px] transition-colors',
                  kind === ''
                    ? 'border-accent/45 bg-accent-soft text-ink'
                    : 'border-line text-dim hover:bg-surface-2 hover:text-ink',
                )}
              >
                全部
              </button>
              {kinds.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setKind(key === kind ? '' : key)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-[12px] transition-colors',
                    kind === key
                      ? 'border-accent/45 bg-accent-soft text-ink'
                      : 'border-line text-dim hover:bg-surface-2 hover:text-ink',
                  )}
                >
                  {CONTENT_KIND_LABELS[key as ContentKind] ?? key}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="mt-5">
            <InlineNotice tone="error">{error}</InlineNotice>
          </div>
        )}

        {loading && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="h-[100px] animate-pulse rounded-xl bg-surface-2" />
            ))}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="mt-10 rounded-xl border border-line bg-surface px-5 py-10 text-center">
            <p className="text-[13.5px] text-ink">还没有公开的内容</p>
            <p className="mt-1.5 text-[12px] text-dim">
              上传并上架之后，这里会自动出现。现在也可以直接回到对话问我。
            </p>
            <Link
              to="/"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-[12.5px] text-dim transition-colors hover:bg-surface-2 hover:text-ink"
            >
              回到对话
            </Link>
          </div>
        )}

        {!loading && visible.length > 0 && (
          <>
            <p className="mt-5 text-[11.5px] text-dim">
              共 {visible.length} 条{keyword || kind ? `（全部 ${items.length} 条）` : ''}
            </p>
            <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
              {visible.map((item) => (
                <ContentCard
                  key={item.id}
                  card={toCardData(item)}
                  onOpen={(card) => navigate(`/p/${card.id}`)}
                />
              ))}
            </div>
          </>
        )}

        {!loading && items.length > 0 && visible.length === 0 && (
          <p className="mt-10 text-center text-[13px] text-dim">
            没有匹配的内容，换个关键词试试。
          </p>
        )}
      </main>

      <footer className="mx-auto w-full max-w-[920px] px-5 pb-10 text-[11px] text-dim">
        {profile.footer}
      </footer>
    </div>
  )
}
