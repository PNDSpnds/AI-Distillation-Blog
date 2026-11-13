import { CONTENT_KINDS, KIND_LABELS, KIND_REQUIRED_FIELDS } from '../lib/content-kinds.js'
import { badRequest, notFound } from '../lib/http-error.js'
import { createId } from '../lib/ids.js'
import {
  findContent,
  insertContent,
  markContentDeleted,
  removeContent,
  restoreContent as restoreContentRecord,
  updateContent,
} from '../repositories/contents.js'
import {
  cleanupUploadedFiles,
  humanFileSize,
  removeStoredFile,
  toCoverUrl,
  toStoredPath,
} from '../storage/local-storage.js'

const TITLE_MAX = 80
const SUMMARY_MAX = 300
const CATEGORY_MAX = 30
const BODY_MAX = 20000

/** 表单字段清洗：统一转成字符串并去首尾空白 */
function readText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** 复选框在 multipart 里是字符串 "true" / "false"，这里统一成布尔值 */
function readBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  return value === 'true' || value === '1' || value === 'on'
}

/** 标签支持“逗号/中文逗号/空格”混合输入，去重后最多保留 8 个 */
function readTags(value) {
  const raw = Array.isArray(value) ? value.join(',') : readText(value)
  if (!raw) return []
  const unique = new Set()
  for (const part of raw.split(/[,，、\s]+/)) {
    const tag = part.trim()
    if (tag) unique.add(tag.slice(0, 20))
  }
  return [...unique].slice(0, 8)
}

function validateLink(value, label) {
  const link = readText(value)
  if (!link) return ''
  // 只接受站内绝对路径或 http(s) 链接，避免 javascript: 之类的伪协议
  if (link.startsWith('/')) return link
  if (/^https?:\/\//i.test(link)) return link
  throw badRequest(`${label}必须以 http://、https:// 或 / 开头`)
}

/** 把表单字段校验成可入库的结构；缺必填时抛出 400 */
function normalizeInput(body) {
  const kind = readText(body.kind) || 'other'
  if (!CONTENT_KINDS.includes(kind)) {
    throw badRequest(`未知的内容类型：${kind}`)
  }

  const title = readText(body.title)
  const summary = readText(body.summary)

  if (!title) throw badRequest('标题不能为空')
  if (title.length > TITLE_MAX) throw badRequest(`标题不能超过 ${TITLE_MAX} 个字`)
  if (!summary) throw badRequest('简介不能为空，卡片和搜索结果都要用它')
  if (summary.length > SUMMARY_MAX) throw badRequest(`简介不能超过 ${SUMMARY_MAX} 个字`)

  const bodyText = readText(body.body ?? '')
  if (bodyText.length > BODY_MAX) {
    throw badRequest(`正文不能超过 ${BODY_MAX} 个字（当前 ${bodyText.length} 字）`)
  }

  const category = readText(body.category).slice(0, CATEGORY_MAX)
  const requiredFields = KIND_REQUIRED_FIELDS[kind] ?? []
  if (requiredFields.includes('category') && !category) {
    throw badRequest(`${KIND_LABELS[kind]}必须选择分类`)
  }

  return {
    kind,
    kindLabel: KIND_LABELS[kind],
    title,
    summary,
    category,
    tags: readTags(body.tags),
    body: bodyText,
    jumpUrl: validateLink(body.jumpUrl, '跳转链接'),
    published: readBoolean(body.published, true),
    pinned: readBoolean(body.pinned, false),
  }
}

/** 从 multer 的 files 里取出某字段的文件 */
function pickFile(files, field) {
  return files?.[field]?.[0] ?? null
}

/** 对外输出：把内部字段转成前端直接可用的形状 */
export function toPublicContent(record) {
  return {
    id: record.id,
    kind: record.kind,
    kindLabel: KIND_LABELS[record.kind] ?? '其他',
    title: record.title,
    summary: record.summary,
    category: record.category ?? '',
    tags: record.tags ?? [],
    body: record.body ?? '',
    coverUrl: toCoverUrl(record.coverPath),
    jumpUrl: record.jumpUrl ?? '',
    downloadUrl: record.filePath ? `/api/download/${record.id}` : '',
    fileName: record.fileName ?? '',
    fileSize: record.fileSize ?? 0,
    fileSizeText: humanFileSize(record.fileSize ?? 0),
    published: Boolean(record.published),
    pinned: Boolean(record.pinned),
    publishedAt: record.publishedAt ?? record.createdAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt ?? '',
  }
}

/** 新建内容：先校验，再落库；任何一步失败都清掉刚上传的文件 */
export async function createContent(body, files) {
  const input = normalizeInput(body)
  const now = new Date().toISOString()
  const cover = pickFile(files, 'cover')
  const attachment = pickFile(files, 'file')

  const record = {
    id: createId('content'),
    ...input,
    coverPath: cover ? toStoredPath(cover.path) : '',
    filePath: attachment ? toStoredPath(attachment.path) : '',
    fileName: attachment ? attachment.originalname : '',
    fileSize: attachment ? attachment.size : 0,
    publishedAt: input.published ? now : '',
    createdAt: now,
    updatedAt: now,
  }

  try {
    await insertContent(record)
  } catch (error) {
    await cleanupUploadedFiles([cover, attachment].filter(Boolean))
    throw error
  }

  return record
}

/** 编辑内容：没传新文件时保留旧文件；勾选移除才真正删除 */
export async function reviseContent(id, body, files) {
  const existing = findContent(id)
  if (!existing || existing.deletedAt) {
    await cleanupUploadedFiles([pickFile(files, 'cover'), pickFile(files, 'file')].filter(Boolean))
    throw notFound('要编辑的内容不存在（可能在回收站里）')
  }

  const input = normalizeInput(body)
  const now = new Date().toISOString()
  const newCover = pickFile(files, 'cover')
  const newAttachment = pickFile(files, 'file')
  const removeCover = readBoolean(body.removeCover, false)
  const removeFile = readBoolean(body.removeFile, false)

  const patch = {
    ...input,
    updatedAt: now,
  }

  if (newCover) patch.coverPath = toStoredPath(newCover.path)
  else if (removeCover) patch.coverPath = ''

  if (newAttachment) {
    patch.filePath = toStoredPath(newAttachment.path)
    patch.fileName = newAttachment.originalname
    patch.fileSize = newAttachment.size
  } else if (removeFile) {
    patch.filePath = ''
    patch.fileName = ''
    patch.fileSize = 0
  }

  // 首次上架时补发布时间；下架不清空，方便重新上架后保持顺序
  if (!existing.publishedAt && input.published) patch.publishedAt = now

  try {
    const updated = await updateContent(id, patch)
    if (!updated) throw notFound('要编辑的内容不存在')

    // 旧文件在新记录写成功后删除，避免中途失败导致文件丢失
    if (patch.coverPath !== undefined && existing.coverPath && existing.coverPath !== patch.coverPath) {
      await removeStoredFile(existing.coverPath)
    }
    if (patch.filePath !== undefined && existing.filePath && existing.filePath !== patch.filePath) {
      await removeStoredFile(existing.filePath)
    }

    return updated
  } catch (error) {
    await cleanupUploadedFiles([newCover, newAttachment].filter(Boolean))
    throw error
  }
}

/**
 * 删除内容：先放进回收站（保留记录与文件），需要彻底删除时再调 purgeContent。
 * 这样误删可以恢复，也不会因为一次手滑丢掉上传的附件。
 */
export async function destroyContent(id) {
  const removed = await markContentDeleted(id)
  if (!removed) throw notFound('要删除的内容不存在')
  return removed
}

/** 从回收站恢复：保持下架状态，避免未经确认就重新出现在公开页面 */
export async function restoreContent(id) {
  const restored = await restoreContentRecord(id)
  if (!restored) throw notFound('要恢复的内容不存在')
  return restored
}

/** 彻底删除：记录连文件一起清掉，不可恢复 */
export async function purgeContent(id) {
  const existing = findContent(id)
  if (!existing) throw notFound('要删除的内容不存在')

  const removed = await removeContent(id)
  if (!removed) throw notFound('要删除的内容不存在')

  await removeStoredFile(removed.coverPath)
  await removeStoredFile(removed.filePath)
  return removed
}

/** 切换上架 / 置顶这类轻量状态 */
export async function patchContentState(id, patch) {
  const existing = findContent(id)
  if (!existing || existing.deletedAt) throw notFound('内容不存在（可能在回收站里）')

  const nextPatch = { ...patch }
  if (nextPatch.published === true && !existing.publishedAt) {
    nextPatch.publishedAt = new Date().toISOString()
  }

  const updated = await updateContent(id, nextPatch)
  if (!updated) throw notFound('内容不存在')
  return updated
}
