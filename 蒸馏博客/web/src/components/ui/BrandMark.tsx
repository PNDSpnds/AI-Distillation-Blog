import { cn } from '@/lib/utils'

const SIZE_CLASSES = {
  sm: 'h-7 w-7 rounded-lg text-[15px]',
  md: 'h-9 w-9 rounded-[11px] text-[19px]',
  lg: 'h-12 w-12 rounded-2xl text-[26px]',
} as const

interface BrandMarkProps {
  size?: keyof typeof SIZE_CLASSES
  className?: string
}

/** 站点标记：先用一个衬线「言」字，后台接入后可以换成上传的 Logo */
export function BrandMark({ size = 'md', className }: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex select-none items-center justify-center bg-accent font-serif font-semibold leading-none text-accent-contrast',
        SIZE_CLASSES[size],
        className,
      )}
    >
      言
    </span>
  )
}
