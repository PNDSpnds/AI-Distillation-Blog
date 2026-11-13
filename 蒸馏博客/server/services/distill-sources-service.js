import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR, DISTILL_DIR } from '../config.js'
import { badRequest, notFound } from '../lib/http-error.js'
import { createId } from '../lib/ids.js'
import { parseMaterial } from '../parsers/material-parser.js'
import { getDb, mutateDb } from '../repositories/db.js'
import { removeStoredFile, toAbsolutePath, toStoredPath } from '../storage/local-storage.js'
import { countKnowledge, createKnowledgeFromText, removeKnowledgeBySource } from './knowledge-service.js'
import {
  countFacts,
  extractFactsFromText,
  removeFactsBySource,
  replaceFactsForSource,
} from './fact-service.js'
/** 单份资料解析后最多保留多少字，防止一个巨型文件把检索拖垮 */
const MAX_TEXT_CHARS = 200_000

/** 对外输出：不暴露磁盘路径 */
export function toPublicSource(record) {
  return {
    id: record.id,
    fileName: record.fileName,
    ext: record.ext,
    size: record.size,
    sizeText: formatSize(record.size),
    status: record.status,
    note: record.note ?? '',
    error: record.error ?? '',
    charCount: record.charCount ?? 0,
    knowledgeCount: record.knowledgeCount ?? 0,
    factCount: record.factCount ?? 0,
    factStatus: record.factStatus ?? 'pending',
    createdAt: record.createdAt,
    parsedAt: record.parsedAt ?? '',
  }
}

function formatSize(bytes) {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

/** 解析后把纯文本单独存文件，避免 db.json 被长文撑大 */
function textFilePathOf(sourceId) {
  return path.join(DISTILL_DIR, `${sourceId}.txt`)
}

function writeExtractedText(sourceId, text) {
  const target = textFilePathOf(sourceId)
  fs.writeFileSync(target, text, 'utf8')
  return toStoredPath(target)
}

export function readExtractedText(sourceId) {
  const target = textFilePathOf(sourceId)
  if (!fs.existsSync(target)) return ''
  return fs.readFileSync(target, 'utf8')
}

export function listSources() {
  return getDb()
    .distillSources.slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function findSource(id) {
  return getDb().distillSources.find((item) => item.id === id) ?? null
}

/**
 * 把解析出的正文落到一份资料上：写文本 → 切块（原文兜底）。
 * 词条整理改成后台异步：大文件解析已经够慢，再等模型会给"上传卡住"的错觉。
 */
async function applyTextToSource(record, text, baseNote) {
  writeExtractedText(record.id, text)

  const entries = await createKnowledgeFromText({
    sourceId: record.id,
    sourceName: record.fileName,
    text,
  })

  await mutateDb((db) => {
    const target = db.distillSources.find((item) => item.id === record.id)
    if (target) {
      target.status = 'parsed'
      target.note = baseNote
      target.error = ''
      target.charCount = text.length
      target.knowledgeCount = entries.length
      target.factCount = 0
      target.factStatus = 'pending'
      target.parsedAt = new Date().toISOString()
    }
  })

  return {
    note: baseNote,
    charCount: text.length,
    knowledgeCount: entries.length,
    factCount: 0,
    factStatus: 'pending',
  }
}

/** 正在整理词条的来源，防止重复触发同一份资料的两次模型调用 */
const inflight = new Set()

/**
 * 整理某份资料的词条（核心流程，可 await）。
 * 前端上传后立即返回，再由后台调用；后台也用它做「重新整理」与启动时的续跑。
 */
export async function runFactExtraction(sourceId) {
  const record = findSource(sourceId)
  if (!record) throw notFound('资料不存在')
  if (inflight.has(sourceId)) {
    return { ...record, factStatus: 'pending' }
  }

  const text = readExtractedText(sourceId)
  if (!text) {
    await mutateDb((db) => {
      const target = db.distillSources.find((item) => item.id === sourceId)
      if (target) {
        target.factStatus = 'failed'
        target.note = '没有可整理的文字，请先点「重新解析」'
      }
    })
    return findSource(sourceId)
  }

  inflight.add(sourceId)
  await mutateDb((db) => {
    const target = db.distillSources.find((item) => item.id === sourceId)
    if (target) target.factStatus = 'pending'
  })

  try {
    const facts = await extractFactsFromText({ text, sourceName: record.fileName })
    await replaceFactsForSource({ sourceId, sourceName: record.fileName, facts })
    await mutateDb((db) => {
      const target = db.distillSources.find((item) => item.id === sourceId)
      if (target) {
        target.factCount = facts.length
        target.factStatus = facts.length > 0 ? 'done' : 'empty'
        target.note = ''
      }
    })
  } catch (error) {
    await mutateDb((db) => {
      const target = db.distillSources.find((item) => item.id === sourceId)
      if (target) {
        target.factStatus = 'failed'
        target.note = `词条整理失败：${error.message}`
      }
    })
  } finally {
    inflight.delete(sourceId)
  }

  return findSource(sourceId)
}

/** 后台跑，不阻塞上传响应 */
function scheduleFactExtraction(sourceId) {
  setTimeout(() => {
    void runFactExtraction(sourceId).catch((error) => {
      console.warn(`[distill] 词条整理失败 ${sourceId}：${error.message}`)
    })
  }, 0)
}

/**
 * 启动时续跑：上次退出时还在 pending 的，重新排一次。
 * 避免"上传完就关服务"导致资料永远停在「正在整理词条」。
 */
export function resumePendingFactJobs() {
  const pending = getDb().distillSources.filter((item) => item.factStatus === 'pending')
  for (const item of pending) scheduleFactExtraction(item.id)
  return pending.length
}

/**
 * 上传资料：先落一条 pending，再解析，最后写回状态。
 * 解析失败不删文件，保留给用户排查（比如扫描版 PDF）。
 */
export async function addSource(file) {
  if (!file) throw badRequest('没有收到文件')

  const now = new Date().toISOString()
  const record = {
    id: createId('src'),
    fileName: file.originalname,
    ext: path.extname(file.originalname).toLowerCase(),
    size: file.size,
    storedPath: toStoredPath(file.path),
    status: 'parsing',
    note: '',
    error: '',
    charCount: 0,
    knowledgeCount: 0,
    factCount: 0,
    factStatus: 'pending',
    createdAt: now,
    parsedAt: '',
  }

  await mutateDb((db) => {
    db.distillSources.push(record)
  })

  const absolutePath = toAbsolutePath(record.storedPath)
  let parsed
  try {
    parsed = await parseMaterial(absolutePath)
  } catch (error) {
    await mutateDb((db) => {
      const target = db.distillSources.find((item) => item.id === record.id)
      if (target) {
        target.status = 'failed'
        target.error = error.message
        target.parsedAt = new Date().toISOString()
      }
    })
    return { ...record, status: 'failed', error: error.message }
  }

  const text = parsed.text.slice(0, MAX_TEXT_CHARS)
  const truncated = parsed.text.length > MAX_TEXT_CHARS

  if (!text) {
    await mutateDb((db) => {
      const target = db.distillSources.find((item) => item.id === record.id)
      if (target) {
        target.status = 'empty'
        target.note = parsed.note || '没有提取到文字'
        target.parsedAt = new Date().toISOString()
      }
    })
    return { ...record, status: 'empty', note: parsed.note }
  }

  writeExtractedText(record.id, text)
  const result = await applyTextToSource(
    record,
    text,
    [parsed.note, truncated ? `文本超过 ${MAX_TEXT_CHARS} 字，已截断` : ''].filter(Boolean).join('；'),
  )

  // 词条整理放到后台跑，上传请求立刻返回，前端轮询看进度
  scheduleFactExtraction(record.id)

  return { ...record, status: 'parsed', ...result }
}

/** 删除资料：文件、提取文本、原文块、词条一起清 */
export async function removeSource(id) {
  const record = findSource(id)
  if (!record) throw notFound('资料不存在')

  await removeKnowledgeBySource(id)
  await removeFactsBySource(id)
  await removeStoredFile(record.storedPath)

  const textPath = textFilePathOf(id)
  if (fs.existsSync(textPath)) fs.rmSync(textPath, { force: true })

  await mutateDb((db) => {
    db.distillSources = db.distillSources.filter((item) => item.id !== id)
  })

  return record
}

/**
 * 只重新整理词条：原文不变，只让模型重新读一遍已有文本。
 * 适合换了模型、或第一次提炼效果不满意时重试，不必重新解析文件。
 */
export async function extractFacts(id) {
  const record = findSource(id)
  if (!record) throw notFound('资料不存在')

  const text = readExtractedText(id)
  if (!text) throw badRequest('这份资料还没有抽取出文字，请先点「重新解析」')

  const updated = await runFactExtraction(id)
  if (updated?.factStatus === 'failed') {
    throw badRequest(updated.note || '词条整理失败，稍后再试')
  }
  return updated ?? findSource(id)
}

/** 重新解析：用于解析失败的资料修好后重试 */
export async function reparseSource(id) {
  const record = findSource(id)
  if (!record) throw notFound('资料不存在')

  const absolutePath = toAbsolutePath(record.storedPath)
  if (!fs.existsSync(absolutePath)) throw notFound('原始文件已丢失，请重新上传')

  const parsed = await parseMaterial(absolutePath).catch((error) => ({ error }))
  if (parsed.error) {
    await mutateDb((db) => {
      const target = db.distillSources.find((item) => item.id === id)
      if (target) {
        target.status = 'failed'
        target.error = parsed.error.message
        target.parsedAt = new Date().toISOString()
      }
    })
    return { ...record, status: 'failed', error: parsed.error.message }
  }

  const text = parsed.text.slice(0, MAX_TEXT_CHARS)
  if (!text) {
    await mutateDb((db) => {
      const target = db.distillSources.find((item) => item.id === id)
      if (target) {
        target.status = 'empty'
        target.note = parsed.note || '没有提取到文字'
        target.error = ''
        target.parsedAt = new Date().toISOString()
      }
    })
    return { ...record, status: 'empty' }
  }

  writeExtractedText(id, text)
  const result = await applyTextToSource(record, text, parsed.note ?? '')
  scheduleFactExtraction(id)

  return { ...record, status: 'parsed', ...result }
}

/** 概览数据：一次给前端所有需要统计的数字 */
export function getDistillStats() {
  const db = getDb()
  const knowledge = countKnowledge()
  const facts = countFacts()
  const answered = db.distillQuestions.filter((item) => item.status === 'answered').length
  const skipped = db.distillQuestions.filter((item) => item.status === 'skipped').length
  const pending = db.distillQuestions.filter((item) => item.status === 'unanswered').length

  return {
    sources: {
      total: db.distillSources.length,
      parsed: db.distillSources.filter((item) => item.status === 'parsed').length,
      failed: db.distillSources.filter((item) => item.status === 'failed').length,
    },
    facts,
    knowledge,
    questions: {
      total: db.distillQuestions.length,
      answered,
      skipped,
      pending,
      target: db.distillSettings.targetCount,
    },
    updatedAt: new Date().toISOString(),
  }
}

/** 供其它模块读取蒸馏目录（避免重复拼路径） */
export const DISTILL_DIR_PATH = DISTILL_DIR
export const DATA_DIR_PATH = DATA_DIR
