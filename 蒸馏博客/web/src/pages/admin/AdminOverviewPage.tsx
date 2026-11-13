import { ArrowUpRight, Database, FileText, Layers, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { InlineNotice } from '@/components/ui/InlineNotice'
import {
  ApiError,
  fetchBackups,
  fetchChatStatus,
  fetchContents,
  type ContentSort,
} from '@/lib/api'
import { CONTENT_KIND_LABELS, type ContentKind } from '@/types/chat'
import type { AdminContentListItem, BackupItem } from '@/types/content'

const RECENT_SORT: ContentSort = 'latest'

/** 后台概览：一眼看到内容规模、回收站、备份和模型状态 */
export function AdminOverviewPage() {
  const [items, setItems] = useState<AdminContentListItem[]>([])
  const [trashCount, setTrashCount] = useState(0)
  const [backups, setBackups] = useState<BackupItem[]>([])
  const [model, setModel] = useState<{ configured: boolean; model: string } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    Promise.all([
      fetchContents({ sort: RECENT_SORT }),
      fetchContents({ trash: true }),
      fetchBackups(),
      fetchChatStatus(),
    ])
      .then(([list, trash, backupList, status]) => {
        if (cancelled) return
        setItems(list.items)
        setTrashCount(trash.items.length)
        setBackups(backupList.items)
        setModel({ configured: status.configured, model: status.model })
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError instanceof ApiError ? requestError.message : '加载失败')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const stats = useMemo(() => {
    const published = items.filter((item) => item.published).length
    const byKind = new Map<ContentKind, number>()
    for (const item of items) {
      byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1)
    }
    return {
      total: items.length,
      published,
      unpublished: items.length - published,
      byKind: [...byKind.entries()].sort((left, right) => right[1] - left[1]),
    }
  }, [items])

  const recent = items.slice(0, 5)

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-40 animate-pulse rounded bg-surface-2" />
        <div className="h-40 animate-pulse rounded-xl bg-surface-2" />
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <h1 className="font-serif text-[24px] font-medium">概览</h1>
      <p className="mt-1.5 text-[12.5px] text-dim">
        内容规模、回收站、备份和模型状态都在这里。
      </p>

      {error && (
        <InlineNotice tone="error" className="mt-4">
          {error}
        </InlineNotice>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Layers} label="内容总数" value={stats.total} hint="不含回收站" />
        <StatCard icon={FileText} label="已上架" value={stats.published} hint="访客可见、AI 可引用" />
        <StatCard icon={FileText} label="未上架" value={stats.unpublished} hint="仅后台可见" />
        <StatCard icon={Database} label="回收站" value={trashCount} hint="可恢复" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[13px] font-medium text-ink">按类型</h2>
            <Link
              to="/admin/contents"
              className="text-[11.5px] text-dim transition-colors hover:text-accent"
            >
              内容管理 →
            </Link>
          </div>

          {stats.byKind.length === 0 ? (
            <p className="mt-3 text-[12.5px] text-dim">还没有内容。</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {stats.byKind.map(([kind, count]) => (
                <li key={kind} className="flex items-center gap-2 text-[12.5px]">
                  <span className="w-12 shrink-0 text-dim">{CONTENT_KIND_LABELS[kind]}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className="block h-full rounded-full bg-accent/70"
                      style={{ width: `${Math.round((count / stats.total) * 100)}%` }}
                    />
                  </span>
                  <span className="w-6 shrink-0 text-right text-ink">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[13px] font-medium text-ink">模型与备份</h2>
            <Link
              to="/admin/settings"
              className="text-[11.5px] text-dim transition-colors hover:text-accent"
            >
              设置 →
            </Link>
          </div>

          <dl className="mt-3 space-y-2 text-[12.5px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-dim">当前模型</dt>
              <dd className="text-ink">
                {model?.model || '未配置'}
                {model && !model.configured && (
                  <span className="ml-1.5 text-[11px] text-[#B4322F]">缺少 API Key</span>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-dim">数据库备份</dt>
              <dd className="text-ink">{backups.length} 份</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-dim">最近备份</dt>
              <dd className="text-ink">
                {backups[0] ? new Date(backups[0].createdAt).toLocaleString('zh-CN') : '—'}
              </dd>
            </div>
          </dl>

          <Link
            to="/admin/distill"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] text-dim transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Sparkles size={13} />
            蒸馏
            <ArrowUpRight size={12} />
          </Link>
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-medium text-ink">最近更新</h2>
          <Link
            to="/admin/contents/new"
            className="text-[11.5px] text-accent transition-colors hover:underline"
          >
            + 上传内容
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-dim">还没有内容，先上传一条试试。</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {recent.map((item) => (
              <li key={item.id}>
                <Link
                  to={`/admin/contents/${item.id}/edit`}
                  className="flex items-center gap-3 py-2.5 transition-colors hover:text-accent"
                >
                  <span className="w-10 shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-center text-[10.5px] text-accent">
                    {item.kindLabel}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{item.title}</span>
                  <span className="shrink-0 text-[11px] text-dim">
                    {(item.updatedAt || item.createdAt)?.slice(0, 10)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Layers
  label: string
  value: number
  hint: string
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2 text-[11.5px] text-dim">
        <Icon size={14} strokeWidth={1.8} />
        {label}
      </div>
      <p className="mt-2 font-serif text-[26px] leading-none text-ink">{value}</p>
      <p className="mt-1.5 text-[11px] text-dim">{hint}</p>
    </div>
  )
}
