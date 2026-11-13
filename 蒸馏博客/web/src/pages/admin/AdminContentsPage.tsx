import {
  Eye,
  EyeOff,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { InlineNotice } from '@/components/ui/InlineNotice'
import {
  ApiError,
  deleteContent,
  fetchContents,
  purgeContent,
  restoreContent,
  updateContentState,
  type ContentSort,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { CONTENT_KINDS, CONTENT_KIND_LABELS, type ContentKind } from '@/types/chat'
import type { AdminContentListItem } from '@/types/content'

const SORT_LABELS: Record<ContentSort, string> = {
  latest: '最新在前',
  oldest: '最早在前',
  title: '按标题',
}

/** 内容管理：搜索、筛选、排序、回收站、批量操作 */
export function AdminContentsPage() {
  const location = useLocation()
  const [items, setItems] = useState<AdminContentListItem[]>([])
  const [categories, setCategories] = useState<{ name: string; count: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(
    () => (location.state as { notice?: string } | null)?.notice ?? '',
  )

  const [keyword, setKeyword] = useState('')
  const [kind, setKind] = useState<'' | ContentKind>('')
  const [category, setCategory] = useState('')
  const [publishedFilter, setPublishedFilter] = useState<'all' | 'true' | 'false'>('all')
  const [sort, setSort] = useState<ContentSort>('latest')
  const [trashMode, setTrashMode] = useState(false)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pendingDelete, setPendingDelete] = useState<AdminContentListItem | null>(null)
  const [pendingPurge, setPendingPurge] = useState<AdminContentListItem | null>(null)
  // 批量操作同样要确认，尤其是删除与彻底删除
  const [pendingBatch, setPendingBatch] = useState<null | 'delete' | 'purge'>(null)
  const [busy, setBusy] = useState(false)

  // 从编辑页跳回来时带着提示；显示一次后清掉历史状态，刷新不会重复出现
  useEffect(() => {
    if (notice) window.history.replaceState({}, '')
  }, [notice])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchContents({
        q: keyword,
        kind,
        category,
        published: publishedFilter,
        sort,
        trash: trashMode,
      })
      setItems(data.items)
      setCategories(data.categories)
      setSelected(new Set())
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '加载失败，请确认后端已启动')
    } finally {
      setLoading(false)
    }
  }, [keyword, kind, category, publishedFilter, sort, trashMode])

  // 搜索输入做防抖，避免每敲一个字就请求一次
  useEffect(() => {
    const timer = window.setTimeout(load, keyword ? 280 : 0)
    return () => window.clearTimeout(timer)
  }, [load, keyword])

  const stats = useMemo(() => {
    const online = items.filter((item) => item.published).length
    const pinned = items.filter((item) => item.pinned).length
    return { total: items.length, online, pinned }
  }, [items])

  const allSelected = items.length > 0 && selected.size === items.length

  const toggleSelect = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)))
  }

  const run = async (task: () => Promise<unknown>, successText: string) => {
    setBusy(true)
    try {
      await task()
      setNotice(successText)
      await load()
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const handleTogglePublished = (item: AdminContentListItem) =>
    run(
      () => updateContentState(item.id, { published: !item.published }),
      `《${item.title}》已${item.published ? '下架' : '上架'}`,
    )

  const handleTogglePinned = (item: AdminContentListItem) =>
    run(() => updateContentState(item.id, { pinned: !item.pinned }), '置顶状态已更新')

  const handleDelete = async () => {
    if (!pendingDelete) return
    const target = pendingDelete
    setPendingDelete(null)
    await run(() => deleteContent(target.id), `《${target.title}》已移入回收站`)
  }

  const handlePurge = async () => {
    if (!pendingPurge) return
    const target = pendingPurge
    setPendingPurge(null)
    await run(() => purgeContent(target.id), `《${target.title}》已彻底删除`)
  }

  const ids = [...selected]

  const batchPublish = (published: boolean) =>
    run(
      () => Promise.all(ids.map((id) => updateContentState(id, { published }))),
      `已${published ? '上架' : '下架'} ${ids.length} 条`,
    )

  const batchDelete = () =>
    run(() => Promise.all(ids.map((id) => deleteContent(id))), `已将 ${ids.length} 条移入回收站`)

  const batchRestore = () =>
    run(() => Promise.all(ids.map((id) => restoreContent(id))), `已恢复 ${ids.length} 条（保持下架）`)

  const batchPurge = () =>
    run(() => Promise.all(ids.map((id) => purgeContent(id))), `已彻底删除 ${ids.length} 条`)

  const runBatchConfirm = async () => {
    const action = pendingBatch
    setPendingBatch(null)
    if (action === 'delete') await batchDelete()
    if (action === 'purge') await batchPurge()
  }

  return (
    <div className="animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-[24px] font-medium">
            {trashMode ? '回收站' : '内容管理'}
          </h1>
          <p className="mt-1 text-[12.5px] text-dim">
            {trashMode
              ? `共 ${stats.total} 条已删除内容，可恢复或彻底删除`
              : `共 ${stats.total} 条 · 已上架 ${stats.online} 条 · 置顶 ${stats.pinned} 条`}
          </p>
        </div>

        <Link
          to="/admin/contents/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-accent-contrast transition-all hover:brightness-105"
        >
          <Plus size={15} strokeWidth={2} />
          上传内容
        </Link>
      </header>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 transition-colors focus-within:border-accent/50">
          <Search size={15} strokeWidth={1.8} className="shrink-0 text-dim" />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索标题、简介、标签"
            aria-label="搜索内容"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-dim/80"
          />
          {keyword && (
            <span className="shrink-0 text-[11px] text-dim">{items.length} 条匹配</span>
          )}
        </div>

        {!trashMode && (
          <>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as '' | ContentKind)}
              aria-label="按类型筛选"
              className="rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px] text-ink outline-none"
            >
              <option value="">全部类型</option>
              {CONTENT_KINDS.map((value) => (
                <option key={value} value={value}>
                  {CONTENT_KIND_LABELS[value]}
                </option>
              ))}
            </select>

            <select
              value={publishedFilter}
              onChange={(event) => setPublishedFilter(event.target.value as 'all' | 'true' | 'false')}
              aria-label="按状态筛选"
              className="rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px] text-ink outline-none"
            >
              <option value="all">全部状态</option>
              <option value="true">已上架</option>
              <option value="false">未上架</option>
            </select>
          </>
        )}

        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as ContentSort)}
          aria-label="排序方式"
          className="rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px] text-ink outline-none"
        >
          {(Object.keys(SORT_LABELS) as ContentSort[]).map((value) => (
            <option key={value} value={value}>
              {SORT_LABELS[value]}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => {
            setTrashMode((current) => !current)
            setSelected(new Set())
            setNotice('')
          }}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[12.5px] transition-colors',
            trashMode
              ? 'border-accent/50 bg-accent-soft text-accent'
              : 'border-line text-dim hover:bg-surface-2 hover:text-ink',
          )}
        >
          <Trash2 size={14} />
          {trashMode ? '退出回收站' : '回收站'}
        </button>
      </div>

      {error && (
        <InlineNotice tone="error" className="mt-4">
          {error}
        </InlineNotice>
      )}
      {notice && (
        <InlineNotice tone="success" className="mt-4">
          {notice}
        </InlineNotice>
      )}

      {/* 批量操作条：选中后才出现，避免平时占地方 */}
      {selected.size > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 animate-fade-in">
          <span className="text-[12.5px] text-ink">已选 {selected.size} 条</span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {trashMode ? (
              <>
                <BatchButton label="恢复" onClick={batchRestore} disabled={busy} />
                <BatchButton
                  label="彻底删除"
                  onClick={() => setPendingBatch('purge')}
                  disabled={busy}
                  danger
                />
              </>
            ) : (
              <>
                <BatchButton label="上架" onClick={() => batchPublish(true)} disabled={busy} />
                <BatchButton label="下架" onClick={() => batchPublish(false)} disabled={busy} />
                <BatchButton
                  label="删除"
                  onClick={() => setPendingBatch('delete')}
                  disabled={busy}
                  danger
                />
              </>
            )}
            <BatchButton label="取消选择" onClick={() => setSelected(new Set())} disabled={busy} />
          </div>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
        {loading ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2].map((row) => (
              <div key={row} className="h-16 animate-pulse rounded-lg bg-surface-2" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            trashMode={trashMode}
            filtered={Boolean(keyword || kind || publishedFilter !== 'all' || category)}
          />
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-line px-3.5 py-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                aria-label="全选"
                className="h-3.5 w-3.5 accent-[var(--accent)]"
              />
              <span className="text-[11px] text-dim">全选</span>
            </div>

            <ul className="divide-y divide-line">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-3 p-3.5 transition-colors hover:bg-surface-2/50 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      aria-label={`选择 ${item.title}`}
                      className="h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
                    />

                    <div className="h-[46px] w-[72px] shrink-0 overflow-hidden rounded-md bg-surface-2">
                      {item.coverUrl ? (
                        <img
                          src={item.coverUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center font-serif text-[15px] text-dim">
                          {item.title.slice(0, 1)}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10.5px] text-accent">
                          {item.kindLabel}
                        </span>
                        {item.category && (
                          <span className="text-[10.5px] text-dim">
                            <Highlight text={item.category} keyword={keyword} />
                          </span>
                        )}
                        {item.pinned && (
                          <span className="inline-flex items-center gap-0.5 text-[10.5px] text-dim">
                            <Pin size={10} /> 置顶
                          </span>
                        )}
                        {!item.published && !item.deletedAt && (
                          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-dim">
                            未上架
                          </span>
                        )}
                        {item.deletedAt && (
                          <span className="rounded bg-[#B4322F]/10 px-1.5 py-0.5 text-[10.5px] text-[#B4322F]">
                            {item.deletedAt.slice(0, 10)} 删除
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-[13.5px] text-ink">
                        <Highlight text={item.title} keyword={keyword} />
                      </p>
                      <p className="mt-0.5 truncate text-[11.5px] text-dim">
                        <Highlight text={item.summary} keyword={keyword} />
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                    <span className="mr-1 hidden text-[11px] text-dim lg:inline">
                      {(item.publishedAt || item.createdAt)?.slice(0, 10)}
                    </span>

                    {trashMode ? (
                      <>
                        <IconAction
                          label="恢复"
                          icon={RotateCcw}
                          onClick={() =>
                            run(
                              () => restoreContent(item.id),
                              `《${item.title}》已恢复（保持下架）`,
                            )
                          }
                        />
                        <button
                          type="button"
                          onClick={() => setPendingPurge(item)}
                          aria-label="彻底删除"
                          title="彻底删除"
                          className="flex h-8 w-8 items-center justify-center rounded-md text-dim transition-colors hover:bg-[#B4322F]/10 hover:text-[#B4322F]"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <IconAction
                          label={item.pinned ? '取消置顶' : '置顶'}
                          icon={item.pinned ? PinOff : Pin}
                          onClick={() => handleTogglePinned(item)}
                        />
                        <IconAction
                          label={item.published ? '下架' : '上架'}
                          icon={item.published ? EyeOff : Eye}
                          onClick={() => handleTogglePublished(item)}
                        />
                        <Link
                          to={`/admin/contents/${item.id}/edit`}
                          aria-label="编辑"
                          title="编辑"
                          className="flex h-8 w-8 items-center justify-center rounded-md text-dim transition-colors hover:bg-surface-2 hover:text-ink"
                        >
                          <Pencil size={14} />
                        </Link>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(item)}
                          aria-label="删除"
                          title="删除（可恢复）"
                          className="flex h-8 w-8 items-center justify-center rounded-md text-dim transition-colors hover:bg-[#B4322F]/10 hover:text-[#B4322F]"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {!trashMode && categories.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[11.5px] text-dim">
          <span>分类：</span>
          {categories.map((item) => {
            const active = category === item.name
            return (
              <button
                key={item.name}
                type="button"
                onClick={() => setCategory(active ? '' : item.name)}
                aria-pressed={active}
                className={cn(
                  'rounded-full border px-2 py-0.5 transition-colors',
                  active
                    ? 'border-accent/50 bg-accent-soft text-accent'
                    : 'border-line hover:bg-surface-2 hover:text-ink',
                )}
              >
                {item.name} · {item.count}
              </button>
            )
          })}
          {category && (
            <button
              type="button"
              onClick={() => setCategory('')}
              className="ml-1 text-[11px] text-accent hover:underline"
            >
              清除分类筛选
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="移入回收站？"
        description={
          pendingDelete
            ? `《${pendingDelete.title}》会从列表和公开页面移除，在回收站里可以恢复。`
            : ''
        }
        confirmLabel="移入回收站"
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={Boolean(pendingPurge)}
        title="彻底删除？"
        description={
          pendingPurge
            ? `《${pendingPurge.title}》的记录、封面和附件都会被永久删除，无法恢复。`
            : ''
        }
        confirmLabel="彻底删除"
        danger
        busy={busy}
        onConfirm={handlePurge}
        onCancel={() => setPendingPurge(null)}
      />

      <ConfirmDialog
        open={pendingBatch !== null}
        title={pendingBatch === 'purge' ? `彻底删除这 ${selected.size} 条？` : `把这 ${selected.size} 条移入回收站？`}
        description={
          pendingBatch === 'purge'
            ? '记录、封面和附件都会被永久删除，无法恢复。'
            : '它们会从列表和公开页面移除，之后可以在回收站恢复。'
        }
        confirmLabel={pendingBatch === 'purge' ? '彻底删除' : '移入回收站'}
        danger={pendingBatch === 'purge'}
        busy={busy}
        onConfirm={runBatchConfirm}
        onCancel={() => setPendingBatch(null)}
      />
    </div>
  )
}

/** 关键词高亮：只用于展示，不改变原始数据 */
function Highlight({ text, keyword }: { text: string; keyword: string }) {
  const needle = keyword.trim()
  if (!needle) return <>{text}</>

  const lowerText = text.toLowerCase()
  const lowerNeedle = needle.toLowerCase()
  const parts: React.ReactNode[] = []
  let from = 0

  while (from < text.length) {
    const index = lowerText.indexOf(lowerNeedle, from)
    if (index === -1) break
    if (index > from) parts.push(text.slice(from, index))
    parts.push(
      <mark key={`${index}-${parts.length}`} className="rounded bg-accent-soft px-0.5 text-ink">
        {text.slice(index, index + needle.length)}
      </mark>,
    )
    from = index + needle.length
  }

  if (from < text.length) parts.push(text.slice(from))
  return <>{parts}</>
}

function BatchButton({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-md border bg-surface px-2.5 py-1 text-[11.5px] transition-colors disabled:opacity-50',
        danger
          ? 'border-[#B4322F]/30 text-[#B4322F] hover:bg-[#B4322F]/10'
          : 'border-line text-dim hover:bg-surface-2 hover:text-ink',
      )}
    >
      {label}
    </button>
  )
}

function IconAction({
  label,
  icon: Icon,
  onClick,
}: {
  label: string
  icon: typeof Eye
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-md text-dim transition-colors hover:bg-surface-2 hover:text-ink"
    >
      <Icon size={14} />
    </button>
  )
}

function EmptyState({ trashMode, filtered }: { trashMode: boolean; filtered: boolean }) {
  if (trashMode) {
    return (
      <div className="px-6 py-14 text-center">
        <p className="text-[14px] text-ink">回收站是空的</p>
        <p className="mt-1.5 text-[12.5px] text-dim">删除的内容会先放到这里，可以恢复。</p>
      </div>
    )
  }

  return (
    <div className="px-6 py-14 text-center">
      <p className="text-[14px] text-ink">
        {filtered ? '没有符合条件的内容' : '还没有上传任何内容'}
      </p>
      <p className="mt-1.5 text-[12.5px] text-dim">
        {filtered ? '换个关键词或清掉筛选试试。' : '上传后，访客问「最近在做什么」时就能看到它。'}
      </p>
      {!filtered && (
        <Link
          to="/admin/contents/new"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-[12.5px] text-dim transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <Plus size={14} />
          上传第一条内容
        </Link>
      )}
    </div>
  )
}
