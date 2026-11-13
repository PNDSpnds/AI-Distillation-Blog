import type { UserChatMessage } from '@/types/chat'

/** 用户消息：右对齐的浅色气泡，视觉权重低于回答 */
export function UserMessage({ message }: { message: UserChatMessage }) {
  return (
    <div className="flex justify-end animate-fade-up">
      <div className="max-w-[82%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-user-bubble px-4 py-2.5 text-[14px] leading-[1.75] text-ink">
        {message.content}
      </div>
    </div>
  )
}
