import type {
  AdminContent,
  AdminContentListResponse,
  BackupItem,
  OrphanFile,
  SessionState,
  SiteSettings,
} from '@/types/content'
import type { ProfileInfo } from '@/types/chat'
import type {
  DistillProgress,
  DistillQuestion,
  DistillSource,
  DistillStats,
  FactCategory,
  FactEntry,
  GenerateQuestionsResult,
  Persona,
  PersonaState,
} from '@/types/distill'

/** 统一的接口错误：带上状态码，页面可以据此区分“没登录”和“业务失败” */
export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// 开发时由 Vite 代理到后端；生产时前端由后端托管，同源请求
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

/**
 * 后台会话失效（401）时直接送回登录页，并带上当前地址，登录后能回到原处。
 * 典型场景：在另一个窗口改了 .env 里的密码，这边所有旧 Cookie 立刻作废。
 */
function redirectToLogin() {
  if (typeof window === 'undefined') return
  const current = `${window.location.pathname}${window.location.search}`
  if (current.startsWith('/admin/login')) return
  const next = current.startsWith('/admin') ? `?next=${encodeURIComponent(current)}` : ''
  window.location.assign(`/admin/login${next}`)
}

/** 只有后台业务接口失效才跳登录；登录接口本身 401 说明密码错了，交给页面提示 */
function shouldRedirectToLogin(path: string, status: number) {
  return status === 401 && path.startsWith('/api/admin') && !path.startsWith('/api/admin/login')
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    ...init,
  })

  const contentType = response.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json') ? await response.json() : null

  if (!response.ok) {
    if (shouldRedirectToLogin(path, response.status)) redirectToLogin()
    throw new ApiError(payload?.message ?? `请求失败（${response.status}）`, response.status)
  }

  return payload as T
}

/**
 * 带上传进度的 multipart 请求。
 * fetch 拿不到上传进度，这里用 XHR：只有带文件提交时才需要进度条。
 */
function uploadWithProgress<T>(
  path: string,
  method: 'POST' | 'PUT',
  formData: FormData,
  onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, `${BASE_URL}${path}`)
    xhr.withCredentials = true

    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) return
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
    }

    xhr.onload = () => {
      const contentType = xhr.getResponseHeader('content-type') ?? ''
      let payload: { message?: string } | null = null
      try {
        payload = contentType.includes('application/json') ? JSON.parse(xhr.responseText) : null
      } catch {
        payload = null
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload as T)
        return
      }
      if (shouldRedirectToLogin(path, xhr.status)) redirectToLogin()
      reject(new ApiError(payload?.message ?? `请求失败（${xhr.status}）`, xhr.status))
    }

    xhr.onerror = () => reject(new ApiError('网络中断，请检查服务是否在运行', 0))
    xhr.ontimeout = () => reject(new ApiError('上传超时，请稍后再试', 0))
    xhr.send(formData)
  })
}

/* ---------- 公开接口 ---------- */

export function fetchProfile() {
  return request<ProfileInfo>('/api/profile')
}

export function fetchPublicContent(id: string) {
  return request<{ item: AdminContent }>(`/api/contents/${id}`)
}

/** 内容库：所有已上架内容（后端最多返回 100 条） */
export function fetchPublicContents() {
  return request<{ items: AdminContent[] }>('/api/contents?limit=100')
}

/** 当前对话用的是哪个模型、有没有配 key */
export function fetchChatStatus() {
  return request<{ configured: boolean; model: string }>('/api/chat/status')
}

/* ---------- 登录 ---------- */

export function fetchSession() {
  return request<SessionState>('/api/admin/session')
}

export function login(password: string) {
  return request<{ ok: true; passwordNeedsChange: boolean; passwordWarning: string }>(
    '/api/admin/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    },
  )
}

/**
 * 在登录页直接改密码：当前密码 + 新密码。
 * 成功后后端会下发新的会话 Cookie，不用再登一次。
 */
export function changePassword(currentPassword: string, newPassword: string) {
  return request<{ ok: true; passwordNeedsChange: boolean; passwordWarning: string }>(
    '/api/admin/password',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    },
  )
}

export function logout() {
  return request<{ ok: true }>('/api/admin/logout', { method: 'POST' })
}

/* ---------- 内容管理 ---------- */

export type ContentSort = 'latest' | 'oldest' | 'title'

export interface ContentQuery {
  q?: string
  kind?: string
  category?: string
  published?: 'all' | 'true' | 'false'
  sort?: ContentSort
  /** 只看回收站 */
  trash?: boolean
}

export function fetchContents(query: ContentQuery = {}) {
  const search = new URLSearchParams()
  if (query.q) search.set('q', query.q)
  if (query.kind) search.set('kind', query.kind)
  if (query.category) search.set('category', query.category)
  if (query.published && query.published !== 'all') search.set('published', query.published)
  if (query.sort) search.set('sort', query.sort)
  if (query.trash) search.set('trash', 'true')

  const suffix = search.toString()
  return request<AdminContentListResponse>(`/api/admin/contents${suffix ? `?${suffix}` : ''}`)
}

export function fetchContent(id: string) {
  return request<{ item: AdminContent }>(`/api/admin/contents/${id}`)
}

export function createContent(formData: FormData, onProgress?: (percent: number) => void) {
  return uploadWithProgress<{ item: AdminContent }>('/api/admin/contents', 'POST', formData, onProgress)
}

export function updateContent(
  id: string,
  formData: FormData,
  onProgress?: (percent: number) => void,
) {
  return uploadWithProgress<{ item: AdminContent }>(
    `/api/admin/contents/${id}`,
    'PUT',
    formData,
    onProgress,
  )
}

export function updateContentState(id: string, patch: { published?: boolean; pinned?: boolean }) {
  return request<{ item: AdminContent }>(`/api/admin/contents/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

/** 删除 = 移入回收站 */
export function deleteContent(id: string) {
  return request<{ ok: true }>(`/api/admin/contents/${id}`, { method: 'DELETE' })
}

export function restoreContent(id: string) {
  return request<{ item: AdminContent }>(`/api/admin/contents/${id}/restore`, { method: 'POST' })
}

/** 彻底删除，不可恢复 */
export function purgeContent(id: string) {
  return request<{ ok: true }>(`/api/admin/contents/${id}/purge`, { method: 'DELETE' })
}

/* ---------- 设置 ---------- */

export function fetchSettings() {
  return request<SiteSettings>('/api/admin/settings')
}

export function saveSettings(
  settings: Partial<SiteSettings> & {
    llmApiKey?: string
    clearLlmKey?: boolean
    /** 改模型服务地址时必须带上后台密码 */
    confirmPassword?: string
  },
) {
  return request<SiteSettings>('/api/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
}

/* ---------- 备份 ---------- */

export function fetchBackups() {
  return request<{ items: BackupItem[] }>('/api/admin/backups')
}

/** 备份下载走浏览器直接跳转，用普通链接即可 */
export function backupDownloadUrl(name: string) {
  return `${BASE_URL}/api/admin/backups/${encodeURIComponent(name)}`
}

/* ---------- 文件体检 ---------- */

export function fetchOrphanFiles() {
  return request<{ items: OrphanFile[] }>('/api/admin/maintenance/orphans')
}

export function cleanOrphanFiles() {
  return request<{ removed: number; items: OrphanFile[] }>(
    '/api/admin/maintenance/orphans/clean',
    { method: 'POST' },
  )
}

/* ---------- 蒸馏：资料 ---------- */

export function fetchDistillSources() {
  return request<{ items: DistillSource[] }>('/api/admin/distill/sources')
}

/** 上传资料：字段名必须是 material，后端按这个名字取文件 */
export function uploadDistillSource(file: File, onProgress?: (percent: number) => void) {
  const formData = new FormData()
  formData.append('material', file)
  return uploadWithProgress<{ item: DistillSource }>(
    '/api/admin/distill/sources',
    'POST',
    formData,
    onProgress,
  )
}

export function reparseDistillSource(id: string) {
  return request<{ item: DistillSource }>(`/api/admin/distill/sources/${id}/reparse`, {
    method: 'POST',
  })
}

export function deleteDistillSource(id: string) {
  return request<{ ok: true }>(`/api/admin/distill/sources/${id}`, { method: 'DELETE' })
}

/** 只重新整理词条：原文不变，让模型再读一遍已抽取的文本 */
export function reextractSourceFacts(id: string) {
  return request<{ item: DistillSource; facts: FactEntry[] }>(`/api/admin/distill/sources/${id}/facts`, {
    method: 'POST',
  })
}

/* ---------- 蒸馏：事实词条 ---------- */

export interface FactQuery {
  sourceId?: string
  categoryId?: string
  /** 关键词：同时搜标题、内容、来源名 */
  q?: string
  sort?: 'category' | 'recent'
}

export function fetchFacts(query: FactQuery = {}) {
  const search = new URLSearchParams()
  if (query.sourceId) search.set('sourceId', query.sourceId)
  if (query.categoryId) search.set('categoryId', query.categoryId)
  if (query.q) search.set('q', query.q)
  if (query.sort) search.set('sort', query.sort)
  const suffix = search.toString()
  return request<{ items: FactEntry[]; categories: FactCategory[] }>(
    `/api/admin/distill/facts${suffix ? `?${suffix}` : ''}`,
  )
}

export function createFact(input: {
  categoryLabel: string
  title: string
  content: string
  time?: string
  sourceId?: string
  sourceName?: string
}) {
  return request<{ item: FactEntry }>('/api/admin/distill/facts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function updateFact(
  id: string,
  patch: {
    categoryId?: string
    categoryLabel?: string
    title?: string
    content?: string
    time?: string
  },
) {
  return request<{ item: FactEntry }>(`/api/admin/distill/facts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
}

export function deleteFact(id: string) {
  return request<{ ok: true }>(`/api/admin/distill/facts/${id}`, { method: 'DELETE' })
}

/** 批量删除 / 批量改分类 */
export function batchFacts(input: {
  ids: string[]
  action: 'delete' | 'move'
  categoryId?: string
  categoryLabel?: string
}) {
  return request<{ affected: number; action: string }>('/api/admin/distill/facts/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

/** 让模型重新判一遍现有词条的分类 */
export function recategorizeFacts() {
  return request<{ updated: number }>('/api/admin/distill/facts/recategorize', { method: 'POST' })
}

/* ---------- 蒸馏：分类管理 ---------- */

export function fetchFactCategories() {
  return request<{ items: FactCategory[] }>('/api/admin/distill/categories')
}

export function createFactCategory(label: string) {
  return request<{ item: FactCategory }>('/api/admin/distill/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label }),
  })
}

export function renameFactCategory(id: string, label: string) {
  return request<{ item: FactCategory }>(`/api/admin/distill/categories/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label }),
  })
}

export function mergeFactCategories(fromId: string, toId: string) {
  return request<{ moved: number; from: string; to: string }>(
    '/api/admin/distill/categories/merge',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromId, toId }),
    },
  )
}

export function deleteFactCategory(id: string) {
  return request<{ ok: true }>(`/api/admin/distill/categories/${id}`, { method: 'DELETE' })
}

/** 让模型把近义分类合并掉 */
export function tidyFactCategories() {
  return request<{ merged: number; detail: { from: string; to: string }[] }>(
    '/api/admin/distill/categories/tidy',
    { method: 'POST' },
  )
}

/* ---------- 蒸馏：问题 ---------- */

export function fetchDistillQuestions(status?: 'unanswered' | 'answered' | 'skipped', dimension?: string) {
  const search = new URLSearchParams()
  if (status) search.set('status', status)
  if (dimension) search.set('dimension', dimension)
  const suffix = search.toString()
  return request<{ items: DistillQuestion[]; progress: DistillProgress }>(
    `/api/admin/distill/questions${suffix ? `?${suffix}` : ''}`,
  )
}

/** 批量跳过 / 撤销 / 删除 */
export function batchDistillQuestions(ids: string[], action: 'skip' | 'reset' | 'delete') {
  return request<{ affected: number; action: string; progress: DistillProgress }>(
    '/api/admin/distill/questions/batch',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, action }),
    },
  )
}

/** 给旧题目补维度（模型判定 + 关键词兜底） */
export function backfillQuestionDimensions() {
  return request<{ updated: number; usedModel: boolean; progress: DistillProgress }>(
    '/api/admin/distill/questions/dimensions',
    { method: 'POST' },
  )
}

/** 把一条已答题整理成词条 */
export function extractQuestionFacts(id: string) {
  return request<{ item: DistillQuestion; facts: FactEntry[]; progress: DistillProgress }>(
    `/api/admin/distill/questions/${id}/facts`,
    { method: 'POST' },
  )
}

/** 让 AI 再出一批题；count 不传就用设置里的每批题数 */
export function generateDistillQuestions(count?: number) {
  return request<GenerateQuestionsResult>('/api/admin/distill/questions/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(count ? { count } : {}),
  })
}

/** 提交答案（会同时生成一条高权重知识） */
export function answerDistillQuestion(id: string, answer: string) {
  return request<{ item: DistillQuestion; progress: DistillProgress }>(
    `/api/admin/distill/questions/${id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer }),
    },
  )
}

export function skipDistillQuestion(id: string) {
  return request<{ item: DistillQuestion; progress: DistillProgress }>(
    `/api/admin/distill/questions/${id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skip: true }),
    },
  )
}

export function resetDistillQuestion(id: string) {
  return request<{ item: DistillQuestion; progress: DistillProgress }>(
    `/api/admin/distill/questions/${id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true }),
    },
  )
}

export function saveDistillQuestionSettings(patch: { targetCount?: number; batchSize?: number }) {
  return request<{ settings: { targetCount: number; batchSize: number }; progress: DistillProgress }>(
    '/api/admin/distill/questions/settings',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  )
}

/* ---------- 蒸馏：人设 ---------- */

export function fetchPersona() {
  return request<PersonaState>('/api/admin/distill/persona')
}

export function savePersona(persona: Persona) {
  return request<PersonaState>('/api/admin/distill/persona', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(persona),
  })
}

/** 让 AI 读资料生成人设草稿（只存草稿，确认后才生效） */
export function generatePersonaDraft() {
  return request<PersonaState>('/api/admin/distill/persona/draft', { method: 'POST' })
}

export function applyPersonaDraft() {
  return request<PersonaState>('/api/admin/distill/persona/draft/apply', { method: 'POST' })
}

export function discardPersonaDraft() {
  return request<PersonaState>('/api/admin/distill/persona/draft', { method: 'DELETE' })
}

/* ---------- 蒸馏：总览 ---------- */

export function fetchDistillStats() {
  return request<DistillStats>('/api/admin/distill/stats')
}
