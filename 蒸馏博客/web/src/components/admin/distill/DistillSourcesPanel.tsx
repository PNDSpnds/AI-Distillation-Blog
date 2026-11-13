import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { InlineNotice } from '@/components/ui/InlineNotice'
import {
  ApiError,
  deleteDistillSource,
  fetchDistillSources,
  reextractSourceFacts,
  reparseDistillSource,
  uploadDistillSource,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import type { DistillSource } from '@/types/distill'
import { DistillCard } from './DistillFields'

/** 允许的资料类型；后端按扩展名解析，这里同步限制一下选择框 */
const ACCEPT = '.pdf,.docx,.txt,.md,.markdown,.png,.jpg,.jpeg,.webp'

function formatCount(value: number) {
  return value.toLocaleString('zh-CN')
}

/** 解析状态徽标 */
function StatusBadge({ source }: { source: DistillSource }) {
  if (source.status === 'parsed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10.5px] text-emerald-700 dark:text-emerald-400">
        <CircleCheck size={10} />
        已解析
      </span>
    )
  }
  if (source.status === 'failed' || source.status === 'empty') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-[#B4322F]/10 px-1.5 py-0.5 text-[10.5px] text-[#B4322F] dark:text-[#F08C7A]">
        <CircleAlert size={10} />
        {source.status === 'empty' ? '无文字' : '解析失败'}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-dim">
      <Loader2 size={10} className="animate-spin" />
      解析中
    </span>
  )
}

/** 词条整理状态：单独显示，因为它是另一件耗时的事 */
function FactBadge({ source }: { source: DistillSource }) {
  if (source.factStatus === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] text-dim">
        <Loader2 size={10} className="animate-spin" />
        正在整理词条
      </span>
    )
  }
  if (source.factStatus === 'failed') {
    return <span className="text-[10.5px] text-[#B4322F] dark:text-[#F08C7A]">词条整理失败</span>
  }
  return null
}

/**
 * 资料面板：上传 → 解析 → AI 整理词条。
 * 展开一份资料能看到它整理出了哪些词条，并能逐条改或删。
 */
export function DistillSourcesPanel({
  onChanged,
  onOpenFacts,
}: {
  onChanged?: () => void
  /** 跳到词条页并筛上这份资料 */
  onOpenFacts?: (sourceId: string) => void
}) {
  const [sources, setSources] = useState<DistillSource[]>([])
  const [expandedId, setExpandedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [percent, setPercent] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState('')
  const [pendingDelete, setPendingDelete] = useState<DistillSource | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  /** 当前展开的资料 id；轮询回调里要用最新值，所以额外存一份 ref */
  const expandedIdRef = useRef('')
  const pendingExists = sources.some((item) => item.factStatus === 'pending')

  useEffect(() => {
    let cancelled = false
    fetchDistillSources()
      .then((result) => {
        if (!cancelled) setSources(result.items)
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError instanceof ApiError ? requestError.message : '加载资料失败')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  /**
   * 展开时只刷新资料本身的状态。
   * 词条的编辑已经搬到「词条」页，这里不再拉全量词条。
   */
  const refreshSource = async (sourceId: string) => {
    try {
      const result = await fetchDistillSources()
      setSources(result.items)
      void sourceId
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '刷新资料失败')
    }
  }

  const toggleExpand = (source: DistillSource) => {
    const next = expandedId === source.id ? '' : source.id
    setExpandedId(next)
    expandedIdRef.current = next
  }

  /**
   * 词条整理在后台跑，这里轮询资料列表看状态。
   * 只在真有 pending 时才轮询，避免页面一直发请求。
   */
  useEffect(() => {
    if (!pendingExists) return

    const timer = setInterval(() => {
      fetchDistillSources()
        .then((result) => {
          setSources(result.items)
          onChanged?.()
        })
        .catch(() => {
          // 轮询失败静默，下一轮会再试
        })
    }, 2500)

    return () => clearInterval(timer)
  }, [pendingExists, onChanged])

  const handleUpload = async (file: File | undefined) => {
    if (!file || uploading) return

    setError('')
    setNotice('')
    setUploading(true)
    setPercent(0)
    try {
      const result = await uploadDistillSource(file, setPercent)
      setSources((previous) => [result.item, ...previous])
      onChanged?.()

      if (result.item.status === 'parsed') {
        setExpandedId(result.item.id)
        setNotice(
          `《${result.item.fileName}》已解析，正在后台整理词条；好了会显示条数，点「看词条」就能逐条改。`,
        )
      } else {
        setError(result.item.error || result.item.note || '这个文件没解析出文字，可以换个格式再试。')
      }
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '上传失败')
    } finally {
      setUploading(false)
      setPercent(0)
    }
  }

  const handleReparse = async (source: DistillSource) => {
    setBusyId(source.id)
    setError('')
    setNotice('')
    try {
      const result = await reparseDistillSource(source.id)
      setSources((previous) =>
        previous.map((item) => (item.id === result.item.id ? result.item : item)),
      )
      await refreshSource(source.id)
      onChanged?.()
      setNotice(
        result.item.status === 'parsed'
          ? `《${result.item.fileName}》重新解析完成，正在重新整理词条。`
          : result.item.note || '重新解析后仍然没有文字。',
      )
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '重新解析失败')
    } finally {
      setBusyId('')
    }
  }

  /** 只重新整理词条，不动原文 */
  const handleReextract = async (source: DistillSource) => {
    setBusyId(source.id)
    setError('')
    setNotice('')
    try {
      const result = await reextractSourceFacts(source.id)
      setSources((previous) =>
        previous.map((item) => (item.id === result.item.id ? result.item : item)),
      )
      onChanged?.()
      setNotice(`《${result.item.fileName}》整理出 ${result.item.factCount} 条词条。`)
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '整理词条失败')
    } finally {
      setBusyId('')
    }
  }

  const handleDelete = async () => {
    if (!pendingDelete) return
    const target = pendingDelete
    setBusyId(target.id)
    setError('')
    try {
      await deleteDistillSource(target.id)
      setSources((previous) => previous.filter((item) => item.id !== target.id))
      if (expandedId === target.id) setExpandedId('')
      onChanged?.()
      setNotice(`已删除《${target.fileName}》，它的词条也一起删了。`)
      setPendingDelete(null)
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '删除失败')
    } finally {
      setBusyId('')
    }
  }

  const totalFacts = sources.reduce((sum, item) => sum + (item.factCount || 0), 0)

  return (
    <div className="space-y-3.5">
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
      {notice && <InlineNotice tone="success">{notice}</InlineNotice>}

      <DistillCard
        icon={<UploadCloud size={14} className="text-accent" />}
        title="上传资料"
        desc="PDF、Word、Markdown、TXT 会先抽出正文，再由 AI 整理成一条条词条；图片暂时只记录文件名，不读里面的字。"
        action={
          sources.length > 0 ? (
            <span className="text-[11px] text-dim">
              共 {sources.length} 份资料 · 整理出 {totalFacts} 条词条
            </span>
          ) : null
        }
      >
        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            void handleUpload(event.dataTransfer.files?.[0])
          }}
          className={cn(
            'rounded-lg border border-dashed px-4 py-6 text-center transition-colors',
            dragging
              ? 'border-accent bg-accent-soft/40'
              : 'border-line bg-surface-2/40 hover:border-accent/40',
          )}
        >
          {uploading ? (
            <div className="mx-auto max-w-[280px]">
              <p className="text-[12.5px] text-ink">正在上传、解析并整理词条…</p>
              <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${Math.max(percent, 6)}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-dim">
                {percent < 100 ? `${percent}%` : '解析中，稍等一下'}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex flex-col items-center gap-1.5"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-dim">
                <UploadCloud size={18} />
              </span>
              <span className="text-[12.5px] text-ink">
                {dragging ? '松开即可上传' : '点击选择，或把文件拖到这里'}
              </span>
              <span className="text-[11px] text-dim">PDF / DOCX / MD / TXT，单个最大 100 MB</span>
            </button>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(event) => {
            void handleUpload(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </DistillCard>

      <DistillCard
        icon={<FileText size={14} className="text-accent" />}
        title="已上传的资料"
        desc="点一行展开，看它整理出了哪些词条；词条可以单独改或删，删掉这份资料词条也会一起没。"
      >
        {loading ? (
          <div className="space-y-2">
            {[0, 1].map((index) => (
              <div key={index} className="h-12 animate-pulse rounded-lg bg-surface-2" />
            ))}
          </div>
        ) : sources.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-5 text-center text-[12px] text-dim">
            还没有资料。可以先把简历、获奖证明、写过的文章、日记笔记传上来。
          </p>
        ) : (
          <ul className="space-y-2">
            {sources.map((source) => {
              const expanded = expandedId === source.id

              return (
                <li key={source.id} className="rounded-lg border border-line bg-surface">
                  <div className="flex items-center gap-2.5 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => toggleExpand(source)}
                      aria-expanded={expanded}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-[10px] font-medium uppercase text-dim">
                        {(source.ext || '').replace('.', '') || 'FILE'}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-[12.5px] text-ink">{source.fileName}</span>
                          <StatusBadge source={source} />
                          {source.status === 'parsed' && (
                            <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10.5px] text-accent">
                              {source.factCount} 条词条
                            </span>
                          )}
                          <FactBadge source={source} />
                        </span>
                        <span className="mt-0.5 block text-[11px] text-dim">
                          {source.sizeText}
                          {source.status === 'parsed' && ` · ${formatCount(source.charCount)} 字`}
                          {(source.status === 'failed' || source.status === 'empty') &&
                            (source.error || source.note
                              ? ` · ${source.error || source.note}`
                              : '')}
                        </span>
                      </span>

                      <span className="shrink-0 text-dim">
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                    </button>

                    <div className="flex shrink-0 items-center gap-0.5">
                        {source.status === 'parsed' && (
                          <button
                            type="button"
                            onClick={() => onOpenFacts?.(source.id)}
                            className="rounded-md border border-line px-2 py-1 text-[11px] text-dim transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-ink"
                          >
                            看词条
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleReextract(source)}
                          disabled={busyId === source.id || source.status !== 'parsed'}
                          aria-label="重新整理词条"
                          title="重新整理词条（原文不变）"
                          className="flex h-7 w-7 items-center justify-center rounded-md text-dim transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40"
                        >
                          <Sparkles
                            size={13}
                            className={busyId === source.id ? 'animate-pulse' : undefined}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleReparse(source)}
                          disabled={busyId === source.id}
                          aria-label="重新解析"
                          title="重新解析文件"
                          className="flex h-7 w-7 items-center justify-center rounded-md text-dim transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                        >
                          <RefreshCw
                            size={13}
                            className={busyId === source.id ? 'animate-spin' : undefined}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(source)}
                          disabled={busyId === source.id}
                          aria-label="删除资料"
                          title="删除资料"
                          className="flex h-7 w-7 items-center justify-center rounded-md text-dim transition-colors hover:bg-[#B4322F]/10 hover:text-[#B4322F] disabled:opacity-50"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="border-t border-line px-3 py-2.5 animate-fade-in">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11.5px] text-dim">
                            从《{source.fileName}》整理出{' '}
                            <span className="text-ink">{source.factCount}</span> 条词条
                            {source.factStatus === 'pending' && '（正在整理，稍等一下）'}
                            {source.factStatus === 'empty' && '（这份资料没整理出可独立成立的事实）'}
                            {source.factStatus === 'failed' && '（整理失败，可以点上面的 ✨ 重试）'}
                          </p>
                          {source.status === 'parsed' && (
                            <button
                              type="button"
                              onClick={() => onOpenFacts?.(source.id)}
                              className="rounded-md border border-line px-2 py-1 text-[11px] text-dim transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-ink"
                            >
                              去词条页管理
                            </button>
                          )}
                        </div>
                        <p className="mt-1 text-[10.5px] text-dim/80">
                          词条的编辑与删除统一在「词条」标签页里做，避免两处都能改、改完不一致。
                        </p>
                      </div>
                    )}
                </li>
              )
            })}
          </ul>
        )}
      </DistillCard>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="删除这份资料？"
        description={`《${pendingDelete?.fileName ?? ''}》整理出的 ${pendingDelete?.factCount ?? 0} 条词条会一起删除。已经答过的问题不受影响。`}
        confirmLabel="删除"
        danger
        busy={busyId === pendingDelete?.id}
        onConfirm={() => void handleDelete()}
        onCancel={() => setPendingDelete(null)}
      />

      {sources.length > 0 && (
        <p className="px-1 text-[11px] leading-[1.8] text-dim">
          建议把简历、获奖证明、日记、写过的长文都传上来：词条越全，分身越像你。
        </p>
      )}
    </div>
  )
}
