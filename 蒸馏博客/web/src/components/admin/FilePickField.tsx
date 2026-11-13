import { ImagePlus, Upload, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { cn } from '@/lib/utils'

interface FilePickFieldProps {
  label: string
  hint?: string
  accept?: string
  /** 空状态里展示的可读格式说明；不传才退化成按 accept 反推 */
  formats?: string
  /** 图片类字段会显示预览图，而不是纯文件名 */
  image?: boolean
  /** 新选中的文件 */
  file: File | null
  /** 已有的文件地址（编辑态） */
  existingUrl?: string
  existingName?: string
  existingSizeText?: string
  /** 用户点了移除已有文件 */
  existingRemoved?: boolean
  onPick: (file: File | null) => void
  onRemoveExisting: () => void
  /** 把当前预览地址回传给父组件，用于实时卡片预览 */
  onPreviewChange?: (url: string) => void
  className?: string
}

/** 读取易读的文件大小 */
function formatSize(bytes: number) {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

/** accept 覆盖的格式太多，反推出来的前几个扩展名会误导人；只有没传 formats 时才用它兜底 */
function acceptHint(accept: string | undefined, image: boolean) {
  if (!accept) return image ? 'PNG / JPG / WebP' : '常见文件格式'
  const parts = accept
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.startsWith('.'))
    .map((item) => item.slice(1).toUpperCase())
  if (parts.length === 0) return image ? 'PNG / JPG / WebP' : '常见文件格式'
  if (parts.length <= 4) return parts.join(' / ')
  return `${parts.slice(0, 3).join(' / ')} 等`
}

/** 文件选择字段：支持点击与拖拽，图片显示预览，附件显示文件名 */
export function FilePickField({
  label,
  hint,
  accept,
  formats,
  image = false,
  file,
  existingUrl,
  existingName,
  existingSizeText,
  existingRemoved = false,
  onPick,
  onRemoveExisting,
  onPreviewChange,
  className,
}: FilePickFieldProps) {
  const [previewDataUrl, setPreviewDataUrl] = useState('')
  const [dragging, setDragging] = useState(false)

  // 用 FileReader 读成 data URL 预览，避免手动管理 object URL 的生命周期
  useEffect(() => {
    if (!file || !image) return

    let cancelled = false
    const reader = new FileReader()
    reader.onload = () => {
      if (!cancelled) setPreviewDataUrl(String(reader.result ?? ''))
    }
    reader.readAsDataURL(file)

    return () => {
      cancelled = true
    }
  }, [file, image])

  const hasExisting = Boolean(existingUrl || existingName) && !existingRemoved
  const preview = file && image ? previewDataUrl : hasExisting ? existingUrl ?? '' : ''
  const displayName = file ? file.name : hasExisting ? existingName ?? '' : ''
  const displaySize = file ? formatSize(file.size) : hasExisting ? existingSizeText ?? '' : ''
  const inputId = useId()

  // 预览变化时通知父组件，用于渲染实时卡片
  useEffect(() => {
    onPreviewChange?.(preview)
  }, [preview, onPreviewChange])

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onPick(event.target.files?.[0] ?? null)
    // 允许重复选择同一个文件
    event.target.value = ''
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    const dropped = event.dataTransfer.files?.[0]
    if (dropped) onPick(dropped)
  }

  const dragProps = {
    onDragOver: (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setDragging(true)
    },
    onDragLeave: () => setDragging(false),
    onDrop: handleDrop,
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="text-[13px] font-medium text-ink">
          {label}
        </label>
        {hint && <span className="text-[11.5px] text-dim">{hint}</span>}
      </div>

      {image && preview ? (
        <div
          {...dragProps}
          className={cn(
            'relative overflow-hidden rounded-lg border transition-colors',
            dragging ? 'border-accent' : 'border-line',
          )}
        >
          <img src={preview} alt="封面预览" className="aspect-[16/9] w-full object-cover" />
          <div className="absolute right-2 top-2 flex gap-1.5">
            <label
              htmlFor={inputId}
              className="cursor-pointer rounded-md bg-black/50 px-2.5 py-1 text-[11.5px] text-white backdrop-blur transition-colors hover:bg-black/65"
            >
              更换
            </label>
            <button
              type="button"
              onClick={() => {
                onPick(null)
                onRemoveExisting()
              }}
              aria-label="移除封面"
              className="flex h-[26px] w-[26px] items-center justify-center rounded-md bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/65"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      ) : (
        <div
          {...dragProps}
          className={cn(
            'rounded-lg border border-dashed px-4 py-4 transition-colors',
            dragging
              ? 'border-accent bg-accent-soft/40'
              : 'border-line bg-surface-2/40 hover:border-accent/40',
          )}
        >
          {displayName ? (
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <Upload size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-ink">{displayName}</p>
                <p className="text-[11.5px] text-dim">{displaySize || '已上传'}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onPick(null)
                  onRemoveExisting()
                }}
                aria-label={`移除${label}`}
                className="flex h-7 w-7 items-center justify-center rounded-md text-dim transition-colors hover:bg-line hover:text-ink"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <label htmlFor={inputId} className="flex cursor-pointer items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-dim">
                {image ? <ImagePlus size={16} /> : <Upload size={15} />}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] text-ink">
                  {dragging ? '松开即可上传' : '点击选择，或把文件拖到这里'}
                </span>
                <span className="block text-[11.5px] text-dim">
                  {formats ?? acceptHint(accept, image)}
                </span>
              </span>
            </label>
          )}
        </div>
      )}

      <input
        id={inputId}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="sr-only"
      />
    </div>
  )
}
