import { CircleCheck, Loader2, Save, Sparkles, Trash2, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { InlineNotice } from '@/components/ui/InlineNotice'
import {
  ApiError,
  applyPersonaDraft,
  discardPersonaDraft,
  fetchPersona,
  generatePersonaDraft,
  savePersona,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import type { CatchphraseFrequency, Persona, PersonaState } from '@/types/distill'
import {
  DistillButton,
  DistillCard,
  DistillTagField,
  DistillTextArea,
  DistillTextField,
} from './DistillFields'

const FREQUENCY_OPTIONS: CatchphraseFrequency[] = ['高', '中', '低']

/** 把草稿和当前表单合并，方便预览「应用后会变成什么样」 */
function personaFromState(state: PersonaState): Persona {
  return state.draft ?? state.persona
}

/**
 * 人设面板：先看 AI 从你文字里总结出的特征，确认后才会影响对话。
 * 草稿只存在 personaDraft 里，点「应用」才覆盖正式人设，避免误覆盖手写内容。
 */
export function DistillPersonaPanel() {
  const [state, setState] = useState<PersonaState | null>(null)
  const [form, setForm] = useState<Persona | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchPersona()
      .then((result) => {
        if (cancelled) return
        setState(result)
        setForm(result.persona)
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError instanceof ApiError ? requestError.message : '加载人设失败')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  /** 表单局部更新：所有字段都从这里改，保证 dirty 标记准确 */
  const patch = (updater: (current: Persona) => Persona) => {
    setForm((current) => (current ? updater(current) : current))
    setDirty(true)
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setError('')
    setNotice('')
    try {
      const result = await generatePersonaDraft()
      setState(result)
      setForm(personaFromState(result))
      setDirty(false)
      setNotice('草稿生成好了，看看像不像你；点「应用这份草稿」才会真正生效。')
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '生成草稿失败')
    } finally {
      setGenerating(false)
    }
  }

  const handleApplyDraft = async () => {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await applyPersonaDraft()
      setState(result)
      setForm(result.persona)
      setDirty(false)
      setNotice('已应用，之后的对话都会照这个风格说话。')
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '应用草稿失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDiscardDraft = async () => {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await discardPersonaDraft()
      setState(result)
      setForm(result.persona)
      setDirty(false)
      setNotice('草稿已丢弃。')
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '丢弃草稿失败')
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    if (!form) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await savePersona(form)
      setState(result)
      setForm(result.persona)
      setDirty(false)
      setNotice('人设卡已保存。')
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '保存人设失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="h-40 animate-pulse rounded-xl bg-surface-2" />
  if (!form) return <InlineNotice tone="error">{error || '人设卡加载失败'}</InlineNotice>

  const hasDraft = Boolean(state?.draft)

  return (
    <div className="space-y-3.5">
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
      {notice && <InlineNotice tone="success">{notice}</InlineNotice>}

      {hasDraft && (
        <div className="rounded-xl border border-accent/30 bg-accent-soft/40 p-4 animate-fade-in">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-1.5 text-[13.5px] font-medium text-ink">
                <Sparkles size={14} className="text-accent" />
                AI 生成了一份草稿，还没生效
              </h2>
              <p className="mt-1 text-[11.5px] leading-[1.75] text-dim">
                下面表单里显示的就是草稿内容，可以改完再应用；不要的话直接丢弃。
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <DistillButton variant="primary" onClick={() => void handleApplyDraft()} disabled={saving}>
                <CircleCheck size={13} />
                应用这份草稿
              </DistillButton>
              <DistillButton onClick={() => void handleDiscardDraft()} disabled={saving}>
                <Trash2 size={13} />
                丢弃
              </DistillButton>
            </div>
          </div>
        </div>
      )}

      <DistillCard
        icon={<UserRound size={14} className="text-accent" />}
        title="人设卡"
        desc="这里写的每一条都会塞进对话的系统提示词，决定分身怎么说话。系统提示词只会注入填了的字段。"
        action={
          <DistillButton variant="primary" onClick={() => void handleGenerate()} disabled={generating}>
            {generating ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                正在读你的文字…
              </>
            ) : (
              <>
                <Sparkles size={13} />
                让 AI 生成草稿
              </>
            )}
          </DistillButton>
        }
      >
        <div className="space-y-3">
          <DistillTextArea
            label="身份"
            value={form.identity}
            onChange={(value) => patch((current) => ({ ...current, identity: value }))}
            placeholder="一句话：你是谁、在做什么"
            maxLength={400}
          />
          <DistillTextField
            label="怎么称呼访客"
            value={form.addressing}
            onChange={(value) => patch((current) => ({ ...current, addressing: value }))}
            placeholder="例如：直接说「你」，不用敬语"
            maxLength={200}
          />
        </div>
      </DistillCard>

      <DistillCard title="说话方式" desc="越具体越像你。写「习惯用短句，一句一断」比写「简洁」有用。">
        <div className="space-y-3">
          <DistillTextField
            label="句子长度"
            value={form.speaking.sentenceLength}
            onChange={(value) =>
              patch((current) => ({
                ...current,
                speaking: { ...current.speaking, sentenceLength: value },
              }))
            }
            maxLength={120}
          />
          <DistillTagField
            label="常用词"
            hint="最多 10 个"
            values={form.speaking.commonWords}
            onChange={(values) =>
              patch((current) => ({
                ...current,
                speaking: { ...current.speaking, commonWords: values },
              }))
            }
          />
          <DistillTextField
            label="标点习惯"
            value={form.speaking.punctuation}
            onChange={(value) =>
              patch((current) => ({
                ...current,
                speaking: { ...current.speaking, punctuation: value },
              }))
            }
            maxLength={200}
          />
          <DistillTextField
            label="表情符号"
            value={form.speaking.emoji}
            onChange={(value) =>
              patch((current) => ({
                ...current,
                speaking: { ...current.speaking, emoji: value },
              }))
            }
            placeholder="例如：不用 / 偶尔用 🙂"
            maxLength={120}
          />
          <DistillTagField
            label="绝不会说的词"
            hint="最多 10 个"
            values={form.speaking.neverSay}
            onChange={(values) =>
              patch((current) => ({
                ...current,
                speaking: { ...current.speaking, neverSay: values },
              }))
            }
          />
        </div>
      </DistillCard>

      <DistillCard title="情绪表达" desc="遇到这些场景时你会是什么反应。">
        <div className="grid gap-3 sm:grid-cols-3">
          <DistillTextArea
            label="关心时"
            rows={3}
            value={form.emotion.caring}
            onChange={(value) =>
              patch((current) => ({ ...current, emotion: { ...current.emotion, caring: value } }))
            }
            maxLength={200}
          />
          <DistillTextArea
            label="不满时"
            rows={3}
            value={form.emotion.upset}
            onChange={(value) =>
              patch((current) => ({ ...current, emotion: { ...current.emotion, upset: value } }))
            }
            maxLength={200}
          />
          <DistillTextArea
            label="开玩笑时"
            rows={3}
            value={form.emotion.joking}
            onChange={(value) =>
              patch((current) => ({ ...current, emotion: { ...current.emotion, joking: value } }))
            }
            maxLength={200}
          />
        </div>
      </DistillCard>

      <DistillCard title="知识边界" desc="哪些懂、哪些不懂，决定分身什么时候说「这个我不清楚」。">
        <div className="space-y-3">
          <DistillTextArea
            label="懂的"
            value={form.boundaries.knows}
            onChange={(value) =>
              patch((current) => ({ ...current, boundaries: { ...current.boundaries, knows: value } }))
            }
            maxLength={500}
          />
          <DistillTextArea
            label="不懂的"
            value={form.boundaries.unknown}
            onChange={(value) =>
              patch((current) => ({
                ...current,
                boundaries: { ...current.boundaries, unknown: value },
              }))
            }
            maxLength={500}
          />
          <DistillTextArea
            label="会被敷衍的话题"
            value={form.boundaries.deflect}
            onChange={(value) =>
              patch((current) => ({
                ...current,
                boundaries: { ...current.boundaries, deflect: value },
              }))
            }
            maxLength={300}
          />
        </div>
      </DistillCard>

      <DistillCard
        title="口头禅"
        desc="说话时容易带出来的固定说法，最多 8 条。"
        action={
          <DistillButton
            size="sm"
            onClick={() =>
              patch((current) => ({
                ...current,
                catchphrases: [...current.catchphrases, { text: '', frequency: '中' }],
              }))
            }
            disabled={form.catchphrases.length >= 8}
          >
            加一条
          </DistillButton>
        }
      >
        {form.catchphrases.length === 0 ? (
          <p className="text-[12px] text-dim">还没有口头禅，可以手动加，也可以让 AI 生成草稿。</p>
        ) : (
          <ul className="space-y-2">
            {form.catchphrases.map((item, index) => (
              <li key={index} className="flex items-center gap-2">
                <input
                  value={item.text}
                  maxLength={40}
                  placeholder="例如：差不多得了"
                  onChange={(event) =>
                    patch((current) => ({
                      ...current,
                      catchphrases: current.catchphrases.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, text: event.target.value } : entry,
                      ),
                    }))
                  }
                  className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors placeholder:text-dim/60 focus:border-accent/50"
                />
                <div className="flex shrink-0 overflow-hidden rounded-lg border border-line">
                  {FREQUENCY_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() =>
                        patch((current) => ({
                          ...current,
                          catchphrases: current.catchphrases.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, frequency: option } : entry,
                          ),
                        }))
                      }
                      className={cn(
                        'px-2.5 py-1.5 text-[11.5px] transition-colors',
                        item.frequency === option
                          ? 'bg-accent text-accent-contrast'
                          : 'text-dim hover:bg-surface-2',
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  aria-label="删除这条口头禅"
                  onClick={() =>
                    patch((current) => ({
                      ...current,
                      catchphrases: current.catchphrases.filter(
                        (_, entryIndex) => entryIndex !== index,
                      ),
                    }))
                  }
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-dim transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DistillCard>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <DistillButton variant="primary" onClick={() => void handleSave()} disabled={saving}>
          <Save size={13} />
          {saving ? '保存中…' : '保存人设卡'}
        </DistillButton>
        <span className="text-[11.5px] text-dim">
          {dirty
            ? '有未保存的改动'
            : state?.persona.updatedAt
              ? `上次保存：${state.persona.updatedAt.slice(0, 16).replace('T', ' ')}`
              : '还没保存过'}
        </span>
      </div>
    </div>
  )
}
