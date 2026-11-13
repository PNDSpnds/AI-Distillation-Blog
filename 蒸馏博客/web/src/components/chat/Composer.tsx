import { ArrowUp, Square } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

interface ComposerProps {
  variant: 'hero' | 'docked'
  onSend: (text: string) => void
  isStreaming: boolean
  onStop: () => void
  autoFocus?: boolean
}

const MAX_TEXTAREA_HEIGHT = 200

/** 输入框：自动长高、回车发送、输入法选词时不误发 */
export function Composer({
  variant,
  onSend,
  isStreaming,
  onStop,
  autoFocus = false,
}: ComposerProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composingRef = useRef(false)

  // 输入框随内容长高，但设置上限，避免把页面撑满
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`
  }, [value])

  // 只在桌面端自动聚焦，移动端避免一打开就弹键盘
  useEffect(() => {
    if (!autoFocus) return
    if (window.matchMedia('(min-width: 768px)').matches) {
      textareaRef.current?.focus()
    }
  }, [autoFocus])

  const submit = () => {
    const text = value.trim()
    if (!text || isStreaming) return
    onSend(text)
    setValue('')
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // 中文输入法正在选词时，回车只用于确认候选词
    if (event.key === 'Enter' && !event.shiftKey && !composingRef.current) {
      event.preventDefault()
      submit()
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    submit()
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div
        className={cn(
          'flex items-end gap-2 border border-line bg-surface px-2.5 py-2.5 transition-all duration-200 focus-within:border-accent/45 focus-within:shadow-[0_6px_30px_-12px_rgba(0,0,0,0.25)]',
          variant === 'hero' ? 'rounded-[26px]' : 'rounded-[22px]',
        )}
      >
        {/* 移动端字号用 16px：iOS Safari 对小于 16px 的输入框会自动放大整页 */}
        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            composingRef.current = true
          }}
          onCompositionEnd={() => {
            composingRef.current = false
          }}
          disabled={isStreaming}
          placeholder="问我最近在做什么，或者随便聊聊"
          aria-label="输入你的问题"
          className="max-h-[200px] min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[16px] leading-[1.7] text-ink outline-none placeholder:text-dim/80 disabled:opacity-60 md:text-[15px]"
        />

        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="停止生成"
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink transition-colors hover:bg-line"
          >
            <Square size={13} strokeWidth={2.2} fill="currentColor" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!value.trim()}
            aria-label="发送"
            className={cn(
              'mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200',
              value.trim()
                ? 'bg-accent text-accent-contrast hover:brightness-105'
                : 'bg-surface-2 text-dim',
            )}
          >
            <ArrowUp size={18} strokeWidth={2} />
          </button>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between px-2 text-[11px] text-dim">
        <span>{isStreaming ? '正在生成，可以随时停下' : 'Enter 发送 · Shift + Enter 换行'}</span>
        <span className="hidden sm:inline">回答由 AI 生成</span>
      </div>
    </form>
  )
}
