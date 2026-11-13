import type { ChatMessage } from '@/types/chat'

/**
 * 对话历史存在浏览器本地。
 *
 * 为什么不存服务端：v1 是单人的公开博客，访客互不相干，没有必要为每个匿名访客建会话；
 * 存 localStorage 既不占服务器，刷新后也能接着聊。
 *
 * 三条约束：
 * - 只存最近 MAX_MESSAGES 条，避免撑爆配额（5MB 左右）。
 * - 单条正文截断，防止一条超长回答把整个历史写坏。
 * - 读写全部 try/catch：隐私模式下 localStorage 可能直接抛错，不能因此白屏。
 */
const STORAGE_KEY = 'chatblog.conversation.v1'
const MAX_MESSAGES = 60
const MAX_CONTENT = 4000

interface StoredConversation {
  savedAt: number
  messages: ChatMessage[]
}

function storage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** 读取历史；数据损坏、格式不对一律当作空对话 */
export function loadConversation(): ChatMessage[] {
  const store = storage()
  if (!store) return []

  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw) as StoredConversation
    if (!Array.isArray(parsed?.messages)) return []

    return parsed.messages
      .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
      .slice(-MAX_MESSAGES)
      .map((message) => {
        if (message.role === 'user') {
          return { ...message, content: String(message.content ?? '').slice(0, MAX_CONTENT) }
        }
        // 恢复时把「生成中」的状态收尾，否则刷新后光标一直闪
        return {
          ...message,
          content: String(message.content ?? '').slice(0, MAX_CONTENT),
          status: message.status === 'done' ? 'done' : message.content ? 'done' : 'error',
          cards: Array.isArray(message.cards) ? message.cards : [],
          followups: Array.isArray(message.followups) ? message.followups : [],
          sources: Array.isArray(message.sources) ? message.sources : [],
          usedGeneralKnowledge: message.usedGeneralKnowledge === true,
        }
      })
  } catch {
    return []
  }
}

/** 保存历史；失败就静默跳过（例如配额满了） */
export function saveConversation(messages: ChatMessage[]) {
  const store = storage()
  if (!store) return

  try {
    if (messages.length === 0) {
      store.removeItem(STORAGE_KEY)
      return
    }

    const payload: StoredConversation = {
      savedAt: Date.now(),
      messages: messages.slice(-MAX_MESSAGES).map((message) => ({
        ...message,
        content: message.content.slice(0, MAX_CONTENT),
      })),
    }
    store.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // 配额满或隐私模式：不保存也不报错
  }
}

export function clearConversation() {
  const store = storage()
  if (!store) return
  try {
    store.removeItem(STORAGE_KEY)
  } catch {
    // 忽略
  }
}
