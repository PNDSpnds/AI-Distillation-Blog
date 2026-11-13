import { DEFAULT_LLM } from '../config.js'
import { readJson, writeJson } from '../lib/atomic-json.js'
import { BACKUP_DIR, DB_FILE } from '../config.js'
import { createEmptyPersona, normalizePersona } from '../lib/persona.js'

/** 首次运行时的默认数据；后续升级通过 version 做迁移 */
function createDefaultDb() {
  return {
    version: 1,
    contents: [],
    settings: {
      siteName: '一页',
      ownerName: '这里的主人',
      greeting: '你好，我是这里的主人。',
      intro: '我写代码，也写点东西。关于我、我的作品和最近在做的事，都可以直接问我。',
      suggestions: [
        { text: '你最近在做什么？', hint: '看看最新动态' },
        { text: '你写过哪些东西？', hint: '翻翻作品' },
        { text: '你平时怎么创作？', hint: '聊聊方法' },
      ],
      footer: '这是「一页」的 AI 对话主页 · 由本人授权生成',
      categories: ['随笔', '项目', '作品'],
      model: {
        baseUrl: DEFAULT_LLM.baseUrl,
        model: DEFAULT_LLM.model,
      },
    },
    persona: { ...createEmptyPersona() },
    /** AI 生成但还没被确认的人设草稿 */
    personaDraft: null,
    distillSettings: {
      /** 目标题数，可在 1000–2000 之间调 */
      targetCount: 1000,
      /** 每批生成多少题 */
      batchSize: 10,
      /** 已生成到第几批，用于给题目打批次号 */
      lastBatch: 0,
    },
    distillSources: [],
    distillQuestions: [],
    /** 资料原文切块：检索兜底用，不在后台主视图里展示 */
    knowledgeEntries: [],
    /** 从资料与问答里提炼出的事实词条：后台可见可改，对话优先用它 */
    factEntries: [],
    /** 词条分类表：AI 起名、系统归一、用户可改名/合并 */
    factCategories: [],
  }
}

/** 用默认值补全缺失字段，避免旧数据文件缺键导致运行时崩溃 */
function withDefaults(raw) {
  const defaults = createDefaultDb()
  const db = { ...defaults, ...raw }
  db.settings = { ...defaults.settings, ...(raw?.settings ?? {}) }
  db.settings.model = { ...defaults.settings.model, ...(raw?.settings?.model ?? {}) }

  for (const key of [
    'contents',
    'distillSources',
    'distillQuestions',
    'knowledgeEntries',
    'factEntries',
    'factCategories',
  ]) {
    if (!Array.isArray(db[key])) db[key] = []
  }
  db.persona = normalizePersona(raw?.persona)
  db.personaDraft = raw?.personaDraft && typeof raw.personaDraft === 'object' ? raw.personaDraft : null
  db.distillSettings = { ...defaults.distillSettings, ...(raw?.distillSettings ?? {}) }

  return db
}

let state = null

/** 读取整库（内存缓存，避免每个请求都读盘） */
export function getDb() {
  if (!state) {
    state = withDefaults(readJson(DB_FILE, null))
  }
  return state
}

/**
 * 修改数据并持久化。
 * mutator 必须是同步函数：Node 单线程下可保证读到的是同一份内存状态。
 */
export async function mutateDb(mutator) {
  const db = getDb()
  const result = mutator(db)
  await writeJson(DB_FILE, db, { backupDir: BACKUP_DIR })
  return result
}

/** 仅用于测试/重置：丢弃内存缓存，下次访问重新读盘 */
export function invalidateDbCache() {
  state = null
}
