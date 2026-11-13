import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** 通用确认弹窗：删除这类不可逆操作统一走它，避免浏览器原生 confirm 打断视觉 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    confirmRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)

    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = original
    }
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div
      role="presentation"
      onClick={() => {
        if (!busy) onCancel()
      }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-5 backdrop-blur-sm animate-fade-in"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-line bg-surface p-5 shadow-2xl animate-scale-in"
      >
        <h2 id="confirm-title" className="text-[15px] font-medium text-ink">
          {title}
        </h2>
        {description && (
          <p className="mt-2 text-[13px] leading-[1.75] text-dim">{description}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-line px-3.5 py-2 text-[13px] text-dim transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              'rounded-lg px-3.5 py-2 text-[13px] font-medium transition-all disabled:opacity-60',
              danger
                ? 'bg-[#B4322F] text-white hover:brightness-110'
                : 'bg-accent text-accent-contrast hover:brightness-105',
            )}
          >
            {busy ? '处理中…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
