import {
  Check,
  ChevronRight,
  Filter,
  ListChecks,
  Loader2,
  RotateCcw,
  SkipForward,
  Sparkles,
  Tags,
  Trash2,
  Wand2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { InlineNotice } from '@/components/ui/InlineNotice'
import {
  answerDistillQuestion,
  ApiError,
  backfillQuestionDimensions,
  batchDistillQuestions,
  extractQuestionFacts,
  fetchDistillQuestions,
  generateDistillQuestions,
  resetDistillQuestion,
  saveDistillQuestionSettings,
  skipDistillQuestion,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import type { DistillProgress, DistillQuestion } from '@/types/distill'
import { DistillButton, DistillCard, DistillTextField } from './DistillFields'

/** 目标题数的可选范围，与后端 saveQuestionSettings 的限制一致 */
const MIN_TARGET = 100
const MAX_TARGET = 2000
const MAX_BATCH = 20
/** 一键整理词条一次最多处理多少条，避免点一下要等半小时 */
const BULK_FACT_LIMIT = 15

type StatusFilter = '' | DistillQuestion['status']

/** 进度条：已答 / 目标，旁边写清楚还剩多少 */
function ProgressBar({ progress }: { progress: DistillProgress }) {
  // 目标只是「基础判断」：答满了不封顶，提示一句让用户自己决定要不要继续
  const reachedTarget = progress.target > 0 && progress.answered >= progress.target

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[12.5px] text-ink">
          已答 <span className="font-medium">{progress.answered}</span> / {progress.target}
          <span className="ml-2 text-[11px] text-dim">
            待答 {progress.pending} · 跳过 {progress.skipped} · 已出题 {progress.total}
          </span>
        </p>
        <span className="text-[11px] text-dim">{progress.percent}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
          style={{ width: `${Math.max(progress.percent, progress.answered > 0 ? 2 : 0)}%` }}
        />
      </div>

      {reachedTarget && (
        <p className="mt-2 text-[11.5px] leading-[1.7] text-dim">
          已经答到目标 {progress.target} 题了。目标只是给你一个参考，把下面「目标题数」调高就能继续出题，
          已答的内容都会保留。
        </p>
      )}
    </div>
  )
}

/** 题目状态小标 */
function QuestionBadge({ status }: { status: DistillQuestion['status'] }) {
  if (status === 'answered') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10.5px] text-emerald-700 dark:text-emerald-400">
        <Check size={10} />
        已答
      </span>
    )
  }
  if (status === 'skipped') {
    return (
      <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-dim">已跳过</span>
    )
  }
  return <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10.5px] text-accent">待答</span>
}

/** 维度覆盖：点一个维度就能筛出那一类题 */
function DimensionCoverage({
  dimensions,
  active,
  onPick,
  onBackfill,
  backfilling,
}: {
  dimensions: DistillProgress['dimensions']
  active: string
  onPick: (key: string) => void
  onBackfill: () => void
  backfilling: boolean
}) {
  const untouched = dimensions.filter((item) => item.total === 0).length

  return (
    <div className="mt-3.5 border-t border-line pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex flex-wrap items-baseline gap-2 text-[11.5px] text-dim">
          维度覆盖
          {untouched > 0 && <span className="text-accent">还有 {untouched} 个维度没问到</span>}
        </p>
        <button
          type="button"
          onClick={onBackfill}
          disabled={backfilling}
          className="inline-flex items-center gap-1 text-[11px] text-dim transition-colors hover:text-ink disabled:opacity-50"
        >
          <Tags size={11} />
          {backfilling ? '正在补维度…' : '给旧题目补维度'}
        </button>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {dimensions.map((item) => {
          const isActive = active === item.key
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onPick(isActive ? '' : item.key)}
              title={`已出 ${item.total} 题，答了 ${item.answered} 题`}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] transition-all',
                isActive && 'ring-1 ring-accent',
                item.total === 0
                  ? 'bg-surface-2/60 text-dim/70'
                  : item.answered > 0
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'bg-accent-soft text-accent',
              )}
            >
              {item.label}
              {/* 一次题都没出过的维度也要给出明确反馈，否则看起来像数字丢了 */}
              <span className="opacity-70">
                {item.total > 0 ? `${item.answered}/${item.total}` : '未出题'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * 问题面板：AI 分批出题，一道一道答，随时能停。
 * 每答一题立刻写盘；答完可以把这条问答整理成词条。
 */
export function DistillQuestionsPanel({ onAnswered }: { onAnswered?: () => void }) {
  const [questions, setQuestions] = useState<DistillQuestion[]>([])
  const [progress, setProgress] = useState<DistillProgress | null>(null)
  const [activeId, setActiveId] = useState('')
  /**
   * 输入框内容按题目 id 记着：切题时自动显示那道题已有的答案，
   * 用派生值而不是 useEffect 回填，避免切换瞬间闪一下旧内容。
   */
  const [editing, setEditing] = useState({ id: '', text: '' })
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [targetInput, setTargetInput] = useState('1000')
  const [batchInput, setBatchInput] = useState('10')
  const [savingSettings, setSavingSettings] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [dimensionFilter, setDimensionFilter] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [backfilling, setBackfilling] = useState(false)
  const [factBusy, setFactBusy] = useState(false)
  const [bulkFact, setBulkFact] = useState({ running: false, done: 0, total: 0 })

  useEffect(() => {
    let cancelled = false
    fetchDistillQuestions()
      .then((result) => {
        if (cancelled) return
        setQuestions(result.items)
        setProgress(result.progress)
        setTargetInput(String(result.progress.target))
        setBatchInput(String(result.progress.batchSize))
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError instanceof ApiError ? requestError.message : '加载问题失败')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  /** 当前正在答的题：优先选中的，其次第一道未答的 */
  const activeQuestion = useMemo(() => {
    if (activeId) {
      const picked = questions.find((item) => item.id === activeId)
      if (picked) return picked
    }
    return questions.find((item) => item.status === 'unanswered') ?? null
  }, [questions, activeId])

  /** 输入框当前内容：正在编辑这道题就用编辑值，否则回落到它已保存的答案 */
  const draft =
    activeQuestion && editing.id === activeQuestion.id ? editing.text : (activeQuestion?.answer ?? '')
  const setDraft = (text: string) => setEditing({ id: activeQuestion?.id ?? '', text })

  /** 列表筛选：状态 + 维度都在前端过滤，避免每点一次都请求一遍 */
  const visible = useMemo(() => {
    return questions.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false
      if (dimensionFilter && item.dimension !== dimensionFilter) return false
      return true
    })
  }, [questions, statusFilter, dimensionFilter])

  const answeredWithoutFacts = useMemo(
    () => questions.filter((item) => item.status === 'answered' && item.factCount === 0).length,
    [questions],
  )

  const toggleSelect = (id: string) => {
    setSelected((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id],
    )
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setError('')
    setNotice('')
    try {
      const result = await generateDistillQuestions()
      setQuestions((previous) => [...previous, ...result.items])
      setProgress(result.progress)
      setActiveId(result.items[0]?.id ?? '')
      setNotice(`第 ${result.batch} 批出了 ${result.items.length} 道题，接着答就行。`)
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '生成题目失败')
    } finally {
      setGenerating(false)
    }
  }

  const patchQuestion = async (
    action: 'answer' | 'skip' | 'reset',
    question: DistillQuestion,
  ) => {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const text = action === 'answer' ? draft.trim() : ''
      if (action === 'answer' && !text) {
        setError('先写点内容再保存。')
        return
      }

      const result =
        action === 'answer'
          ? await answerDistillQuestion(question.id, text)
          : action === 'skip'
            ? await skipDistillQuestion(question.id)
            : await resetDistillQuestion(question.id)

      setQuestions((previous) =>
        previous.map((item) => (item.id === result.item.id ? result.item : item)),
      )
      setProgress(result.progress)

      if (action === 'answer') {
        onAnswered?.()
        // 答完自动跳到下一道未答，保持连续作答的节奏
        const next = questions.find(
          (item) => item.id !== question.id && item.status === 'unanswered',
        )
        setActiveId(next?.id ?? '')
        setNotice('已保存，这条回答会作为知识用在对话里。可以点「整理成词条」再沉淀一层。')
      }
      if (action === 'reset') {
        setEditing({ id: '', text: '' })
        setNotice('已撤销，这道题回到待答。')
      }
      if (action === 'skip') setEditing({ id: '', text: '' })
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  /** 把当前这条问答整理成词条 */
  const handleExtractFacts = async (question: DistillQuestion) => {
    setFactBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await extractQuestionFacts(question.id)
      setQuestions((previous) =>
        previous.map((item) => (item.id === result.item.id ? result.item : item)),
      )
      setProgress(result.progress)
      onAnswered?.()
      setNotice(
        result.facts.length > 0
          ? `整理出 ${result.facts.length} 条词条，已经能在对话里用上了。`
          : '这条回答里没有提炼出可独立成立的事实，可以先跳过。',
      )
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '整理词条失败')
    } finally {
      setFactBusy(false)
    }
  }

  /** 一键整理：逐条串行调用，边跑边显示进度 */
  const handleBulkExtract = async () => {
    const targets = questions
      .filter((item) => item.status === 'answered' && item.factCount === 0)
      .slice(0, BULK_FACT_LIMIT)
    if (targets.length === 0) return

    setBulkFact({ running: true, done: 0, total: targets.length })
    setError('')
    setNotice('')

    let done = 0
    for (const question of targets) {
      try {
        const result = await extractQuestionFacts(question.id)
        setQuestions((previous) =>
          previous.map((item) => (item.id === result.item.id ? result.item : item)),
        )
        setProgress(result.progress)
        done += 1
        setBulkFact({ running: true, done, total: targets.length })
      } catch (requestError) {
        setError(requestError instanceof ApiError ? requestError.message : '整理词条失败')
        break
      }
    }

    setBulkFact({ running: false, done: 0, total: 0 })
    if (done > 0) {
      setNotice(`整理完 ${done} 条问答的词条。`)
      onAnswered?.()
    }
  }

  const handleBatch = async (action: 'skip' | 'reset' | 'delete') => {
    if (selected.length === 0) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await batchDistillQuestions(selected, action)
      const affected = new Set(selected)

      setQuestions((previous) => {
        if (action === 'delete') return previous.filter((item) => !affected.has(item.id))
        return previous.map((item) => {
          if (!affected.has(item.id)) return item
          if (action === 'skip') return { ...item, status: 'skipped' as const }
          return { ...item, status: 'unanswered' as const, answer: '', factCount: 0 }
        })
      })
      setProgress(result.progress)
      setSelected([])
      setNotice(
        action === 'delete'
          ? `删掉 ${result.affected} 道题，它们产生的知识与词条一起清了。`
          : `处理了 ${result.affected} 道题。`,
      )
      onAnswered?.()
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '批量操作失败')
    } finally {
      setSaving(false)
    }
  }

  const handleBackfill = async () => {
    setBackfilling(true)
    setError('')
    setNotice('')
    try {
      const result = await backfillQuestionDimensions()
      const refreshed = await fetchDistillQuestions()
      setQuestions(refreshed.items)
      setProgress(result.progress)
      setNotice(`补了 ${result.updated} 道题的维度。`)
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '补维度失败')
    } finally {
      setBackfilling(false)
    }
  }

  const handleSaveSettings = async () => {
    const target = Number.parseInt(targetInput, 10)
    const batch = Number.parseInt(batchInput, 10)
    if (!Number.isFinite(target) || target < MIN_TARGET || target > MAX_TARGET) {
      setError(`目标题数填 ${MIN_TARGET}–${MAX_TARGET} 之间的整数。`)
      return
    }
    if (!Number.isFinite(batch) || batch < 1 || batch > MAX_BATCH) {
      setError(`每批题数填 1–${MAX_BATCH} 之间的整数。`)
      return
    }

    setSavingSettings(true)
    setError('')
    setNotice('')
    try {
      const result = await saveDistillQuestionSettings({ targetCount: target, batchSize: batch })
      setProgress(result.progress)
      setTargetInput(String(result.progress.target))
      setBatchInput(String(result.progress.batchSize))
      setNotice('设置已保存。')
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '保存设置失败')
    } finally {
      setSavingSettings(false)
    }
  }

  if (loading) {
    return <div className="h-32 animate-pulse rounded-xl bg-surface-2" />
  }

  return (
    <div className="space-y-3.5">
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
      {notice && <InlineNotice tone="success">{notice}</InlineNotice>}

      <DistillCard
        icon={<ListChecks size={14} className="text-accent" />}
        title="蒸馏进度"
        desc="答一题存一题，随时停下，下次接着答；每批会跨 4–6 个方面混着出，目标题数只是参考，到 1000 也行。"
        action={
          <DistillButton variant="primary" onClick={() => void handleGenerate()} disabled={generating}>
            {generating ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                正在出题…
              </>
            ) : (
              <>
                <Sparkles size={13} />
                {progress && progress.total > 0 ? '再来一批' : '生成第一批'}
              </>
            )}
          </DistillButton>
        }
      >
        {progress ? <ProgressBar progress={progress} /> : null}
        {progress ? (
          <DimensionCoverage
            dimensions={progress.dimensions}
            active={dimensionFilter}
            onPick={setDimensionFilter}
            onBackfill={() => void handleBackfill()}
            backfilling={backfilling}
          />
        ) : null}

        <div className="mt-3.5 flex flex-wrap items-end gap-3 border-t border-line pt-3.5">
          <div className="w-[132px]">
            <DistillTextField
              label="目标题数"
              value={targetInput}
              onChange={setTargetInput}
              hint={`${MIN_TARGET}–${MAX_TARGET}`}
            />
          </div>
          <div className="w-[110px]">
            <DistillTextField
              label="每批题数"
              value={batchInput}
              onChange={setBatchInput}
              hint={`1–${MAX_BATCH}`}
            />
          </div>
          <DistillButton onClick={() => void handleSaveSettings()} disabled={savingSettings}>
            {savingSettings ? '保存中…' : '保存设置'}
          </DistillButton>

          {answeredWithoutFacts > 0 && (
            <DistillButton
              onClick={() => void handleBulkExtract()}
              disabled={bulkFact.running || factBusy}
            >
              <Tags size={13} />
              {bulkFact.running
                ? `整理中 ${bulkFact.done}/${bulkFact.total}`
                : `把 ${Math.min(answeredWithoutFacts, BULK_FACT_LIMIT)} 条问答整理成词条`}
            </DistillButton>
          )}
        </div>
      </DistillCard>

      {activeQuestion ? (
        <DistillCard
          icon={<Wand2 size={14} className="text-accent" />}
          title="正在答这道"
          desc={
            activeQuestion.dimensionLabel
              ? `第 ${activeQuestion.batch} 批 · ${activeQuestion.dimensionLabel}`
              : `第 ${activeQuestion.batch} 批`
          }
          action={<QuestionBadge status={activeQuestion.status} />}
        >
          <p className="text-[13.5px] leading-[1.9] text-ink">{activeQuestion.question}</p>

          <textarea
            value={draft}
            rows={5}
            maxLength={4000}
            placeholder="想到多少写多少，可以只写一两句。写得越具体，分身越像你。"
            onChange={(event) => setDraft(event.target.value)}
            className="mt-3 w-full resize-none rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] leading-[1.8] text-ink outline-none transition-colors placeholder:text-dim/60 focus:border-accent/50"
          />

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <DistillButton
              variant="primary"
              onClick={() => void patchQuestion('answer', activeQuestion)}
              disabled={saving}
            >
              <Check size={13} />
              {activeQuestion.status === 'answered' ? '更新这条回答' : '保存，下一题'}
            </DistillButton>
            {activeQuestion.status === 'unanswered' && (
              <DistillButton
                onClick={() => void patchQuestion('skip', activeQuestion)}
                disabled={saving}
              >
                <SkipForward size={13} />
                跳过
              </DistillButton>
            )}
            {activeQuestion.status !== 'unanswered' && (
              <DistillButton
                onClick={() => void patchQuestion('reset', activeQuestion)}
                disabled={saving}
              >
                <RotateCcw size={13} />
                撤销
              </DistillButton>
            )}
            {activeQuestion.status === 'answered' && (
              <DistillButton onClick={() => void handleExtractFacts(activeQuestion)} disabled={factBusy}>
                <Tags size={13} />
                {factBusy
                  ? '整理中…'
                  : activeQuestion.factCount > 0
                    ? `重新整理成词条（${activeQuestion.factCount}）`
                    : '整理成词条'}
              </DistillButton>
            )}
            <span className="ml-auto text-[11px] text-dim">{draft.length}/4000</span>
          </div>
        </DistillCard>
      ) : (
        <DistillCard title="没有待答的题目">
          <p className="text-[12px] leading-[1.8] text-dim">
            {questions.length === 0
              ? '先点右上角「生成第一批」。AI 会读你上传的资料和已提炼的词条来出题。'
              : '这批已经答完或跳完了，再生成一批就能继续。'}
          </p>
        </DistillCard>
      )}

      {questions.length > 0 && (
        <DistillCard
          title={`题目列表（${visible.length}${
            visible.length !== questions.length ? ` / 共 ${questions.length}` : ''
          }）`}
          desc="可以按状态和维度筛，勾选后批量跳过或删除。"
          action={
            <div className="flex flex-wrap items-center gap-1.5">
              <Filter size={12} className="text-dim" />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                aria-label="按状态筛选"
                className="rounded-md border border-line bg-surface px-2 py-1 text-[11.5px] text-ink outline-none focus:border-accent/50"
              >
                <option value="">全部状态</option>
                <option value="unanswered">待答</option>
                <option value="answered">已答</option>
                <option value="skipped">已跳过</option>
              </select>
              <select
                value={dimensionFilter}
                onChange={(event) => setDimensionFilter(event.target.value)}
                aria-label="按维度筛选"
                className="rounded-md border border-line bg-surface px-2 py-1 text-[11.5px] text-ink outline-none focus:border-accent/50"
              >
                <option value="">全部维度</option>
                {(progress?.dimensions ?? []).map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          {selected.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent-soft/30 px-2.5 py-1.5 animate-fade-in">
              <span className="text-[11.5px] text-ink">已选 {selected.length} 条</span>
              <DistillButton size="sm" onClick={() => void handleBatch('skip')} disabled={saving}>
                <SkipForward size={12} />
                跳过
              </DistillButton>
              <DistillButton size="sm" onClick={() => void handleBatch('reset')} disabled={saving}>
                <RotateCcw size={12} />
                撤销
              </DistillButton>
              <DistillButton
                size="sm"
                variant="danger"
                onClick={() => void handleBatch('delete')}
                disabled={saving}
              >
                <Trash2 size={12} />
                删除
              </DistillButton>
              <button
                type="button"
                onClick={() => setSelected([])}
                className="text-[11px] text-dim transition-colors hover:text-ink"
              >
                取消选择
              </button>
            </div>
          )}

          {visible.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[11.5px] text-dim">
              这个筛选下没有题目。
            </p>
          ) : (
            <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
              {visible.map((item) => {
                const checked = selected.includes(item.id)
                return (
                  <li
                    key={item.id}
                    className={cn(
                      'flex items-start gap-2 py-2.5 transition-colors hover:bg-surface-2/50',
                      activeQuestion?.id === item.id && 'bg-accent-soft/40',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelect(item.id)}
                      aria-label="选择这道题"
                      className="mt-1 h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
                    />

                    <button
                      type="button"
                      onClick={() => setActiveId(item.id)}
                      className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                    >
                      <span className="mt-0.5 shrink-0">
                        <QuestionBadge status={item.status} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-1.5">
                          <span className="block text-[12.5px] leading-[1.7] text-ink">
                            {item.question}
                          </span>
                          {item.dimensionLabel && (
                            <span className="rounded bg-surface-2 px-1 text-[10px] text-dim">
                              {item.dimensionLabel}
                            </span>
                          )}
                          {item.factCount > 0 && (
                            <span className="rounded bg-emerald-500/10 px-1 text-[10px] text-emerald-700 dark:text-emerald-400">
                              词条 {item.factCount}
                            </span>
                          )}
                        </span>
                        {item.answer && (
                          <span className="mt-0.5 block truncate text-[11px] text-dim">
                            {item.answer}
                          </span>
                        )}
                      </span>
                      <ChevronRight size={13} className="mt-1 shrink-0 text-dim" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </DistillCard>
      )}
    </div>
  )
}
