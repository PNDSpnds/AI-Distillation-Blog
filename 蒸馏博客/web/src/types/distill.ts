/**
 * 蒸馏相关的类型定义。
 * 字段与 server/services/distill-*-service.js、server/lib/persona.js 的输出保持一致。
 */

/** 上传的一份蒸馏资料（PDF / Word / 图片 / 文本） */
export interface DistillSource {
  id: string
  fileName: string
  ext: string
  size: number
  sizeText: string
  /** parsed：已解析出文本；failed：解析失败；empty：没抽到文字；parsing：处理中 */
  status: 'pending' | 'parsing' | 'parsed' | 'failed' | 'empty'
  /** 解析提示，例如「扫描版 PDF，暂不支持 OCR」 */
  note: string
  error: string
  charCount: number
  /** 原文切块数量：只在检索兜底时用，界面上不强调 */
  knowledgeCount: number
  /** 从这份资料提炼出的词条数 */
  factCount: number
  /** 词条整理状态 */
  factStatus: 'pending' | 'done' | 'empty' | 'failed'
  createdAt: string
  parsedAt: string
}

/** 词条分类：由 AI 起名、系统归一、用户可改名/合并，所以是数据而不是常量 */
export interface FactCategory {
  id: string
  label: string
  order: number
  origin: 'seed' | 'ai' | 'user'
  createdAt: string
  updatedAt: string
}

/** 词条：从资料或问答里整理出的一条事实，可编辑可删除 */
export interface FactEntry {
  id: string
  categoryId: string
  categoryLabel: string
  title: string
  content: string
  time: string
  sourceType: 'material' | 'qa' | 'manual'
  sourceId: string
  sourceName: string
  /** ai：模型提炼的（重新整理会被替换）；user：你手动改过或新增的（会保留） */
  origin: 'ai' | 'user'
  /** 疑似重复分组号（0 表示没有重复），同号的标题相同 */
  duplicateGroup: number
  duplicateCount: number
  createdAt: string
  updatedAt: string
}

/** 出题维度覆盖情况 */
export interface DistillDimension {
  key: string
  label: string
  total: number
  answered: number
}

/** 一道蒸馏问题 */
export interface DistillQuestion {
  id: string
  batch: number
  question: string
  category: string
  /** 维度 key，例如 growth / education / work */
  dimension: string
  dimensionLabel: string
  status: 'unanswered' | 'answered' | 'skipped'
  answer: string
  /** 这条问答已经整理出多少条词条（0 表示还没整理） */
  factCount: number
  createdAt: string
  answeredAt: string
}

/** 问题蒸馏进度：目标、已答、剩余、跳过 + 维度覆盖 */
export interface DistillProgress {
  target: number
  total: number
  answered: number
  skipped: number
  pending: number
  percent: number
  batchSize: number
  lastBatch: number
  dimensions: DistillDimension[]
}

/** 蒸馏总览统计 */
export interface DistillStats {
  sources: { total: number; parsed: number; failed: number }
  facts: {
    total: number
    byCategory: { id: string; label: string; count: number }[]
    bySource: Record<string, number>
  }
  knowledge: { material: number; qa: number; total: number }
  questions: { total: number; answered: number; skipped: number; pending: number; target: number }
  updatedAt: string
  progress: DistillProgress
}

/** 口头禅频率，只能是这三个值 */
export type CatchphraseFrequency = '高' | '中' | '低'

export interface PersonaCatchphrase {
  text: string
  frequency: CatchphraseFrequency
}

/** 人设卡：决定「像不像你」说话 */
export interface Persona {
  identity: string
  addressing: string
  speaking: {
    sentenceLength: string
    commonWords: string[]
    punctuation: string
    emoji: string
    neverSay: string[]
  }
  emotion: {
    caring: string
    upset: string
    joking: string
  }
  boundaries: {
    knows: string
    unknown: string
    deflect: string
  }
  catchphrases: PersonaCatchphrase[]
  updatedAt: string
}

/** 人设接口返回：正式人设 + 是否已有内容 + 待确认的 AI 草稿 */
export interface PersonaState {
  persona: Persona
  hasContent: boolean
  draft: Persona | null
}

/** 生成题目的返回 */
export interface GenerateQuestionsResult {
  batch: number
  items: DistillQuestion[]
  progress: DistillProgress
}
