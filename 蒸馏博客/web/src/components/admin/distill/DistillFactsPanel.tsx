import {
  Check,
  Copy,
  Layers,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Tags,
  Trash2,
  Wand2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { InlineNotice } from '@/components/ui/InlineNotice'
import {
  ApiError,
  batchFacts,
  createFact,
  createFactCategory,
  deleteFact,
  deleteFactCategory,
  fetchFacts,
  mergeFactCategories,
  recategorizeFacts,
  renameFactCategory,
  tidyFactCategories,
  updateFact,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import type { FactCategory, FactEntry } from '@/types/distill'
import { DistillButton, DistillCard } from './DistillFields'

interface FactDraft {
  categoryId: string
  categoryLabel: string
  title: string
  content: string
  time: string
}

const EMPTY_DRAFT: FactDraft = { categoryId: '', categoryLabel: '', title: '', content: '', time: '' }

const INPUT_CLASS =
  'w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[12.5px] text-ink outline-none transition-colors placeholder:text-dim/60 focus:border-accent/50'

/** 来源标签：资料 / 问答 / 手动 */
function sourceLabel(fact: FactEntry) {
  if (fact.sourceType === 'qa') return '问答'
  if (fact.sourceType === 'manual') return '手动'
  return '资料'
}

/** 编辑态：分类 + 标题 + 时间 + 内容 */
function FactEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  saveLabel,
}: {
  draft: FactDraft
  onChange: (draft: FactDraft) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  saveLabel: string
}) {
  return (
    <div className="rounded-lg border border-accent/40 bg-accent-soft/20 p-2.5 animate-fade-in">
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          list="fact-category-options"
          value={draft.categoryLabel}
          placeholder="分类"
          maxLength={8}
          onChange={(event) => onChange({ ...draft, categoryLabel: event.target.value })}
          className={cn(INPUT_CLASS, 'w-[110px]')}
        />
        <input
          value={draft.title}
          placeholder="标题，例如：演讲比赛三等奖"
          maxLength={40}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
          className={cn(INPUT_CLASS, 'min-w-[140px] flex-1')}
        />
        <input
          value={draft.time}
          placeholder="时间（可空）"
          maxLength={24}
          onChange={(event) => onChange({ ...draft, time: event.target.value })}
          className={cn(INPUT_CLASS, 'w-[104px]')}
        />
      </div>

      <textarea
        value={draft.content}
        rows={2}
        maxLength={240}
        placeholder="具体内容：是什么、什么时候、和什么有关"
        onChange={(event) => onChange({ ...draft, content: event.target.value })}
        className={cn(INPUT_CLASS, 'mt-1.5 resize-none')}
      />

      <div className="mt-1.5 flex items-center gap-1.5">
        <DistillButton variant="primary" size="sm" onClick={onSave} disabled={saving}>
          <Check size={12} />
          {saving ? '保存中…' : saveLabel}
        </DistillButton>
        <DistillButton size="sm" onClick={onCancel} disabled={saving}>
          <X size={12} />
          取消
        </DistillButton>
        <span className="ml-auto text-[10.5px] text-dim">
          分类可以选已有的，也可以直接打一个新名字
        </span>
      </div>
    </div>
  )
}

/**
 * 词条页：所有来源整理出来的词条都在这里。
 * 支持关键词搜索、分类筛选、来源筛选、排序、批量删除/改分类，以及分类本身的管理。
 */
export function DistillFactsPanel({
  initialSourceId,
  onClearSource,
  onChanged,
}: {
  /** 从资料页跳过来时带上来源 id，自动筛这份资料 */
  initialSourceId?: string
  onClearSource?: () => void
  onChanged?: () => void
}) {
  const [facts, setFacts] = useState<FactEntry[]>([])
  const [categories, setCategories] = useState<FactCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [keyword, setKeyword] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [sort, setSort] = useState<'category' | 'recent'>('category')
  const [sourceId, setSourceId] = useState(initialSourceId ?? '')

  const [selected, setSelected] = useState<string[]>([])
  const [editingId, setEditingId] = useState('')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<FactDraft>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState('')

  const [managing, setManaging] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [renamingId, setRenamingId] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const [mergeFrom, setMergeFrom] = useState('')

  /** 拉取列表：来源与搜索交给后端，分类在前端过滤（数据量小，切换更快） */
  const load = async (override?: { sourceId?: string }) => {
    try {
      const result = await fetchFacts({
        sourceId: override?.sourceId ?? sourceId ?? undefined,
        q: keyword.trim() || undefined,
        sort,
      })
      setFacts(result.items)
      setCategories(result.categories)
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '加载词条失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    fetchFacts({ sourceId: initialSourceId || undefined, sort: 'category' })
      .then((result) => {
        if (cancelled) return
        setFacts(result.items)
        setCategories(result.categories)
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError instanceof ApiError ? requestError.message : '加载词条失败')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [initialSourceId])

  const reload = async () => {
    await load()
    onChanged?.()
  }

  /** 分类计数从「未按分类过滤」的列表算，否则选中一个分类后其它按钮就消失了 */
  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const fact of facts) {
      map.set(fact.categoryId, (map.get(fact.categoryId) ?? 0) + 1)
    }
    return map
  }, [facts])

  /** 实际展示：按分类过滤 */
  const visibleFacts = useMemo(
    () => (categoryId ? facts.filter((fact) => fact.categoryId === categoryId) : facts),
    [facts, categoryId],
  )

  /** 来源计数：用于来源筛选下拉 */
  const sourceOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>()
    for (const fact of facts) {
      if (!fact.sourceId) continue
      const current = map.get(fact.sourceId)
      map.set(fact.sourceId, {
        id: fact.sourceId,
        name: fact.sourceName || '未知来源',
        count: (current?.count ?? 0) + 1,
      })
    }
    return [...map.values()]
  }, [facts])

  const activeSource = initialSourceId || sourceId

  const handleSearch = async () => {
    setSelected([])
    await load()
  }

  /** 分类只改变前端筛选，不发请求，点起来更快 */
  const pickCategory = (id: string) => {
    setCategoryId(id)
    setSelected([])
  }

  const startEdit = (fact: FactEntry) => {
    setAdding(false)
    setEditingId(fact.id)
    setDraft({
      categoryId: fact.categoryId,
      categoryLabel: fact.categoryLabel,
      title: fact.title,
      content: fact.content,
      time: fact.time,
    })
  }

  const handleSaveEdit = async () => {
    if (!draft.title.trim() || !draft.content.trim()) {
      setError('标题和内容都要填。')
      return
    }
    setSaving(true)
    setError('')
    try {
      await updateFact(editingId, {
        categoryLabel: draft.categoryLabel || '未分类',
        title: draft.title,
        content: draft.content,
        time: draft.time,
      })
      setEditingId('')
      await reload()
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '保存词条失败')
    } finally {
      setSaving(false)
    }
  }

  const handleCreate = async () => {
    if (!draft.title.trim() || !draft.content.trim()) {
      setError('标题和内容都要填。')
      return
    }
    setSaving(true)
    setError('')
    try {
      await createFact({
        categoryLabel: draft.categoryLabel || '未分类',
        title: draft.title,
        content: draft.content,
        time: draft.time,
      })
      setAdding(false)
      setDraft(EMPTY_DRAFT)
      await reload()
      setNotice('已加一条词条，对话里马上能用。')
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '新增词条失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setSaving(true)
    setError('')
    try {
      await deleteFact(id)
      setSelected((previous) => previous.filter((item) => item !== id))
      await reload()
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '删除词条失败')
    } finally {
      setSaving(false)
    }
  }

  const handleBatch = async (action: 'delete' | 'move') => {
    if (selected.length === 0) return
    if (action === 'move' && !draft.categoryId && !draft.categoryLabel) {
      setError('先在下面的「批量改分类」里选一个分类。')
      return
    }
    setSaving(true)
    setError('')
    try {
      const result = await batchFacts({
        ids: selected,
        action,
        categoryId: action === 'move' ? draft.categoryId || undefined : undefined,
        categoryLabel: action === 'move' ? draft.categoryLabel || undefined : undefined,
      })
      setSelected([])
      await reload()
      setNotice(`处理了 ${result.affected} 条词条。`)
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '批量操作失败')
    } finally {
      setSaving(false)
    }
  }

  const handleRecategorize = async () => {
    setBusy('recategorize')
    setError('')
    setNotice('')
    try {
      const result = await recategorizeFacts()
      await reload()
      setNotice(result.updated > 0 ? `重新归类了 ${result.updated} 条词条。` : '分类已经是最新的，没有需要改的。')
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '重新归类失败')
    } finally {
      setBusy('')
    }
  }

  const handleTidy = async () => {
    setBusy('tidy')
    setError('')
    setNotice('')
    try {
      const result = await tidyFactCategories()
      await reload()
      setNotice(
        result.merged > 0
          ? `合并了 ${result.merged} 个近义分类：${result.detail
              .map((item) => `${item.from}→${item.to}`)
              .join('、')}`
          : '没发现需要合并的分类。',
      )
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '整理分类失败')
    } finally {
      setBusy('')
    }
  }

  const handleCreateCategory = async () => {
    const label = newCategory.trim()
    if (!label) return
    setBusy('create-category')
    setError('')
    try {
      await createFactCategory(label)
      setNewCategory('')
      await reload()
      setNotice(`已新增分类「${label}」。`)
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '新增分类失败')
    } finally {
      setBusy('')
    }
  }

  const handleRenameCategory = async (id: string) => {
    const label = renameValue.trim()
    if (!label) return
    setBusy(`rename-${id}`)
    setError('')
    try {
      await renameFactCategory(id, label)
      setRenamingId('')
      await reload()
      setNotice(`分类已改名为「${label}」。`)
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '改名失败')
    } finally {
      setBusy('')
    }
  }

  const handleMerge = async (targetId: string) => {
    if (!mergeFrom || mergeFrom === targetId) return
    setBusy(`merge-${targetId}`)
    setError('')
    try {
      const result = await mergeFactCategories(mergeFrom, targetId)
      setMergeFrom('')
      setCategoryId('')
      await reload()
      setNotice(`把「${result.from}」合并进「${result.to}」，挪了 ${result.moved} 条词条。`)
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '合并失败')
    } finally {
      setBusy('')
    }
  }

  const handleDeleteCategory = async (id: string) => {
    setBusy(`del-cat-${id}`)
    setError('')
    try {
      await deleteFactCategory(id)
      if (categoryId === id) setCategoryId('')
      await reload()
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '删除分类失败')
    } finally {
      setBusy('')
    }
  }

  if (loading) return <div className="h-40 animate-pulse rounded-xl bg-surface-2" />

  return (
    <div className="space-y-3.5">
      {/* 让所有编辑框的分类输入都能自动补全现有分类 */}
      <datalist id="fact-category-options">
        {categories.map((item) => (
          <option key={item.id} value={item.label} />
        ))}
      </datalist>

      {error && <InlineNotice tone="error">{error}</InlineNotice>}
      {notice && <InlineNotice tone="success">{notice}</InlineNotice>}

      <DistillCard
        icon={<Layers size={14} className="text-accent" />}
        title="全部词条"
        desc="资料、问答、手动添加的词条都汇总在这里；对话回答时优先用它们。"
        action={
          <div className="flex items-center gap-1.5">
            <DistillButton
              size="sm"
              onClick={() => void handleRecategorize()}
              disabled={Boolean(busy)}
            >
              {busy === 'recategorize' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Wand2 size={12} />
              )}
              重新归类
            </DistillButton>
            <DistillButton
              size="sm"
              onClick={() => {
                setEditingId('')
                setDraft(EMPTY_DRAFT)
                setAdding((previous) => !previous)
              }}
            >
              <Plus size={12} />
              加一条
            </DistillButton>
          </div>
        }
      >
        {/* 搜索 + 排序 + 来源筛选 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-[180px] flex-1 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 transition-colors focus-within:border-accent/50">
            <Search size={13} className="shrink-0 text-dim" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleSearch()
              }}
              placeholder="搜标题、内容或来源名"
              aria-label="搜索词条"
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-dim/60"
            />
            {keyword && (
              <button
                type="button"
                aria-label="清空搜索"
                onClick={() => {
                  setKeyword('')
                  setCategoryId('')
                  void fetchFacts({ sourceId: activeSource || undefined, sort }).then((result) => {
                    setFacts(result.items)
                    setCategories(result.categories)
                  })
                }}
                className="shrink-0 text-dim transition-colors hover:text-ink"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <select
            value={sort}
            onChange={(event) => {
              const next = event.target.value === 'recent' ? 'recent' : 'category'
              setSort(next)
              void fetchFacts({
                sourceId: activeSource || undefined,
                categoryId: categoryId || undefined,
                q: keyword.trim() || undefined,
                sort: next,
              }).then((result) => {
                setFacts(result.items)
                setCategories(result.categories)
              })
            }}
            aria-label="排序方式"
            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-[11.5px] text-ink outline-none focus:border-accent/50"
          >
            <option value="category">按分类排</option>
            <option value="recent">按最近修改</option>
          </select>

          {sourceOptions.length > 1 && (
            <select
              value={activeSource}
              onChange={(event) => {
                const next = event.target.value
                setSourceId(next)
                setSelected([])
                void fetchFacts({
                  sourceId: next || undefined,
                  categoryId: categoryId || undefined,
                  q: keyword.trim() || undefined,
                  sort,
                }).then((result) => {
                  setFacts(result.items)
                  setCategories(result.categories)
                })
              }}
              aria-label="按来源筛选"
              className="max-w-[200px] rounded-lg border border-line bg-surface px-2 py-1.5 text-[11.5px] text-ink outline-none focus:border-accent/50"
            >
              <option value="">全部来源</option>
              {sourceOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}（{item.count}）
                </option>
              ))}
            </select>
          )}

          <span className="text-[11px] text-dim">
            共 {visibleFacts.length} 条{activeSource ? ' · 已按来源筛选' : ''}
          </span>
        </div>

        {/* 分类 chips：点一下就是筛选 */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => pickCategory('')}
            className={cn(
              'rounded-md px-2 py-1 text-[11px] transition-colors',
              categoryId === ''
                ? 'bg-accent text-accent-contrast'
                : 'bg-surface-2 text-dim hover:text-ink',
            )}
          >
            全部
          </button>
          {categories
            .filter((item) => (categoryCounts.get(item.id) ?? 0) > 0 || categoryId === item.id)
            .map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => pickCategory(item.id)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors',
                  categoryId === item.id
                    ? 'bg-accent text-accent-contrast'
                    : 'bg-surface-2 text-dim hover:text-ink',
                )}
              >
                {item.label}
                <span className="opacity-70">{categoryCounts.get(item.id) ?? 0}</span>
              </button>
            ))}
          <button
            type="button"
            onClick={() => setManaging((previous) => !previous)}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-line px-2 py-1 text-[11px] text-dim transition-colors hover:border-accent/40 hover:text-ink"
          >
            <Tags size={11} />
            管理分类
          </button>
        </div>

        {/* 分类管理：改名 / 合并 / 删除 */}
        {managing && (
          <div className="mt-2.5 rounded-lg border border-line bg-surface-2/40 p-2.5 animate-fade-in">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11.5px] text-ink">分类管理</span>
              <DistillButton size="sm" onClick={() => void handleTidy()} disabled={Boolean(busy)}>
                {busy === 'tidy' ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                让 AI 合并近义分类
              </DistillButton>
              <span className="text-[10.5px] text-dim">只有没有词条的分类才能删</span>
            </div>

            <ul className="mt-2 divide-y divide-line">
              {categories.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-2 py-1.5">
                  {renamingId === item.id ? (
                    <>
                      <input
                        value={renameValue}
                        maxLength={8}
                        onChange={(event) => setRenameValue(event.target.value)}
                        className={cn(INPUT_CLASS, 'w-[120px]')}
                      />
                      <DistillButton
                        size="sm"
                        variant="primary"
                        onClick={() => void handleRenameCategory(item.id)}
                        disabled={Boolean(busy)}
                      >
                        保存
                      </DistillButton>
                      <DistillButton size="sm" onClick={() => setRenamingId('')}>
                        取消
                      </DistillButton>
                    </>
                  ) : (
                    <>
                      <span className="w-[92px] text-[12px] text-ink">{item.label}</span>
                      <span className="text-[11px] text-dim">
                        {categoryCounts.get(item.id) ?? 0} 条
                        {item.origin === 'seed' && ' · 迁移来的'}
                        {item.origin === 'ai' && ' · AI 建'}
                        {item.origin === 'user' && ' · 你建的'}
                      </span>
                      <div className="ml-auto flex items-center gap-1">
                        <DistillButton
                          size="sm"
                          onClick={() => {
                            setRenamingId(item.id)
                            setRenameValue(item.label)
                          }}
                        >
                          改名
                        </DistillButton>
                        <DistillButton
                          size="sm"
                          onClick={() => setMergeFrom(mergeFrom === item.id ? '' : item.id)}
                        >
                          {mergeFrom === item.id ? '取消合并' : '合并到…'}
                        </DistillButton>
                        <DistillButton
                          size="sm"
                          variant="danger"
                          onClick={() => void handleDeleteCategory(item.id)}
                          disabled={Boolean(busy)}
                        >
                          <Trash2 size={11} />
                        </DistillButton>
                      </div>
                    </>
                  )}

                  {mergeFrom === item.id && (
                    <div className="mt-1 flex w-full flex-wrap items-center gap-1.5 rounded-md bg-surface px-2 py-1.5">
                      <Copy size={11} className="text-dim" />
                      <span className="text-[11px] text-dim">把「{item.label}」合并到：</span>
                      {categories
                        .filter((other) => other.id !== item.id)
                        .map((other) => (
                          <button
                            key={other.id}
                            type="button"
                            onClick={() => void handleMerge(other.id)}
                            disabled={Boolean(busy)}
                            className="rounded border border-line px-1.5 py-0.5 text-[11px] text-ink transition-colors hover:border-accent/40 hover:bg-accent-soft"
                          >
                            {other.label}
                          </button>
                        ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-line pt-2">
              <input
                value={newCategory}
                maxLength={8}
                onChange={(event) => setNewCategory(event.target.value)}
                placeholder="新分类名"
                className={cn(INPUT_CLASS, 'w-[140px]')}
              />
              <DistillButton
                size="sm"
                onClick={() => void handleCreateCategory()}
                disabled={Boolean(busy)}
              >
                <Plus size={11} />
                新建分类
              </DistillButton>
            </div>
          </div>
        )}

        {/* 新增 */}
        {adding && (
          <div className="mt-2.5">
            <FactEditor
              draft={draft}
              onChange={setDraft}
              onSave={() => void handleCreate()}
              onCancel={() => {
                setAdding(false)
                setDraft(EMPTY_DRAFT)
              }}
              saving={saving}
              saveLabel="添加"
            />
          </div>
        )}

        {/* 批量栏 */}
        {selected.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent-soft/30 px-2.5 py-1.5 animate-fade-in">
            <span className="text-[11.5px] text-ink">已选 {selected.length} 条</span>
            <input
              list="fact-category-options"
              value={draft.categoryLabel}
              placeholder="改成哪个分类"
              maxLength={8}
              onChange={(event) => setDraft({ ...draft, categoryLabel: event.target.value, categoryId: '' })}
              className={cn(INPUT_CLASS, 'w-[120px]')}
            />
            <DistillButton size="sm" onClick={() => void handleBatch('move')} disabled={saving}>
              批量改分类
            </DistillButton>
            <DistillButton
              size="sm"
              variant="danger"
              onClick={() => void handleBatch('delete')}
              disabled={saving}
            >
              <Trash2 size={11} />
              批量删除
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

        {/* 列表 */}
        {visibleFacts.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-line px-4 py-5 text-center text-[12px] text-dim">
            {keyword || categoryId || activeSource
              ? '这个筛选下没有词条，换个条件试试。'
              : '还没有词条。先去「资料」传一份简历或获奖证明，AI 会自动整理出词条。'}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {visibleFacts.map((fact) => {
              const checked = selected.includes(fact.id)
              return (
                <li key={fact.id} className="group py-2">
                  {editingId === fact.id ? (
                    <FactEditor
                      draft={draft}
                      onChange={setDraft}
                      onSave={() => void handleSaveEdit()}
                      onCancel={() => setEditingId('')}
                      saving={saving}
                      saveLabel="保存"
                    />
                  ) : (
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelected((previous) =>
                            previous.includes(fact.id)
                              ? previous.filter((item) => item !== fact.id)
                              : [...previous, fact.id],
                          )
                        }
                        aria-label="选择这条词条"
                        className="mt-1 h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
                      />

                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-baseline gap-1.5 text-[12.5px] text-ink">
                          <span className="rounded bg-accent-soft px-1 text-[10px] text-accent">
                            {fact.categoryLabel}
                          </span>
                          <span className="font-medium">{fact.title}</span>
                          {fact.time && <span className="text-[11px] text-dim">{fact.time}</span>}
                          {fact.origin === 'user' && (
                            <span className="rounded bg-accent-soft px-1 text-[10px] text-accent">
                              改过
                            </span>
                          )}
                          {fact.duplicateCount > 1 && (
                            <span className="rounded bg-[#B4322F]/10 px-1 text-[10px] text-[#B4322F] dark:text-[#F08C7A]">
                              疑似重复 ×{fact.duplicateCount}
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-[11.5px] leading-[1.7] text-dim">{fact.content}</p>
                        <p className="mt-0.5 text-[10.5px] text-dim/80">
                          {sourceLabel(fact)}
                          {fact.sourceName ? ` · ${fact.sourceName}` : ''}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => startEdit(fact)}
                          aria-label="编辑词条"
                          title="编辑"
                          className="flex h-6 w-6 items-center justify-center rounded text-dim transition-colors hover:bg-surface hover:text-ink"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(fact.id)}
                          disabled={saving}
                          aria-label="删除词条"
                          title="删除"
                          className="flex h-6 w-6 items-center justify-center rounded text-dim transition-colors hover:bg-[#B4322F]/10 hover:text-[#B4322F]"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {activeSource && onClearSource && (
          <button
            type="button"
            onClick={onClearSource}
            className="mt-2 text-[11px] text-dim transition-colors hover:text-ink"
          >
            清除来源筛选，看全部词条
          </button>
        )}
      </DistillCard>
    </div>
  )
}
