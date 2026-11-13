import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

/** 蒸馏页统一的卡片容器：标题 + 说明 + 右侧操作区 */
export function DistillCard({
  icon,
  title,
  desc,
  action,
  children,
  className,
}: {
  icon?: React.ReactNode
  title: string
  desc?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-xl border border-line bg-surface p-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[13.5px] font-medium text-ink">
            {icon}
            {title}
          </h2>
          {desc && <p className="mt-1 text-[11.5px] leading-[1.75] text-dim">{desc}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      <div className="mt-3.5">{children}</div>
    </section>
  )
}

/** 单行输入 */
export function DistillTextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  maxLength,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: string
  maxLength?: number
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] font-medium text-ink">{label}</span>
        {hint && <span className="text-[11px] text-dim">{hint}</span>}
      </span>
      <input
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors placeholder:text-dim/60 focus:border-accent/50"
      />
    </label>
  )
}

/** 多行输入 */
export function DistillTextArea({
  label,
  value,
  onChange,
  placeholder,
  hint,
  rows = 2,
  maxLength,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: string
  rows?: number
  maxLength?: number
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] font-medium text-ink">{label}</span>
        {hint && <span className="text-[11px] text-dim">{hint}</span>}
      </span>
      <textarea
        value={value}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-[13px] leading-[1.75] text-ink outline-none transition-colors placeholder:text-dim/60 focus:border-accent/50"
      />
    </label>
  )
}

/**
 * 词条输入：按回车或逗号添加，点 × 删除。
 * 常用词、绝不会说的词都是这种形态，避免让人手写逗号分隔的字符串。
 */
export function DistillTagField({
  label,
  values,
  onChange,
  placeholder,
  hint,
  max = 10,
}: {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  hint?: string
  max?: number
}) {
  const [draft, setDraft] = useState('')

  const commit = () => {
    const text = draft.trim()
    if (!text) return
    if (!values.includes(text) && values.length < max) onChange([...values, text])
    setDraft('')
  }

  return (
    <div className="space-y-1.5">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] font-medium text-ink">{label}</span>
        {hint && <span className="text-[11px] text-dim">{hint}</span>}
      </span>

      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5">
        {values.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-[11.5px] text-accent"
          >
            {item}
            <button
              type="button"
              aria-label={`移除 ${item}`}
              onClick={() => onChange(values.filter((value) => value !== item))}
              className="transition-opacity hover:opacity-60"
            >
              <X size={11} />
            </button>
          </span>
        ))}

        {values.length < max && (
          <span className="flex min-w-[120px] flex-1 items-center gap-1">
            <input
              value={draft}
              placeholder={placeholder ?? '输入后回车'}
              onChange={(event) => {
                // 中文输入时逗号常被当成停顿，输入即提交更顺手
                const next = event.target.value
                if (/[,，]/.test(next)) {
                  const text = next.replace(/[,，]/g, '').trim()
                  if (text && !values.includes(text) && values.length < max) {
                    onChange([...values, text])
                  }
                  setDraft('')
                  return
                }
                setDraft(next)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commit()
                }
                if (event.key === 'Backspace' && !draft && values.length > 0) {
                  onChange(values.slice(0, -1))
                }
              }}
              className="min-w-0 flex-1 bg-transparent py-0.5 text-[12.5px] text-ink outline-none placeholder:text-dim/60"
            />
            <button
              type="button"
              aria-label="添加"
              onClick={commit}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-dim transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <Plus size={12} />
            </button>
          </span>
        )}
      </div>
    </div>
  )
}

/** 蒸馏页统一按钮：primary 只给最重要的动作，避免页面上到处都是主色 */
export function DistillButton({
  children,
  onClick,
  variant = 'ghost',
  disabled,
  type = 'button',
  size = 'md',
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  type?: 'button' | 'submit'
  size?: 'sm' | 'md'
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all disabled:opacity-55',
        size === 'sm' ? 'px-2.5 py-1.5 text-[11.5px]' : 'px-3.5 py-2 text-[12.5px]',
        variant === 'primary' && 'bg-accent text-accent-contrast hover:brightness-105',
        variant === 'ghost' && 'border border-line text-dim hover:bg-surface-2 hover:text-ink',
        variant === 'danger' &&
          'border border-[#B4322F]/30 text-[#B4322F] hover:bg-[#B4322F]/10 dark:text-[#F08C7A]',
      )}
    >
      {children}
    </button>
  )
}
