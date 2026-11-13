import { Download, Eye, EyeOff, Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { InlineNotice } from '@/components/ui/InlineNotice'
import {
  ApiError,
  backupDownloadUrl,
  cleanOrphanFiles,
  fetchBackups,
  fetchOrphanFiles,
  fetchSettings,
  saveSettings,
} from '@/lib/api'
import type { BackupItem, OrphanFile, SiteSettings } from '@/types/content'
/** 设置：站点门面文案 + 推荐问题 + 分类 + 模型地址 */
export function AdminSettingsPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // key 单独放在本地状态：只在用户主动填写时提交，绝不回填已保存的值
  const [apiKey, setApiKey] = useState('')
  const [clearKey, setClearKey] = useState(false)
  const [keyVisible, setKeyVisible] = useState(false)
  // 改模型地址要二次确认后台密码
  const [confirmPassword, setConfirmPassword] = useState('')
  const [originalBaseUrl, setOriginalBaseUrl] = useState('')
  const [backups, setBackups] = useState<BackupItem[]>([])
  // 文件体检：没人引用的上传文件（内容删了、附件还在）
  const [orphans, setOrphans] = useState<OrphanFile[]>([])
  const [cleaning, setCleaning] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetchSettings()
      .then((data) => {
        if (cancelled) return
        setSettings(data)
        setOriginalBaseUrl(data.model.baseUrl)
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError instanceof ApiError ? requestError.message : '读取设置失败')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // 备份列表单独取：它跟站点设置无关，失败也不影响页面主体
  useEffect(() => {
    let cancelled = false
    fetchBackups()
      .then((data) => {
        if (!cancelled) setBackups(data.items)
      })
      .catch(() => {
        if (!cancelled) setBackups([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 文件体检同样单独取，失败就当"没有孤儿文件"，不打扰页面主体
  useEffect(() => {
    let cancelled = false
    fetchOrphanFiles()
      .then((data) => {
        if (!cancelled) setOrphans(data.items)
      })
      .catch(() => {
        if (!cancelled) setOrphans([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleCleanOrphans = async () => {
    setCleaning(true)
    setError('')
    setNotice('')
    try {
      const result = await cleanOrphanFiles()
      setOrphans([])
      setNotice(`已清理 ${result.removed} 个没人引用的文件。`)
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '清理失败')
    } finally {
      setCleaning(false)
    }
  }

  const update = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => {
    setSettings((current) => (current ? { ...current, [key]: value } : current))
    setNotice('')
  }

  const updateSuggestion = (index: number, key: 'text' | 'hint', value: string) => {
    setSettings((current) => {
      if (!current) return current
      const next = [...current.suggestions]
      next[index] = { ...next[index], [key]: value }
      return { ...current, suggestions: next }
    })
    setNotice('')
  }

  const addSuggestion = () => {
    setSettings((current) => {
      if (!current || current.suggestions.length >= 6) return current
      return { ...current, suggestions: [...current.suggestions, { text: '', hint: '' }] }
    })
  }

  const removeSuggestion = (index: number) => {
    setSettings((current) => {
      if (!current) return current
      return { ...current, suggestions: current.suggestions.filter((_, i) => i !== index) }
    })
  }

  /** 地址被改过才需要密码；顺带提示 http 公网地址会明文传 Key */
  const baseUrlChanged = Boolean(
    settings &&
      originalBaseUrl &&
      settings.model.baseUrl.trim().replace(/\/+$/, '') !== originalBaseUrl,
  )
  const insecureTarget = baseUrlChanged && /^http:\/\//i.test(settings?.model.baseUrl ?? '')

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!settings || saving) return

    setSaving(true)
    setError('')
    setNotice('')

    try {
      const saved = await saveSettings({
        ...settings,
        suggestions: settings.suggestions.filter((item) => item.text.trim()),
        llmApiKey: apiKey.trim() || undefined,
        clearLlmKey: clearKey || undefined,
        confirmPassword: baseUrlChanged ? confirmPassword : undefined,
      })
      setSettings(saved)
      setOriginalBaseUrl(saved.model.baseUrl)
      setApiKey('')
      setClearKey(false)
      setConfirmPassword('')
      setNotice('已保存，公开页面会立即使用新内容')
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !settings) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-40 animate-pulse rounded bg-surface-2" />
        <div className="h-72 animate-pulse rounded-xl bg-surface-2" />
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <h1 className="font-serif text-[24px] font-medium">设置</h1>
      <p className="mt-1.5 text-[12.5px] leading-[1.8] text-dim">
        这些内容会直接出现在访客看到的主页上。改完记得保存。
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <section className="space-y-4 rounded-xl border border-line bg-surface p-4">
          <h2 className="text-[13px] font-medium text-ink">站点信息</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="站点名称"
              value={settings.siteName}
              onChange={(value) => update('siteName', value)}
              hint="显示在侧边栏和标题"
            />
            <TextField
              label="你的称呼"
              value={settings.ownerName}
              onChange={(value) => update('ownerName', value)}
              hint="AI 会用这个称呼指代自己"
            />
          </div>

          <TextField
            label="开场问候"
            value={settings.greeting}
            onChange={(value) => update('greeting', value)}
            hint="首屏最大的那句话"
          />

          <TextAreaField
            label="开场自述"
            value={settings.intro}
            onChange={(value) => update('intro', value)}
            hint="两三句话，说明你是谁、可以问什么"
            rows={3}
          />

          <TextField
            label="页脚"
            value={settings.footer}
            onChange={(value) => update('footer', value)}
            hint="一行小字，通常写授权说明"
          />
        </section>

        <section className="rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[13px] font-medium text-ink">推荐问题</h2>
              <p className="mt-0.5 text-[11.5px] text-dim">
                显示在输入框下方，最多 6 条。建议 3 条覆盖不同领域。
              </p>
            </div>
            <button
              type="button"
              onClick={addSuggestion}
              disabled={settings.suggestions.length >= 6}
              className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-dim transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
            >
              <Plus size={13} />
              添加
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {settings.suggestions.map((item, index) => (
              <div key={index} className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={item.text}
                  onChange={(event) => updateSuggestion(index, 'text', event.target.value)}
                  placeholder="访客会问的问题，例如：你最近在做什么？"
                  aria-label={`推荐问题 ${index + 1}`}
                  className="min-w-0 flex-[2] rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-accent/50"
                />
                <input
                  value={item.hint}
                  onChange={(event) => updateSuggestion(index, 'hint', event.target.value)}
                  placeholder="副标题，例如：看看最新动态"
                  aria-label={`推荐问题 ${index + 1} 的副标题`}
                  className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-accent/50"
                />
                <button
                  type="button"
                  onClick={() => removeSuggestion(index)}
                  aria-label={`删除推荐问题 ${index + 1}`}
                  className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border border-line text-dim transition-colors hover:bg-[#B4322F]/10 hover:text-[#B4322F]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="text-[13px] font-medium text-ink">分类</h2>
          <p className="mt-0.5 text-[11.5px] text-dim">用逗号分隔，上传内容时可以直接选。</p>
          <input
            value={settings.categories.join(', ')}
            onChange={(event) =>
              update(
                'categories',
                event.target.value
                  .split(/[,，]/)
                  .map((item) => item.trim())
                  .filter(Boolean),
              )
            }
            placeholder="随笔, 项目, 作品"
            className="mt-2.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-accent/50"
          />
        </section>

        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="text-[13px] font-medium text-ink">模型服务</h2>
          <p className="mt-0.5 text-[11.5px] leading-[1.7] text-dim">
            Key 加密保存在服务器上，页面只显示末 4 位。填完保存即可，不用重启。
          </p>

          {settings.passwordNeedsChange && (
            <p className="mt-2 rounded-lg border border-[#B4322F]/30 bg-[#B4322F]/10 px-3 py-2 text-[11.5px] leading-[1.7] text-[#B4322F] dark:text-[#F08C7A]">
              后台密码不够安全：{settings.passwordWarning}。为防止别人登进来把 Key 导走，改成更强的密码之前这里不允许修改。
              退出后在后台登录页点「修改密码」即可，改完立刻生效。
            </p>
          )}

          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <TextField
              label="Base URL"
              value={settings.model.baseUrl}
              onChange={(value) =>
                update('model', { ...settings.model, baseUrl: value })
              }
              hint="OpenAI 兼容端点"
            />
            <TextField
              label="模型名称"
              value={settings.model.model}
              onChange={(value) => update('model', { ...settings.model, model: value })}
              hint="例如 deepseek-flash"
            />
          </div>

          {baseUrlChanged && (
            <div className="mt-3 rounded-lg border border-accent/40 bg-accent-soft/30 p-3 animate-fade-in">
              <p className="text-[11.5px] leading-[1.7] text-ink">
                地址一改，下一次聊天就会把 Key 发到新地址。为防止会话被人偷走后把 Key 导走，这里需要再输一次后台密码。
              </p>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value)
                  setNotice('')
                }}
                placeholder="后台密码"
                aria-label="后台密码确认"
                autoComplete="current-password"
                className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-accent/50"
              />
              {insecureTarget && (
                <p className="mt-1.5 text-[11px] text-[#B4322F] dark:text-[#F08C7A]">
                  新地址是 http 公网地址，Key 会以明文传输，建议换成 https。
                </p>
              )}
            </div>
          )}

          <div className="mt-4 space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-medium text-ink">API Key</span>
              <span className="text-[11.5px] text-dim">
                {settings.llmKeyConfigured
                  ? `已配置 ${settings.llmKeyHint ?? ''}`
                  : '尚未配置'}
              </span>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 transition-colors focus-within:border-accent/50">
                <input
                  type={keyVisible ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value)
                    if (event.target.value) setClearKey(false)
                    setNotice('')
                  }}
                  placeholder={
                    settings.llmKeyConfigured
                      ? '留空则不修改已保存的 key'
                      : 'sk-…（留空则暂不调用模型）'
                  }
                  aria-label="API Key"
                  autoComplete="off"
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-dim/80"
                />
                <button
                  type="button"
                  onClick={() => setKeyVisible((current) => !current)}
                  aria-label={keyVisible ? '隐藏 key' : '显示 key'}
                  className="shrink-0 text-dim transition-colors hover:text-ink"
                >
                  {keyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>

              {settings.llmKeyConfigured && (
                <button
                  type="button"
                  onClick={() => {
                    setClearKey(true)
                    setApiKey('')
                    setNotice('保存后会清除已配置的 key')
                  }}
                  className="shrink-0 rounded-lg border border-line px-3 py-2 text-[12.5px] text-dim transition-colors hover:bg-[#B4322F]/10 hover:text-[#B4322F]"
                >
                  清除 key
                </button>
              )}
            </div>

            {clearKey && (
              <p className="text-[11.5px] text-[#B4322F] dark:text-[#F08C7A]">
                已标记清除，点击下方「保存设置」后生效。
              </p>
            )}
          </div>
        </section>

        {/* 备份区只有下载链接，不参与表单提交，放在这里只是为了跟其他设置连在一起 */}
        <section className="rounded-xl border border-line bg-surface p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[13px] font-medium text-ink">数据库备份</h2>
            <span className="text-[11.5px] text-dim">
              {backups.length > 0 ? `最近 ${backups.length} 份` : '暂无备份'}
            </span>
          </div>
          <p className="mt-0.5 text-[11.5px] leading-[1.7] text-dim">
            每次保存内容或设置前，系统会把上一版数据存到 data/backups/，最多保留 20 份。
          </p>

          {backups.length > 0 && (
            <ul className="mt-3 max-h-[220px] space-y-1 overflow-y-auto text-[12px]">
              {backups.map((backup) => (
                <li
                  key={backup.name}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0 truncate text-dim">
                    {new Date(backup.createdAt).toLocaleString('zh-CN')}
                    <span className="ml-2 text-[11px]">
                      {(backup.size / 1024).toFixed(1)} KB
                    </span>
                  </span>
                  <a
                    href={backupDownloadUrl(backup.name)}
                    className="inline-flex shrink-0 items-center gap-1 text-[11.5px] text-accent hover:underline"
                  >
                    <Download size={12} />
                    下载
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 文件体检：内容彻底删除时本该连附件一起清掉，漏清的会列在这里 */}
        <section className="rounded-xl border border-line bg-surface p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[13px] font-medium text-ink">文件体检</h2>
            <span className="text-[11.5px] text-dim">
              {orphans.length > 0 ? `${orphans.length} 个孤儿文件` : '没有孤儿文件'}
            </span>
          </div>
          <p className="mt-0.5 text-[11.5px] leading-[1.7] text-dim">
            孤儿文件指的是上传目录里没人再引用的文件（内容已彻底删除，附件还留着）。
            删掉不影响任何内容，纯粹是回收空间。
          </p>

          {orphans.length > 0 && (
            <>
              <ul className="mt-3 max-h-[160px] space-y-1 overflow-y-auto text-[12px]">
                {orphans.map((orphan) => (
                  <li
                    key={orphan.storedPath}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5"
                  >
                    <span className="min-w-0 truncate text-dim">{orphan.storedPath}</span>
                    <span className="shrink-0 text-[11px] text-dim">
                      {(orphan.size / 1024).toFixed(1)} KB
                    </span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={handleCleanOrphans}
                disabled={cleaning}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-dim transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-60"
              >
                <Trash2 size={13} />
                {cleaning ? '正在清理…' : `清理这 ${orphans.length} 个文件`}
              </button>
            </>
          )}
        </section>

        {error && <InlineNotice tone="error">{error}</InlineNotice>}
        {notice && <InlineNotice tone="success">{notice}</InlineNotice>}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accent-contrast transition-all hover:brightness-105 disabled:opacity-60"
        >
          <Save size={15} strokeWidth={1.9} />
          {saving ? '正在保存…' : '保存设置'}
        </button>
      </form>
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
}) {
  return (
    <label className="block space-y-2">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-ink">{label}</span>
        {hint && <span className="text-[11.5px] text-dim">{hint}</span>}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors focus:border-accent/50"
      />
    </label>
  )
}

function TextAreaField({
  label,
  value,
  onChange,
  hint,
  rows = 3,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  rows?: number
}) {
  return (
    <label className="block space-y-2">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-ink">{label}</span>
        {hint && <span className="text-[11.5px] text-dim">{hint}</span>}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-[13px] leading-[1.8] text-ink outline-none transition-colors focus:border-accent/50"
      />
    </label>
  )
}
