import { FileText, Layers, ListChecks, Sparkles, UserRound } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { DistillFactsPanel } from '@/components/admin/distill/DistillFactsPanel'
import { DistillPersonaPanel } from '@/components/admin/distill/DistillPersonaPanel'
import { DistillQuestionsPanel } from '@/components/admin/distill/DistillQuestionsPanel'
import { DistillSourcesPanel } from '@/components/admin/distill/DistillSourcesPanel'
import { ApiError, fetchDistillStats } from '@/lib/api'
import { useDocumentTitle } from '@/lib/use-document-title'
import { cn } from '@/lib/utils'
import type { DistillStats } from '@/types/distill'

type TabKey = 'sources' | 'facts' | 'questions' | 'persona'

const TABS: { key: TabKey; label: string; icon: typeof FileText }[] = [
  { key: 'sources', label: '资料', icon: FileText },
  { key: 'facts', label: '词条', icon: Layers },
  { key: 'questions', label: '问题', icon: ListChecks },
  { key: 'persona', label: '人设卡', icon: UserRound },
]

/** 顶部四个数字：资料 / 词条 / 已答题 / 目标，点「词条」能直接跳过去 */
function StatRow({
  stats,
  onOpenFacts,
}: {
  stats: DistillStats | null
  onOpenFacts: () => void
}) {
  const items = [
    { label: '资料', value: stats ? stats.sources.total : 0 },
    { label: '词条', value: stats ? stats.facts.total : 0, onClick: onOpenFacts },
    { label: '已答题', value: stats ? stats.progress.answered : 0 },
    { label: '目标题数', value: stats ? stats.progress.target : 0 },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item) => {
        const Tag = item.onClick ? 'button' : 'div'
        return (
          <Tag
            key={item.label}
            {...(item.onClick ? { type: 'button' as const, onClick: item.onClick } : {})}
            className={cn(
              'rounded-lg border border-line bg-surface px-3 py-2.5 text-left transition-colors',
              item.onClick && 'hover:border-accent/40 hover:bg-accent-soft/30',
            )}
          >
            <p className="text-[11px] text-dim">{item.label}</p>
            <p className="mt-0.5 text-[16px] font-medium text-ink">{item.value}</p>
          </Tag>
        )
      })}
    </div>
  )
}

/**
 * 蒸馏后台：四个标签页分开管「资料」「词条」「问题」「人设卡」。
 * 词条单独成一页，因为它是资料和问答的共同产物，混在资料里既不好找也不好管。
 */
export function AdminDistillPage() {
  useDocumentTitle('蒸馏')
  const [tab, setTab] = useState<TabKey>('sources')
  /** 从资料页跳过来时带着来源 id，词条页自动筛这份资料 */
  const [factSourceId, setFactSourceId] = useState('')
  const [stats, setStats] = useState<DistillStats | null>(null)
  const [error, setError] = useState('')

  const refreshStats = useCallback(async () => {
    try {
      setStats(await fetchDistillStats())
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '加载统计失败')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchDistillStats()
      .then((result) => {
        if (!cancelled) setStats(result)
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError instanceof ApiError ? requestError.message : '加载统计失败')
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const openFacts = useCallback((sourceId = '') => {
    setFactSourceId(sourceId)
    setTab('facts')
  }, [])

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-dim">
        <Sparkles size={13} />
        Distill
      </div>
      <h1 className="mt-3 font-serif text-[24px] font-medium">蒸馏你自己</h1>
      <p className="mt-1.5 max-w-[620px] text-[12.5px] leading-[1.8] text-dim">
        上传资料、回答 AI 出的题、核对词条与人设卡，几步下来分身会越来越像你。
        所有内容都存在本地，答一题存一题，随时能停。
      </p>

      <div className="mt-4">
        <StatRow stats={stats} onOpenFacts={() => openFacts('')} />
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[12px] text-[#B4322F] dark:text-[#F08C7A]">
          {error}
        </p>
      )}

      <div
        role="tablist"
        aria-label="蒸馏分区"
        className="mt-4 inline-flex gap-1 rounded-xl border border-line bg-surface p-1"
      >
        {TABS.map((item) => {
          const Icon = item.icon
          const active = tab === item.key
          return (
            <button
              key={item.key}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setTab(item.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] transition-colors',
                active ? 'bg-accent-soft text-accent' : 'text-dim hover:bg-surface-2 hover:text-ink',
              )}
            >
              <Icon size={13} />
              {item.label}
              {item.key === 'facts' && stats && stats.facts.total > 0 && (
                <span className="rounded bg-surface px-1 text-[10px] text-dim">
                  {stats.facts.total}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-3.5">
        {tab === 'sources' && (
          <DistillSourcesPanel onChanged={refreshStats} onOpenFacts={openFacts} />
        )}
        {tab === 'facts' && (
          <DistillFactsPanel
            initialSourceId={factSourceId}
            onClearSource={() => setFactSourceId('')}
            onChanged={refreshStats}
          />
        )}
        {tab === 'questions' && <DistillQuestionsPanel onAnswered={refreshStats} />}
        {tab === 'persona' && <DistillPersonaPanel />}
      </div>
    </div>
  )
}

