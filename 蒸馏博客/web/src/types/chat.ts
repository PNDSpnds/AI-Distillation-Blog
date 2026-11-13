/** 内容类型：与后台上传表单的类型保持一致 */
export const CONTENT_KINDS = ['article', 'program', 'video', 'music', 'image', 'other'] as const

export type ContentKind = (typeof CONTENT_KINDS)[number]

/** 内容类型的中文名，供卡片和预览弹窗使用 */
export const CONTENT_KIND_LABELS: Record<ContentKind, string> = {
  article: '文章',
  program: '程序',
  video: '视频',
  music: '音乐',
  image: '图片',
  other: '其他',
}

/** 一张内容卡片需要的字段；由 /api/chat 的 meta 事件返回真实数据 */
export interface ContentCardData {
  id: string
  kind: ContentKind
  title: string
  summary: string
  coverUrl?: string
  /** M0 演示用的渐变封面，接入真实封面后可以不再传 */
  coverTone?: string
  jumpUrl?: string
  downloadUrl?: string
  /** 正文，卡片详情里展示 */
  body?: string
  /** 提示词里的编号，如 c1，用于把 [[c1]] 渲染成上标 */
  code?: string
}

export interface UserChatMessage {
  id: string
  role: 'user'
  content: string
  createdAt: number
}

export type AssistantStatus = 'thinking' | 'streaming' | 'done' | 'error'

/** 一条回答依据：回答里用到的词条 / 内容 / 资料片段（只给标题，不给内容，避免暴露隐私） */
export interface ChatSource {
  /** 提示词里的编号，如 c1 */
  code: string
  /** fact：事实词条；content：已发布内容；knowledge：资料原文片段 */
  kind: 'fact' | 'content' | 'knowledge'
  title: string
  /** 类型标签，例如「荣誉」「文章」「资料」 */
  label: string
  /** 只有 content 类型才有内容 id，用来打开详情 */
  contentId?: string
}

export interface AssistantChatMessage {
  id: string
  role: 'assistant'
  content: string
  status: AssistantStatus
  cards: ContentCardData[]
  followups: string[]
  /** 这条回答依据了什么，用于回答下方的「依据」折叠区 */
  sources: ChatSource[]
  /** 这次回答用到了模型自己的常识，页面上会加一行小字说明 */
  usedGeneralKnowledge?: boolean
  /** 出错时给访客看的具体原因 */
  error?: string
  createdAt: number
}

export type ChatMessage = UserChatMessage | AssistantChatMessage

/** 推荐问题：text 用于发送，hint 用于展示 */
export interface SuggestedQuestion {
  text: string
  hint: string
}

/** 站点与作者信息；M1 后会从后台设置读取 */
export interface ProfileInfo {
  siteName: string
  ownerName: string
  greeting: string
  intro: string
  suggestions: SuggestedQuestion[]
  footer: string
}
