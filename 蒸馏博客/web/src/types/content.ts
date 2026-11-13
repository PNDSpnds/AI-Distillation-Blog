import type { ContentKind } from './chat'

/** 后端返回的内容结构；字段与 server/services/content-service.js 的 toPublicContent 对应 */
export interface AdminContent {
  id: string
  kind: ContentKind
  kindLabel: string
  title: string
  summary: string
  category: string
  tags: string[]
  body: string
  coverUrl: string
  jumpUrl: string
  downloadUrl: string
  fileName: string
  fileSize: number
  fileSizeText: string
  published: boolean
  pinned: boolean
  publishedAt: string
  createdAt: string
  updatedAt: string
  /** 非空表示在回收站里 */
  deletedAt: string
}

/** 后台列表项在公开结构上多一个封面标记，用于列表占位 */
export type AdminContentListItem = AdminContent

export interface AdminContentListResponse {
  items: AdminContentListItem[]
  categories: { name: string; count: number }[]
}

/** 后端生成的数据库备份 */
export interface BackupItem {
  name: string
  size: number
  createdAt: string
}

/** 上传目录里没人引用的文件（内容删了但附件还在） */
export interface OrphanFile {
  storedPath: string
  size: number
  modifiedAt: string
}

/** 站点设置：字段与 server/services/settings-service.js 保持一致 */
export interface SiteSettings {
  siteName: string
  ownerName: string
  greeting: string
  intro: string
  suggestions: { text: string; hint: string }[]
  footer: string
  categories: string[]
  model: { baseUrl: string; model: string }
  llmKeyConfigured?: boolean
  /** 已配置时返回的掩码，例如 ••••a1b2 */
  llmKeyHint?: string
  /** 后台密码不够安全：此时禁止修改模型配置 */
  passwordNeedsChange?: boolean
  /** 为什么算不安全（给用户看的原话） */
  passwordWarning?: string
}

export interface SessionState {
  authenticated: boolean
  passwordNeedsChange: boolean
  passwordWarning: string
  /** 登录页展示"至少 N 位"，与后端判定保持一致 */
  minPasswordLength: number
}
