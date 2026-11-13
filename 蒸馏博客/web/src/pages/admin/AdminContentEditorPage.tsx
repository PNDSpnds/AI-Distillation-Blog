import { ArrowLeft, Save } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FilePickField } from '@/components/admin/FilePickField'
import { InlineNotice } from '@/components/ui/InlineNotice'
import {
  ApiError,
  createContent,
  fetchContent,
  fetchSettings,
  updateContent,
} from '@/lib/api'
import { KIND_FORMS, getKindConfig, type FieldKey } from '@/lib/content-kinds'
import { cn } from '@/lib/utils'
import { CONTENT_KIND_LABELS, type ContentKind } from '@/types/chat'

interface FormState {
  kind: ContentKind
  title: string
  summary: string
  category: string
  tags: string
  body: string
  jumpUrl: string
  published: boolean
  pinned: boolean
}

const EMPTY_FORM: FormState = {
  kind: 'program',
  title: '',
  summary: '',
  category: '',
  tags: '',
  body: '',
  jumpUrl: '',
  published: true,
  pinned: false,
}

/** 编辑字段顺序：所有类型共用，按类型过滤显示 */
const FIELD_ORDER: FieldKey[] = [
  'title',
  'summary',
  'cover',
  'category',
  'tags',
  'body',
  'jumpUrl',
  'file',
]

const BODY_MAX = 20000

/** 上传/编辑内容：统一表单，字段随内容类型变化，右侧实时预览卡片 */
export function AdminContentEditorPage() {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id)
  const navigate = useNavigate()

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [attachFile, setAttachFile] = useState<File | null>(null)
  const [coverRemoved, setCoverRemoved] = useState(false)
  const [fileRemoved, setFileRemoved] = useState(false)
  const [existing, setExisting] = useState({
    coverUrl: '',
    fileName: '',
    fileSizeText: '',
  })
  const [coverPreview, setCoverPreview] = useState('')
  const [categories, setCategories] = useState<string[]>([])

  // 用“已加载的 id”推导加载态，避免在 effect 里同步 setState
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const loading = isEditing && loadedId !== id

  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState('')
  // 错误表的键是字段名（含 cover/file 等非文本字段），所以用宽泛的 string
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({})

  // 初始快照用于判断“是否有未保存的修改”；放 state 里，渲染期间读取才符合 React 规则
  const [initialSnapshot, setInitialSnapshot] = useState(() => JSON.stringify(EMPTY_FORM))
  const kindConfig = useMemo(() => getKindConfig(form.kind), [form.kind])

  /** 分类候选来自设置页，避免这里写死一份 */
  useEffect(() => {
    let cancelled = false
    fetchSettings()
      .then((data) => {
        if (!cancelled) setCategories(data.categories ?? [])
      })
      .catch(() => {
        if (!cancelled) setCategories([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 编辑模式：先把已有内容读回来填进表单
  useEffect(() => {
    if (!id) return
    let cancelled = false

    fetchContent(id)
      .then(({ item }) => {
        if (cancelled) return
        const nextForm: FormState = {
          kind: item.kind,
          title: item.title,
          summary: item.summary,
          category: item.category,
          tags: item.tags.join(', '),
          body: item.body,
          jumpUrl: item.jumpUrl,
          published: item.published,
          pinned: item.pinned,
        }
        setForm(nextForm)
        setExisting({
          coverUrl: item.coverUrl,
          fileName: item.fileName,
          fileSizeText: item.fileSizeText,
        })
        setInitialSnapshot(JSON.stringify(nextForm))
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError instanceof ApiError ? requestError.message : '加载内容失败')
        }
      })
      .finally(() => {
        if (!cancelled) setLoadedId(id)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  // 新建时初始快照就是空表单，无需额外 effect

  const dirty =
    JSON.stringify(form) !== initialSnapshot ||
    Boolean(coverFile) ||
    Boolean(attachFile) ||
    coverRemoved ||
    fileRemoved

  // 关闭标签页 / 刷新时提醒，避免写了一半直接丢
  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  /** 站内跳转前的确认；返回 true 表示可以离开 */
  const confirmLeave = useCallback(() => {
    if (!dirty) return true
    return window.confirm('有未保存的修改，确定离开吗？')
  }, [dirty])

  const update = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => ({ ...current, [key]: undefined }))
    setError('')
  }, [])

  /** 校验并返回第一处出错字段，便于滚动定位 */
  const validate = () => {
    const nextErrors: Record<string, string> = {}
    if (!form.title.trim()) nextErrors.title = '标题不能为空'
    if (!form.summary.trim()) nextErrors.summary = '简介不能为空，卡片和搜索结果都用它'
    if (form.body.length > BODY_MAX) nextErrors.body = `正文不能超过 ${BODY_MAX} 字`
    if (form.jumpUrl.trim() && !/^(https?:\/\/|\/)/i.test(form.jumpUrl.trim())) {
      nextErrors.jumpUrl = '链接需要以 http://、https:// 或 / 开头'
    }
    setFieldErrors(nextErrors)

    const firstKey = FIELD_ORDER.find((key) => nextErrors[key])
    if (firstKey) {
      const anchor = document.getElementById(`field-${firstKey}`)
      anchor?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      anchor?.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true })
    }

    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    if (!validate()) return

    setSaving(true)
    setError('')
    setProgress(null)

    const payload = new FormData()
    payload.append('kind', form.kind)
    payload.append('title', form.title.trim())
    payload.append('summary', form.summary.trim())
    payload.append('category', form.category.trim())
    payload.append('tags', form.tags)
    payload.append('body', form.body)
    payload.append('jumpUrl', form.jumpUrl.trim())
    payload.append('published', String(form.published))
    payload.append('pinned', String(form.pinned))
    if (coverFile) payload.append('cover', coverFile)
    if (attachFile) payload.append('file', attachFile)
    if (coverRemoved) payload.append('removeCover', 'true')
    if (fileRemoved) payload.append('removeFile', 'true')

    const onProgress = (percent: number) => setProgress(percent)

    try {
      if (isEditing && id) await updateContent(id, payload, onProgress)
      else await createContent(payload, onProgress)

      navigate('/admin/contents', {
        replace: true,
        state: { notice: `已${isEditing ? '保存' : '发布'}《${form.title.trim()}》` },
      })
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '保存失败，稍后再试')
    } finally {
      setSaving(false)
      setProgress(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-40 animate-pulse rounded bg-surface-2" />
        <div className="h-64 animate-pulse rounded-xl bg-surface-2" />
      </div>
    )
  }

  const hasCover = Boolean(coverFile) || (Boolean(existing.coverUrl) && !coverRemoved)
  const hasFile = Boolean(attachFile) || (Boolean(existing.fileName) && !fileRemoved)

  const renderField = (field: FieldKey) => {
    switch (field) {
      case 'title':
        return (
          <Field key={field} anchor="title" label="标题" required error={fieldErrors.title}>
            <input
              value={form.title}
              onChange={(event) => update('title', event.target.value)}
              placeholder="起一个能一眼看懂的名字"
              maxLength={80}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none transition-colors focus:border-accent/50"
            />
          </Field>
        )

      case 'summary':
        return (
          <Field
            key={field}
            anchor="summary"
            label="简介"
            required
            error={fieldErrors.summary}
            hint={`${form.summary.length}/300`}
          >
            <textarea
              value={form.summary}
              onChange={(event) => update('summary', event.target.value)}
              placeholder="一到两句话，说明这是什么、为什么值得看"
              maxLength={300}
              rows={2}
              className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] leading-[1.7] text-ink outline-none transition-colors focus:border-accent/50"
            />
          </Field>
        )

      case 'cover':
        return (
          <Field
            key={field}
            anchor="cover"
            label="展示图"
            hint="16:9 或 4:3，≤ 5MB，可拖拽"
            error={fieldErrors.cover}
          >
            <FilePickField
              label="选择展示图"
              hint="PNG / JPG / WebP"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              formats="PNG / JPG / WebP"
              image
              file={coverFile}
              existingUrl={existing.coverUrl}
              existingName={existing.coverUrl ? '已上传封面' : ''}
              existingRemoved={coverRemoved}
              onPick={setCoverFile}
              onRemoveExisting={() => setCoverRemoved(true)}
              onPreviewChange={setCoverPreview}
            />
          </Field>
        )

      case 'category':
        return (
          <Field key={field} anchor="category" label="分类" hint="用一个词概括，方便筛选">
            <input
              value={form.category}
              onChange={(event) => update('category', event.target.value)}
              placeholder="例如：项目、随笔、音乐"
              maxLength={30}
              list="category-options"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none transition-colors focus:border-accent/50"
            />
            <datalist id="category-options">
              {categories.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </Field>
        )

      case 'tags':
        return (
          <Field key={field} anchor="tags" label="标签" hint="用逗号分隔，最多 8 个">
            <input
              value={form.tags}
              onChange={(event) => update('tags', event.target.value)}
              placeholder="例如：工具, 效率"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none transition-colors focus:border-accent/50"
            />
          </Field>
        )

      case 'body':
        return (
          <Field
            key={field}
            anchor="body"
            label={kindConfig.bodyLabel}
            error={fieldErrors.body}
            hint={`${form.body.length}/${BODY_MAX}`}
          >
            <textarea
              value={form.body}
              onChange={(event) => update('body', event.target.value)}
              placeholder={kindConfig.bodyPlaceholder}
              rows={8}
              className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] leading-[1.8] text-ink outline-none transition-colors focus:border-accent/50"
            />
          </Field>
        )

      case 'jumpUrl':
        return (
          <Field
            key={field}
            anchor="jumpUrl"
            label={kindConfig.jumpLabel}
            error={fieldErrors.jumpUrl}
            hint="访客点卡片时的去向"
          >
            <input
              value={form.jumpUrl}
              onChange={(event) => update('jumpUrl', event.target.value)}
              placeholder={kindConfig.jumpPlaceholder}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none transition-colors focus:border-accent/50"
            />
          </Field>
        )

      case 'file':
        return (
          <Field key={field} anchor="file" label={kindConfig.fileLabel} error={fieldErrors.file}>
            <FilePickField
              label="选择文件"
              hint={kindConfig.fileHint}
              formats={kindConfig.fileFormats}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.json,.zip,.rar,.7z,.exe,.msi,.apk,.dmg,.mp3,.wav,.flac,.m4a,.mp4,.mov,.webm,.mkv,.png,.jpg,.jpeg,.webp,.gif,.psd,.ai,.sketch,.fig"
              file={attachFile}
              existingName={existing.fileName}
              existingSizeText={existing.fileSizeText}
              existingRemoved={fileRemoved}
              onPick={setAttachFile}
              onRemoveExisting={() => setFileRemoved(true)}
            />
          </Field>
        )

      default:
        return null
    }
  }

  const submitLabel = saving
    ? progress !== null && progress < 100
      ? `上传中 ${progress}%`
      : '正在保存…'
    : isEditing
      ? '保存修改'
      : '发布内容'

  return (
    <div className="animate-fade-in pb-20 lg:pb-0">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/admin/contents"
          onClick={(event) => {
            if (!confirmLeave()) event.preventDefault()
          }}
          className="inline-flex items-center gap-1.5 text-[12.5px] text-dim transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} />
          返回列表
        </Link>
        <span className="text-[11px] text-dim">
          {isEditing ? '编辑内容' : '新内容'}
          {dirty && <span className="ml-2 text-accent">· 未保存</span>}
        </span>
      </div>

      <h1 className="mt-3 font-serif text-[24px] font-medium">
        {isEditing ? `编辑《${form.title || '未命名'}》` : '上传新内容'}
      </h1>
      <p className="mt-1.5 text-[12.5px] leading-[1.8] text-dim">
        选好类型后，下面只显示这类内容需要的字段。上传的文件会自动生成下载地址。
      </p>

      <form
        id="content-form"
        onSubmit={handleSubmit}
        className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]"
      >
        <div className="space-y-4">
          {/* 类型选择：统一上传窗口的核心，换类型只换字段 */}
          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="text-[13px] font-medium text-ink">内容类型</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {KIND_FORMS.map((config) => {
                const active = form.kind === config.kind
                return (
                  <button
                    key={config.kind}
                    type="button"
                    onClick={() => update('kind', config.kind)}
                    aria-pressed={active}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-[12.5px] transition-all',
                      active
                        ? 'border-accent/50 bg-accent-soft text-accent'
                        : 'border-line text-dim hover:bg-surface-2 hover:text-ink',
                    )}
                  >
                    {CONTENT_KIND_LABELS[config.kind]}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[11.5px] text-dim">{kindConfig.hint}</p>
          </div>

          <div className="space-y-4 rounded-xl border border-line bg-surface p-4">
            {FIELD_ORDER.filter((field) => kindConfig.fields.includes(field)).map(renderField)}
          </div>

          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface p-4">
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ink">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(event) => update('published', event.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              立即上架
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ink">
              <input
                type="checkbox"
                checked={form.pinned}
                onChange={(event) => update('pinned', event.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              在列表中置顶
            </label>
            <span className="text-[11.5px] text-dim">
              未上架的内容不会出现在公开页面，也不会被 AI 引用。
            </span>
          </div>

          {error && <InlineNotice tone="error">{error}</InlineNotice>}

          <div className="hidden items-center gap-2 lg:flex">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accent-contrast transition-all hover:brightness-105 disabled:opacity-60"
            >
              <Save size={15} strokeWidth={1.9} />
              {submitLabel}
            </button>
            <Link
              to="/admin/contents"
              onClick={(event) => {
                if (!confirmLeave()) event.preventDefault()
              }}
              className="rounded-lg border border-line px-4 py-2 text-[13px] text-dim transition-colors hover:bg-surface-2 hover:text-ink"
            >
              取消
            </Link>
          </div>
        </div>

        {/* 右侧实时预览：改什么就长什么样，不用发布后再回来看 */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-dim">卡片预览</p>
            <PreviewCard
              kind={form.kind}
              kindLabel={CONTENT_KIND_LABELS[form.kind]}
              title={form.title}
              summary={form.summary}
              category={form.category}
              coverUrl={coverPreview || (hasCover ? existing.coverUrl : '')}
              actionLabel={hasFile ? '下载' : form.jumpUrl.trim() ? '打开' : '查看'}
            />
            <p className="mt-3 text-[11px] leading-[1.7] text-dim">
              这就是访客在回答下面看到的样子。标题留空会显示占位文字。
            </p>
          </div>
        </aside>
      </form>

      {/* 移动端：保存按钮固定在底部，不用滚到底 */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <button
            type="submit"
            form="content-form"
            disabled={saving}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-[13px] font-medium text-accent-contrast transition-all disabled:opacity-60"
          >
            <Save size={15} strokeWidth={1.9} />
            {submitLabel}
          </button>
          <Link
            to="/admin/contents"
            onClick={(event) => {
              if (!confirmLeave()) event.preventDefault()
            }}
            className="rounded-lg border border-line px-4 py-2.5 text-[13px] text-dim"
          >
            取消
          </Link>
        </div>
      </div>
    </div>
  )
}

/** 卡片预览：与首页 ContentCard 同一套视觉，尺寸略大便于核对 */
function PreviewCard({
  kindLabel,
  title,
  summary,
  category,
  coverUrl,
  actionLabel,
}: {
  kind: ContentKind
  kindLabel: string
  title: string
  summary: string
  category: string
  coverUrl: string
  actionLabel: string
}) {
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface-2/40">
      <div className="flex h-[72px] w-full items-center justify-center overflow-hidden bg-surface-2">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="select-none font-serif text-[22px] text-dim">
            {(title.trim() || '未').slice(0, 1)}
          </span>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2">
          <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent">
            {kindLabel}
          </span>
          {category.trim() && <span className="text-[10.5px] text-dim">{category.trim()}</span>}
        </div>
        <p className="mt-1.5 truncate text-[13.5px] font-medium text-ink">
          {title.trim() || '未命名内容'}
        </p>
        <p className="mt-1 line-clamp-2 text-[11.5px] leading-[1.6] text-dim">
          {summary.trim() || '这里显示简介，访客在回答下方看到的就是这两行。'}
        </p>
        <p className="mt-2 text-[11px] text-accent">{actionLabel}</p>
      </div>
    </div>
  )
}

/** 表单字段包装：统一标签、必填星号、错误提示与定位锚点 */
function Field({
  anchor,
  label,
  required,
  hint,
  error,
  children,
}: {
  anchor: FieldKey
  label: string
  required?: boolean
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div id={`field-${anchor}`} className="scroll-mt-24 space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-ink">
          {label}
          {required && <span className="ml-0.5 text-accent">*</span>}
        </span>
        {hint && <span className="text-[11.5px] text-dim">{hint}</span>}
      </div>
      {children}
      {error && <p className="text-[11.5px] text-[#B4322F] dark:text-[#F08C7A]">{error}</p>}
    </div>
  )
}
