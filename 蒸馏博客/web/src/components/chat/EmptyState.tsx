import { ArrowUpRight, Sparkles } from 'lucide-react'
import { Composer } from '@/components/chat/Composer'
import { useProfile } from '@/lib/profile-context'

interface EmptyStateProps {
  onSend: (text: string) => void
  isStreaming: boolean
  onStop: () => void
}

/** 首屏空状态：问候 + 输入框 + 推荐问题，布局参考 ChatGPT 首页 */
export function EmptyState({ onSend, isStreaming, onStop }: EmptyStateProps) {
  const profile = useProfile()

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="relative mx-auto flex w-full max-w-[820px] flex-1 flex-col justify-center px-5 pb-12 pt-16 md:px-8 md:pb-16">
        {/* 很淡的暖色光晕，让大面积背景不显得空 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[32%] h-[320px] w-[520px] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-soft blur-3xl"
        />

        <div className="relative">
          <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-dim">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            对话主页
          </div>

          <h1 className="max-w-[620px] text-balance font-serif text-[28px] font-medium leading-[1.35] tracking-[-0.01em] text-ink md:text-[44px]">
            {profile.greeting}
          </h1>
          <p className="mt-4 max-w-[540px] text-[14px] leading-[1.9] text-dim md:text-[15px]">
            {profile.intro}
          </p>

          <div className="mt-9 max-w-[760px]">
            <Composer
              variant="hero"
              onSend={onSend}
              isStreaming={isStreaming}
              onStop={onStop}
              autoFocus
            />
          </div>

          <div className="mt-7 max-w-[760px]">
            <div className="mb-2 px-1 text-[11px] uppercase tracking-[0.18em] text-dim">
              可以这样问
            </div>
            <div className="grid gap-1">
              {profile.suggestions.map((suggestion) => (
                <button
                  key={suggestion.text}
                  type="button"
                  onClick={() => onSend(suggestion.text)}
                  className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition-all duration-200 hover:border-line hover:bg-surface-2"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <Sparkles size={15} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-ink">{suggestion.text}</span>
                    <span className="mt-0.5 block text-[12px] text-dim">{suggestion.hint}</span>
                  </span>
                  <ArrowUpRight
                    size={16}
                    strokeWidth={1.7}
                    className="shrink-0 text-dim opacity-0 transition-opacity group-hover:opacity-100"
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <footer className="shrink-0 px-5 pb-5 text-center text-[11px] text-dim">
        {profile.footer}
      </footer>
    </div>
  )
}
