import { badRequest, notFound } from '../lib/http-error.js'
import { createId } from '../lib/ids.js'
import {
  QUESTION_DIMENSIONS,
  QUESTION_DIMENSION_KEYS,
  dimensionLabel,
  pickDimensions,
} from '../lib/question-dimensions.js'
import { getDb, mutateDb } from '../repositories/db.js'
import { requestJsonCompletion } from './llm-service.js'
import { createKnowledgeFromAnswer } from './knowledge-service.js'
import { readExtractedText } from './distill-sources-service.js'
import { buildFactDigest, extractFactsFromAnswer } from './fact-service.js'

/** 每批生成的题数上限，防止一次要太多导致模型截断 */
const MAX_BATCH = 20
/** 生成时最多给模型看多少字的资料，控制成本与速度 */
const PROMPT_MATERIAL_CHARS = 6000

/** 去重用的归一化：去掉标点与空白，只比语义主体 */
function normalizeQuestion(text) {
  return String(text ?? '')
    .replace(/[\s\p{P}]/gu, '')
    .toLowerCase()
}

/**
 * 题目对外结构。
 *
 * 第二个参数同样用对象：`.map(toPublicQuestion)` 会把索引当第二个参数传进来，
 * 索引也是有限数字，用 typeof 判断无法区分，只有对象解构能安全退回默认值。
 */
export function toPublicQuestion(record, { factCount = 0 } = {}) {
  return {
    id: record.id,
    batch: record.batch,
    question: record.question,
    category: record.category ?? '',
    /** 维度 key（成长/教育/工作…），空表示旧数据没有记 */
    dimension: record.dimension ?? '',
    dimensionLabel: record.dimension ? dimensionLabel(record.dimension) : record.category ?? '',
    status: record.status,
    answer: record.answer ?? '',
    /** 这条问答已经整理出多少条词条（0 表示还没整理） */
    factCount: Number.isFinite(factCount) ? factCount : 0,
    createdAt: record.createdAt,
    answeredAt: record.answeredAt ?? '',
  }
}

export function listQuestions({ status, dimension } = {}) {
  const items = getDb().distillQuestions.slice()
  const filtered = items.filter((item) => {
    if (status && item.status !== status) return false
    if (dimension && item.dimension !== dimension) return false
    return true
  })
  // 未答的排前面，其次按批次与创建时间
  return filtered.sort((left, right) => {
    if (left.status !== right.status) return left.status === 'unanswered' ? -1 : 1
    if (left.batch !== right.batch) return left.batch - right.batch
    return left.createdAt.localeCompare(right.createdAt)
  })
}

export function findQuestion(id) {
  return getDb().distillQuestions.find((item) => item.id === id) ?? null
}

/** 把资料与内容压成提示词背景，超长时按字数截断 */
function buildMaterialBrief() {
  const db = getDb()
  const parts = []

  const parsedSources = db.distillSources.filter((item) => item.status === 'parsed')
  let budget = PROMPT_MATERIAL_CHARS

  for (const source of parsedSources) {
    if (budget <= 0) break
    const text = readExtractedText(source.id).slice(0, budget)
    if (!text) continue
    budget -= text.length
    parts.push(`【资料：${source.fileName}】\n${text}`)
  }

  const publishedContents = db.contents.filter((item) => item.published && !item.deletedAt)
  if (publishedContents.length > 0) {
    const list = publishedContents
      .slice(0, 20)
      .map((item) => `- 《${item.title}》（${item.kindLabel || item.kind}，${item.category || '未分类'}）：${item.summary}`)
      .join('\n')
    parts.push(`【已发布的内容】\n${list}`)
  }

  return parts.join('\n\n')
}

const QUESTION_SYSTEM_PROMPT = `你在帮作者整理一份「数字分身」的问答清单。这份清单要能蒸馏出一个完整的人，而不只是一个会写代码的账号。

两类题都要出：
A. 顺着已有的：资料与事实词条里已经写过的事，问细节、问当时的感受、问为什么。
B. 按维度补没写过的：问资料里还没记录的事。资料里没有不等于不能问，可以问「你有没有…」「你怎么看…」，让作者自己回答。
   注意：不要替作者编造事实（不能写「你上次说的那个一等奖」），但可以问「你拿过什么奖」这种开放问题。

硬性要求：
1. 必须覆盖本次指定的维度，每个维度按分配数量出题，题面里能看出在问那个方面。
2. 问题要口语化、一句话说完，像访客真的会问的。
3. 生活、家庭、感情、健康、钱、失败这些私人问题要大胆问，这是最能体现一个人和最能补资料空白的部分，语气自然、不冒犯。
4. 不要和「已有问题」重复或近似。
5. 不要出现「根据资料」「从文中」「词条」这类字眼。
6. 特别不要只问写代码、做项目、做工具：除非维度就是工作/技能，否则不要往技术细节上带。
7. 一批里题型要交替，别整批都是「为什么…」：回忆具体经历、二选一（A 还是 B）、
   假设场景（如果…你会…）、观点判断（你怎么看…）、细节追问（那次具体怎么弄的）、
   对比（以前和现在有什么不一样）、列举（说三件…）。同一批里至少出现 3 种题型。
8. 不许预设作者的家庭与经历：不要写「你弟弟」「你老婆」「你孩子」「你上大学那会儿」这类默认存在的关系，
   要问就先问有没有，例如「家里有兄弟姐妹吗，跟谁最亲近？」。

输出 JSON：
{"questions":[{"question":"…","dimension":"growth"}]}
dimension 只能取：${QUESTION_DIMENSION_KEYS.join(' / ')}`

/**
 * 生成一批问题。
 * 已有问题会作为「不要重复」的清单给模型，生成后再做一次本地去重兜底。
 * 每批按维度分配题数，保证不会整批都在问作品和技术。
 */
export async function generateQuestions({ count } = {}) {
  const db = getDb()
  const batchSize = Math.min(
    Math.max(Number.parseInt(count ?? db.distillSettings.batchSize, 10) || 10, 1),
    MAX_BATCH,
  )

  const materialBrief = buildMaterialBrief()
  const factDigest = buildFactDigest({ limit: 80 })
  if (!materialBrief && !factDigest) {
    throw badRequest('还没有可用的资料：先上传资料，或先发布几条内容')
  }

  const existing = db.distillQuestions.map((item) => item.question)
  const existingBrief = existing.slice(-60).map((item) => `- ${item}`).join('\n')

  // 统计每个维度已经出了多少题，挑最久没问到的几个维度
  const dimensionCounts = {}
  for (const item of db.distillQuestions) {
    if (!item.dimension) continue
    dimensionCounts[item.dimension] = (dimensionCounts[item.dimension] ?? 0) + 1
  }
  const dimensions = pickDimensions({ counts: dimensionCounts, batchSize })
  // 把本批题数平均分给选中的维度，余数给前几个
  const base = Math.floor(batchSize / dimensions.length)
  const remainder = batchSize - base * dimensions.length
  const dimensionPlan = dimensions
    .map((item, index) => ({
      ...item,
      quota: base + (index < remainder ? 1 : 0),
    }))
    .filter((item) => item.quota > 0)

  const planText = dimensionPlan
    .map((item) => `- ${item.label}（${item.key}）：${item.quota} 题。这个维度可以问：${item.brief}`)
    .join('\n')

  const userPrompt = `【已知的事实词条】
${factDigest || '（还没有整理出词条）'}

【资料与已发布内容】
${materialBrief || '（暂无）'}

【本批要覆盖的维度与题数】
${planText}

【已有问题（不要重复）】
${existingBrief || '（暂无）'}

请按上面的维度分配，生成 ${batchSize} 个新问题。`

  const parsed = await requestJsonCompletion({
    messages: [
      { role: 'system', content: QUESTION_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    maxTokens: 3000,
    temperature: 0.85,
  })

  const rawList = Array.isArray(parsed?.questions)
    ? parsed.questions
    : Array.isArray(parsed)
      ? parsed
      : []

  if (rawList.length === 0) {
    throw new Error('模型没有返回可用的题目，稍后再试一次')
  }

  const seen = new Set(existing.map(normalizeQuestion))
  const now = new Date().toISOString()
  const nextBatch = (db.distillSettings.lastBatch ?? 0) + 1
  const accepted = []
  // 模型偶尔会把维度写错，按顺序兜底分配，保证题题都有维度
  let fallbackIndex = 0

  for (const item of rawList) {
    const question = typeof item === 'string' ? item : item?.question
    if (typeof question !== 'string') continue

    const trimmed = question.trim().slice(0, 120)
    if (!trimmed) continue

    const key = normalizeQuestion(trimmed)
    if (seen.has(key)) continue
    seen.add(key)

    const rawDimension = typeof item?.dimension === 'string' ? item.dimension.trim() : ''
    const dimension = QUESTION_DIMENSION_KEYS.includes(rawDimension)
      ? rawDimension
      : dimensionPlan[fallbackIndex % dimensionPlan.length]?.key ?? 'growth'
    fallbackIndex += 1

    accepted.push({
      id: createId('q'),
      batch: nextBatch,
      question: trimmed,
      dimension,
      category: dimensionLabel(dimension),
      status: 'unanswered',
      answer: '',
      createdAt: now,
      answeredAt: '',
    })
  }

  if (accepted.length === 0) {
    throw new Error('这一批和已有问题重复了，再生成一次试试')
  }

  await mutateDb((state) => {
    state.distillQuestions.push(...accepted)
    state.distillSettings.lastBatch = nextBatch
  })

  return { batch: nextBatch, items: accepted.map((item) => toPublicQuestion(item)) }
}

/** 保存答案：同时写一条高权重知识，供对话检索使用 */
export async function answerQuestion(id, answer) {
  const record = findQuestion(id)
  if (!record) throw notFound('题目不存在')

  const text = typeof answer === 'string' ? answer.trim() : ''
  if (!text) throw badRequest('答案不能为空')

  const now = new Date().toISOString()
  await mutateDb((db) => {
    const target = db.distillQuestions.find((item) => item.id === id)
    if (target) {
      target.status = 'answered'
      target.answer = text.slice(0, 4000)
      target.answeredAt = now
    }
  })

  await createKnowledgeFromAnswer({
    questionId: id,
    question: record.question,
    answer: text,
  })

  return findQuestion(id)
}

/** 跳过：标记为 skipped，不产生知识 */
export async function skipQuestion(id) {
  const record = findQuestion(id)
  if (!record) throw notFound('题目不存在')

  await mutateDb((db) => {
    const target = db.distillQuestions.find((item) => item.id === id)
    if (target) {
      target.status = 'skipped'
      target.answeredAt = new Date().toISOString()
    }
  })

  return findQuestion(id)
}

/** 撤销：把已答/已跳过改回未答，并删掉对应的问答知识与问答词条 */
export async function resetQuestion(id) {
  const record = findQuestion(id)
  if (!record) throw notFound('题目不存在')

  await mutateDb((db) => {
    const target = db.distillQuestions.find((item) => item.id === id)
    if (target) {
      target.status = 'unanswered'
      target.answer = ''
      target.answeredAt = ''
      target.factCount = 0
    }
    db.knowledgeEntries = db.knowledgeEntries.filter((item) => item.sourceId !== id)
    db.factEntries = db.factEntries.filter((item) => item.sourceId !== id)
  })

  return findQuestion(id)
}

/** 更新进度目标与批量大小 */
export async function saveQuestionSettings({ targetCount, batchSize }) {
  return mutateDb((db) => {
    if (targetCount !== undefined) {
      const parsed = Number.parseInt(targetCount, 10)
      if (Number.isFinite(parsed)) {
        // 目标题数限制在 100–2000，避免误填 0 或天文数字
        db.distillSettings.targetCount = Math.min(Math.max(parsed, 100), 2000)
      }
    }
    if (batchSize !== undefined) {
      const parsed = Number.parseInt(batchSize, 10)
      if (Number.isFinite(parsed)) {
        db.distillSettings.batchSize = Math.min(Math.max(parsed, 1), MAX_BATCH)
      }
    }
    return db.distillSettings
  })
}

/**
 * 批量操作题目。
 * 一次最多 200 条，避免前端误传整库把写盘拖死。
 */
export async function batchQuestions({ ids, action }) {
  const list = Array.isArray(ids)
    ? [...new Set(ids.filter((id) => typeof id === 'string' && id))].slice(0, 200)
    : []
  if (list.length === 0) throw badRequest('没有选中任何题目')

  const allowed = ['skip', 'reset', 'delete']
  if (!allowed.includes(action)) throw badRequest('不支持的批量操作')

  const now = new Date().toISOString()
  let affected = 0

  await mutateDb((db) => {
    if (action === 'delete') {
      const removed = new Set(list)
      affected = db.distillQuestions.filter((item) => removed.has(item.id)).length
      db.distillQuestions = db.distillQuestions.filter((item) => !removed.has(item.id))
      // 题目删了，它产生的问答知识与词条也要一起清，否则会留孤儿数据继续影响回答
      db.knowledgeEntries = db.knowledgeEntries.filter((item) => !removed.has(item.sourceId))
      db.factEntries = db.factEntries.filter((item) => !removed.has(item.sourceId))
      return
    }

    for (const question of db.distillQuestions) {
      if (!list.includes(question.id)) continue
      affected += 1
      if (action === 'skip') {
        question.status = 'skipped'
        question.answeredAt = now
        continue
      }
      // reset：回到未答，同时清掉它的问答知识与问答词条
      question.status = 'unanswered'
      question.answer = ''
      question.answeredAt = ''
      question.factCount = 0
      db.knowledgeEntries = db.knowledgeEntries.filter((item) => item.sourceId !== question.id)
      db.factEntries = db.factEntries.filter((item) => item.sourceId !== question.id)
    }
  })

  return { affected, action }
}

/** 兜底规则：模型没给维度时，用关键词猜一个，总比留空好 */
const DIMENSION_KEYWORDS = [
  { key: 'money', pattern: /钱|收入|工资|消费|花销|预算|买/ },
  { key: 'health', pattern: /健康|身体|运动|健身|作息|熬夜|睡|吃|饮食|体检/ },
  { key: 'relation', pattern: /朋友|家人|父母|爸|妈|恋爱|对象|感情|结婚|伴侣|同学|同事/ },
  { key: 'failure', pattern: /失败|后悔|遗憾|挫折|放弃|被否|搞砸/ },
  { key: 'goal', pattern: /目标|计划|打算|未来|想做|梦想/ },
  { key: 'emotion', pattern: /情绪|生气|难过|开心|性格|内向|外向|放松|焦虑/ },
  { key: 'value', pattern: /怎么看|认为|觉得|价值观|原则|妥协|意义/ },
  { key: 'interest', pattern: /爱好|兴趣|喜欢|玩|看|听|音乐|电影|游戏/ },
  { key: 'education', pattern: /学校|专业|大学|学历|上学|读书|毕业/ },
  { key: 'skill', pattern: /技能|工具|会什么|擅长|技术|语言|框架/ },
  { key: 'work', pattern: /工作|公司|项目|实习|岗位|职业/ },
  { key: 'growth', pattern: /老家|小时候|成长|家庭|几口人/ },
]

function guessDimension(question) {
  for (const item of DIMENSION_KEYWORDS) {
    if (item.pattern.test(question)) return item.key
  }
  return ''
}

/**
 * 给旧题目补维度。
 * 优先一次模型调用批量判定；失败或返回不完整时用关键词兜底，保证一定能补上。
 */
export async function backfillDimensions() {
  const db = getDb()
  const targets = db.distillQuestions
    .filter((item) => !item.dimension)
    .slice(0, 60)

  if (targets.length === 0) return { updated: 0, usedModel: false }

  let assignments = new Map()
  let usedModel = false

  try {
    const parsed = await requestJsonCompletion({
      messages: [
        {
          role: 'system',
          content: `把每个问题归到一个维度。只能取这些 key：${QUESTION_DIMENSION_KEYS.join(' / ')}。
输出 JSON：{"items":[{"id":"题目id","dimension":"growth"}]}`,
        },
        {
          role: 'user',
          content: targets.map((item) => `- ${item.id}：${item.question}`).join('\n'),
        },
      ],
      maxTokens: 2000,
      temperature: 0,
    })

    if (parsed && Array.isArray(parsed.items)) {
      usedModel = true
      for (const item of parsed.items) {
        if (typeof item?.id !== 'string') continue
        if (!QUESTION_DIMENSION_KEYS.includes(item?.dimension)) continue
        assignments.set(item.id, item.dimension)
      }
    }
  } catch {
    // 模型不可用时静默降级到关键词
  }

  let updated = 0
  await mutateDb((state) => {
    for (const question of state.distillQuestions) {
      if (question.dimension) continue
      const dimension = assignments.get(question.id) ?? guessDimension(question.question)
      if (!dimension) continue
      question.dimension = dimension
      question.category = dimensionLabel(dimension)
      updated += 1
    }
  })

  return { updated, usedModel }
}

/**
 * 把一条已答的问题整理成词条。
 * 答题内容是最贴近本人的材料，值得单独沉淀。
 */
export async function extractQuestionFacts(id) {
  const record = findQuestion(id)
  if (!record) throw notFound('题目不存在')
  if (record.status !== 'answered' || !record.answer) {
    throw badRequest('这道题还没回答，先答完再整理词条')
  }

  const facts = await extractFactsFromAnswer({
    questionId: id,
    question: record.question,
    answer: record.answer,
  })

  await mutateDb((db) => {
    const target = db.distillQuestions.find((item) => item.id === id)
    if (target) target.factCount = facts.length
  })

  return { item: findQuestion(id), facts }
}

/** 进度：已答 / 目标、剩余未答、跳过数 + 维度覆盖 */
export function getProgress() {
  const db = getDb()
  const total = db.distillQuestions.length
  const answered = db.distillQuestions.filter((item) => item.status === 'answered').length
  const skipped = db.distillQuestions.filter((item) => item.status === 'skipped').length
  const pending = total - answered - skipped
  const target = db.distillSettings.targetCount

  // 维度覆盖：让用户看到"人"的哪些方面还没被问到
  const dimensions = QUESTION_DIMENSIONS.map((item) => {
    const list = db.distillQuestions.filter((question) => question.dimension === item.key)
    return {
      key: item.key,
      label: item.label,
      total: list.length,
      answered: list.filter((question) => question.status === 'answered').length,
    }
  })

  return {
    target,
    total,
    answered,
    skipped,
    pending,
    /** 以「已答 / 目标」算完成度，目标未达成时不会被跳过题虚高 */
    percent: target > 0 ? Math.min(100, Math.round((answered / target) * 100)) : 0,
    batchSize: db.distillSettings.batchSize,
    lastBatch: db.distillSettings.lastBatch,
    dimensions,
  }
}
