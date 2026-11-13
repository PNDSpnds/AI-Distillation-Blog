import { badRequest, notFound } from '../lib/http-error.js'
import { createId } from '../lib/ids.js'
import {
  CATEGORY_LABEL_MAX,
  MAX_CATEGORIES,
  isSameCategory,
  normalizeLabel,
  sanitizeCategoryLabel,
} from '../lib/fact-categories.js'
import { getDb, mutateDb } from '../repositories/db.js'
import { requestJsonCompletion } from './llm-service.js'

/** 单份资料最多提炼多少条词条：太少会漏，太多会变成流水账 */
const MAX_FACTS_PER_SOURCE = 60
/** 一条问答最多提炼多少条词条 */
const MAX_FACTS_PER_ANSWER = 12
/** 喂给模型的资料正文上限 */
const PROMPT_BUDGET = 9000
const TITLE_MAX = 40
const CONTENT_MAX = 240
const TIME_MAX = 24

/* ---------------- 分类表 ---------------- */

/** 分类 id 前缀，方便肉眼区分数据 */
const CATEGORY_PREFIX = 'cat'

export function listCategories() {
  return getDb()
    .factCategories.slice()
    .sort((left, right) => {
      if (left.order !== right.order) return left.order - right.order
      return left.label.localeCompare(right.label, 'zh-CN')
    })
}

export function findCategory(id) {
  return getDb().factCategories.find((item) => item.id === id) ?? null
}

/** 取分类中文名；查不到时给「未分类」，界面上不会出现空白标签 */
export function categoryLabelOf(categoryId) {
  return findCategory(categoryId)?.label ?? '未分类'
}

/**
 * 把「AI 起的分类名」解析成分类 id。
 * 先找完全一样的，再找近义的，都没有才新建——这是"自动分类但不碎"的关键。
 */
function resolveCategoryId(db, rawLabel) {
  const label = sanitizeCategoryLabel(rawLabel) || '其他'
  const existing = db.factCategories.find((item) => isSameCategory(item.label, label))
  if (existing) return existing.id

  if (db.factCategories.length >= MAX_CATEGORIES) {
    // 分类太多时不再新建，全部并进「其他」，避免筛选条失控
    const fallback = db.factCategories.find((item) => item.label === '其他')
    if (fallback) return fallback.id
  }

  const record = {
    id: createId(CATEGORY_PREFIX),
    label,
    order: (db.factCategories.at(-1)?.order ?? 0) + 10,
    origin: 'ai',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  db.factCategories.push(record)
  return record.id
}

/** 手动新增一个分类（用户自己起名） */
export async function createCategory(rawLabel) {
  const label = sanitizeCategoryLabel(rawLabel)
  if (!label) throw badRequest('分类名不能为空')

  const db = getDb()
  const existing = db.factCategories.find((item) => isSameCategory(item.label, label))
  if (existing) return existing

  const record = {
    id: createId(CATEGORY_PREFIX),
    label,
    order: (db.factCategories.at(-1)?.order ?? 0) + 10,
    origin: 'user',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  await mutateDb((state) => {
    state.factCategories.push(record)
  })
  return record
}

/** 分类改名：词条通过 id 关联，改名不用动词条 */
export async function renameCategory(id, rawLabel) {
  const record = findCategory(id)
  if (!record) throw notFound('分类不存在')

  const label = sanitizeCategoryLabel(rawLabel)
  if (!label) throw badRequest('分类名不能为空')

  const db = getDb()
  const clash = db.factCategories.find(
    (item) => item.id !== id && isSameCategory(item.label, label),
  )
  if (clash) throw badRequest(`已经有一个叫「${clash.label}」的分类了，可以直接合并过去`)

  await mutateDb((state) => {
    const target = state.factCategories.find((item) => item.id === id)
    if (!target) return
    target.label = label
    target.origin = 'user'
    target.updatedAt = new Date().toISOString()
  })

  return findCategory(id)
}

/** 合并分类：把 fromId 下的词条全部挂到 toId，然后删掉 fromId */
export async function mergeCategories({ fromId, toId }) {
  if (!fromId || !toId || fromId === toId) throw badRequest('请选择两个不同的分类')
  const from = findCategory(fromId)
  const to = findCategory(toId)
  if (!from || !to) throw notFound('分类不存在')

  let moved = 0
  await mutateDb((state) => {
    for (const fact of state.factEntries) {
      if (fact.categoryId !== fromId) continue
      fact.categoryId = toId
      fact.origin = 'user'
      moved += 1
    }
    state.factCategories = state.factCategories.filter((item) => item.id !== fromId)
  })

  return { moved, from: from.label, to: to.label }
}

/** 删除分类：只允许删空的，有词条时先让人挪走 */
export async function removeCategory(id) {
  const record = findCategory(id)
  if (!record) throw notFound('分类不存在')

  const used = getDb().factEntries.filter((fact) => fact.categoryId === id).length
  if (used > 0) throw badRequest(`「${record.label}」下面还有 ${used} 条词条，先合并或改分类再删`)

  await mutateDb((state) => {
    state.factCategories = state.factCategories.filter((item) => item.id !== id)
  })

  return record
}

/* ---------------- 词条读写 ---------------- */

/**
 * 词条对外结构：带分类名与来源信息。
 *
 * 第二个参数用对象而不是裸数组：`list.map(toPublicFact)` 是很容易犯的写法，
 * Array.map 会把「数组索引」塞进第二个参数。裸数组版本会当场崩在 .find 上；
 * 用对象解构则拿到 undefined，安全退回自取分类。
 */
export function toPublicFact(record, { categories = listCategories() } = {}) {
  const list = Array.isArray(categories) ? categories : listCategories()
  const category = list.find((item) => item.id === record.categoryId)
  return {
    id: record.id,
    categoryId: record.categoryId ?? '',
    categoryLabel: category?.label ?? '未分类',
    title: record.title,
    content: record.content,
    time: record.time ?? '',
    sourceType: record.sourceType,
    sourceId: record.sourceId ?? '',
    sourceName: record.sourceName ?? '',
    /** ai 表示模型提炼的（重新整理时会被替换），user 表示你手动改过或新增的（会保留） */
    origin: record.origin ?? 'ai',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt ?? record.createdAt,
  }
}

/** 把词条列表按「疑似重复」分组：同名的放一组，返回 id → { group, count } */
function buildDuplicateIndex(facts) {
  const buckets = new Map()
  for (const fact of facts) {
    const key = normalizeLabel(fact.title)
    if (!key) continue
    const list = buckets.get(key) ?? []
    list.push(fact.id)
    buckets.set(key, list)
  }

  const index = new Map()
  let group = 0
  for (const ids of buckets.values()) {
    if (ids.length < 2) continue
    group += 1
    for (const id of ids) index.set(id, { group, count: ids.length })
  }
  return index
}

/**
 * 查询词条。
 * 支持来源、分类、关键词过滤，以及两种排序。
 */
export function listFacts({ sourceId, categoryId, query, sort = 'category' } = {}) {
  const db = getDb()
  const categories = listCategories()
  const orderOf = new Map(categories.map((item, index) => [item.id, index]))
  const needle = normalizeLabel(query)

  const filtered = db.factEntries.filter((item) => {
    if (sourceId && item.sourceId !== sourceId) return false
    if (categoryId && item.categoryId !== categoryId) return false
    if (!needle) return true
    const haystack = normalizeLabel(`${item.title}${item.content}${item.sourceName ?? ''}`)
    return haystack.includes(needle)
  })

  const sorted = filtered.slice().sort((left, right) => {
    if (sort === 'recent') {
      return String(right.updatedAt ?? right.createdAt).localeCompare(
        String(left.updatedAt ?? left.createdAt),
      )
    }
    const leftOrder = orderOf.get(left.categoryId) ?? 999
    const rightOrder = orderOf.get(right.categoryId) ?? 999
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    return String(right.time ?? '').localeCompare(String(left.time ?? ''))
  })

  const duplicates = buildDuplicateIndex(sorted)

  return sorted.map((record) => {
    const dto = toPublicFact(record, { categories })
    const duplicate = duplicates.get(record.id)
    return {
      ...dto,
      duplicateGroup: duplicate?.group ?? 0,
      duplicateCount: duplicate?.count ?? 0,
    }
  })
}

export function findFact(id) {
  return getDb().factEntries.find((item) => item.id === id) ?? null
}

/** 某个来源（资料或问答）已经有多少条词条 */
export function countFactsBySource(sourceId) {
  return getDb().factEntries.filter((item) => item.sourceId === sourceId).length
}

/* ---------------- 模型提炼 ---------------- */

/** 把模型返回的原始条目收敛成合法词条 */
function normalizeFactItem(raw) {
  if (!raw || typeof raw !== 'object') return null

  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, TITLE_MAX) : ''
  const content = typeof raw.content === 'string' ? raw.content.trim().slice(0, CONTENT_MAX) : ''
  if (!title || !content) return null

  return {
    category: sanitizeCategoryLabel(raw.category) || '其他',
    title,
    content,
    time: typeof raw.time === 'string' ? raw.time.trim().slice(0, TIME_MAX) : '',
  }
}

/** 归一化去重键：忽略标点与空白，避免同一件事被写两遍 */
function dedupeKey(fact) {
  return `${fact.title}|${fact.content}`.replace(/[\s\p{P}]/gu, '').toLowerCase()
}

function buildExtractPrompt() {
  const categories = listCategories()
  const categoryBlock =
    categories.length > 0
      ? categories.map((item) => `- ${item.label}`).join('\n')
      : '（还没有任何分类，请自己起 2–4 个字的分类名）'

  return `你要从资料里提炼「关于这个人的事实」，供数字分身记住并回答别人的提问。

铁律：
1. 只写资料里明确出现的，不要推测、不要补全、不要写评价。
2. 一条词条 = 一个能独立成立的事实。不要把一段话原样抄成一条。
3. title 要短（≤ 20 字），像目录上的一行：例如「一等奖」「无偿献血」「XX 大学」「家里养了两只猫」。
4. content 要具体：写清是什么、什么时候、和什么有关，尽量保留原始信息（比赛名、单位名、数字、地点）。
5. 同一件事只出现一次；资料里的口号、模板文字、表头、联系方式不提炼。
6. 资料里如果只有占位文字（例如「测试」「111」）或没有任何个人信息，返回空数组。

【分类怎么填】
下面是这个人已有的分类：
${categoryBlock}

要求：**优先从上面已有的分类里选一个原样填进去**；确实都不合适，才自己起一个新的分类名（2–4 个字，具体一点，例如「宠物」「志愿服务」「饮食习惯」）。
不要为了凑分类把两个不相干的事塞进同一类。

输出 JSON：
{"facts":[{"category":"荣誉","title":"一等奖","content":"2023 年全国大学生数学建模竞赛一等奖","time":"2023"}]}

time 填资料里能看出的时间（年份或年月即可），看不出来就填空字符串。最多输出 ${MAX_FACTS_PER_SOURCE} 条。`
}

/**
 * 让模型从一份资料的正文里提炼词条。
 * 只负责「读文本 → 结构化」，不碰数据库，方便单独重试。
 */
export async function extractFactsFromText({ text, sourceName }) {
  const body = String(text ?? '').trim().slice(0, PROMPT_BUDGET)
  if (!body) return []

  const parsed = await requestJsonCompletion({
    messages: [
      { role: 'system', content: buildExtractPrompt() },
      {
        role: 'user',
        content: `资料文件名：${sourceName || '未命名'}\n\n资料正文：\n${body}`,
      },
    ],
    maxTokens: 4000,
    temperature: 0.2,
  })
  if (!parsed) throw new Error('没能从这份资料里整理出词条，稍后可以点「重新整理」再试')

  const rawList = Array.isArray(parsed.facts) ? parsed.facts : Array.isArray(parsed) ? parsed : []
  const seen = new Set()
  const facts = []

  for (const item of rawList) {
    const fact = normalizeFactItem(item)
    if (!fact) continue
    const key = dedupeKey(fact)
    if (seen.has(key)) continue
    seen.add(key)
    facts.push(fact)
    if (facts.length >= MAX_FACTS_PER_SOURCE) break
  }

  return facts
}

/**
 * 用新提炼的结果替换某个来源的词条。
 * 只替换 origin==='ai' 的：你手动改过或自己新增的会原地保留，不会被 AI 覆盖。
 */
export async function replaceFactsForSource({
  sourceId,
  sourceName,
  facts,
  sourceType = 'material',
}) {
  const now = new Date().toISOString()
  let entries = []

  await mutateDb((db) => {
    db.factEntries = db.factEntries.filter(
      (item) => !(item.sourceId === sourceId && (item.origin ?? 'ai') === 'ai'),
    )

    entries = facts.map((fact) => ({
      id: createId('fact'),
      sourceType,
      sourceId,
      sourceName,
      categoryId: resolveCategoryId(db, fact.category),
      title: fact.title,
      content: fact.content,
      time: fact.time ?? '',
      origin: 'ai',
      createdAt: now,
      updatedAt: now,
    }))

    db.factEntries.push(...entries)
  })

  return entries
}

/**
 * 把一条已答的问题整理成词条。
 * 答题是最贴近「本人真实说法」的材料，值得单独沉淀一层。
 */
export async function extractFactsFromAnswer({ questionId, question, answer }) {
  const parsed = await requestJsonCompletion({
    messages: [
      { role: 'system', content: buildExtractPrompt() },
      {
        role: 'user',
        content: `下面是作者自己回答的一个问题（问答形式），请从中提炼事实：\n\n问：${question}\n答：${answer}`,
      },
    ],
    maxTokens: 3000,
    temperature: 0.2,
  })
  if (!parsed) throw new Error('这条回答没能整理出词条，稍后再试一次')

  const rawList = Array.isArray(parsed.facts) ? parsed.facts : Array.isArray(parsed) ? parsed : []
  const seen = new Set()
  const facts = []

  for (const item of rawList) {
    const fact = normalizeFactItem(item)
    if (!fact) continue
    const key = dedupeKey(fact)
    if (seen.has(key)) continue
    seen.add(key)
    facts.push(fact)
    if (facts.length >= MAX_FACTS_PER_ANSWER) break
  }

  return replaceFactsForSource({
    sourceId: questionId,
    sourceName: `问答：${question.slice(0, 30)}`,
    facts,
    sourceType: 'qa',
  })
}

/* ---------------- 手动增删改 ---------------- */

/** 手动新增一条词条 */
export async function createFact(input) {
  const title = typeof input?.title === 'string' ? input.title.trim().slice(0, TITLE_MAX) : ''
  const content =
    typeof input?.content === 'string' ? input.content.trim().slice(0, CONTENT_MAX) : ''
  if (!title) throw badRequest('词条标题不能为空')
  if (!content) throw badRequest('词条内容不能为空')

  const now = new Date().toISOString()
  let record = null

  await mutateDb((db) => {
    // 允许直接传分类名（前端下拉里选或手输），解析不到就建一个新的
    const categoryId = input?.categoryId
      ? (db.factCategories.find((item) => item.id === input.categoryId)?.id ??
        resolveCategoryId(db, input?.categoryLabel))
      : resolveCategoryId(db, input?.categoryLabel)

    record = {
      id: createId('fact'),
      sourceType: 'manual',
      sourceId: typeof input?.sourceId === 'string' ? input.sourceId : '',
      sourceName: typeof input?.sourceName === 'string' ? input.sourceName.slice(0, 80) : '',
      categoryId,
      title,
      content,
      time: typeof input?.time === 'string' ? input.time.trim().slice(0, TIME_MAX) : '',
      origin: 'user',
      createdAt: now,
      updatedAt: now,
    }

    db.factEntries.push(record)
  })

  return record
}

/** 编辑一条词条：改过的会被标记为 user，重新提炼时不会被覆盖 */
export async function updateFact(id, patch) {
  const record = findFact(id)
  if (!record) throw notFound('词条不存在')

  const next = {}
  if (patch?.title !== undefined) {
    const title = String(patch.title).trim().slice(0, TITLE_MAX)
    if (!title) throw badRequest('词条标题不能为空')
    next.title = title
  }
  if (patch?.content !== undefined) {
    const content = String(patch.content).trim().slice(0, CONTENT_MAX)
    if (!content) throw badRequest('词条内容不能为空')
    next.content = content
  }
  if (patch?.time !== undefined) next.time = String(patch.time).trim().slice(0, TIME_MAX)

  await mutateDb((db) => {
    const target = db.factEntries.find((item) => item.id === id)
    if (!target) return

    if (patch?.categoryId !== undefined || patch?.categoryLabel !== undefined) {
      const byId = patch?.categoryId
        ? db.factCategories.find((item) => item.id === patch.categoryId)
        : null
      target.categoryId = byId?.id ?? resolveCategoryId(db, patch?.categoryLabel)
    }

    Object.assign(target, next, { origin: 'user', updatedAt: new Date().toISOString() })
  })

  return findFact(id)
}

export async function removeFact(id) {
  const record = findFact(id)
  if (!record) throw notFound('词条不存在')

  await mutateDb((db) => {
    db.factEntries = db.factEntries.filter((item) => item.id !== id)
  })

  return record
}

/** 批量删除 / 批量改分类 */
export async function batchFacts({ ids, action, categoryId, categoryLabel }) {
  const list = Array.isArray(ids)
    ? [...new Set(ids.filter((id) => typeof id === 'string' && id))].slice(0, 200)
    : []
  if (list.length === 0) throw badRequest('没有选中任何词条')

  if (!['delete', 'move'].includes(action)) throw badRequest('不支持的批量操作')
  if (action === 'move' && !categoryId && !categoryLabel) throw badRequest('请先选一个分类')

  const wanted = new Set(list)
  let affected = 0

  await mutateDb((db) => {
    if (action === 'delete') {
      affected = db.factEntries.filter((item) => wanted.has(item.id)).length
      db.factEntries = db.factEntries.filter((item) => !wanted.has(item.id))
      return
    }

    const target = categoryId
      ? db.factCategories.find((item) => item.id === categoryId)
      : null
    const nextCategoryId = target?.id ?? resolveCategoryId(db, categoryLabel)

    for (const fact of db.factEntries) {
      if (!wanted.has(fact.id)) continue
      fact.categoryId = nextCategoryId
      fact.origin = 'user'
      fact.updatedAt = new Date().toISOString()
      affected += 1
    }
  })

  return { affected, action }
}

/** 删除某份资料/问答时级联清掉它的全部词条（含手动改过的） */
export async function removeFactsBySource(sourceId) {
  await mutateDb((db) => {
    db.factEntries = db.factEntries.filter((item) => item.sourceId !== sourceId)
  })
}

/* ---------------- 统计与摘要 ---------------- */

/** 统计：总条数 + 各分类条数 + 每份来源条数 */
export function countFacts() {
  const { factEntries } = getDb()
  const categories = listCategories()
  const byCategory = new Map()
  const bySource = new Map()

  for (const entry of factEntries) {
    byCategory.set(entry.categoryId, (byCategory.get(entry.categoryId) ?? 0) + 1)
    if (entry.sourceId) bySource.set(entry.sourceId, (bySource.get(entry.sourceId) ?? 0) + 1)
  }

  return {
    total: factEntries.length,
    byCategory: categories
      .map((item) => ({ id: item.id, label: item.label, count: byCategory.get(item.id) ?? 0 }))
      .filter((item) => item.count > 0),
    bySource: Object.fromEntries(bySource),
  }
}

/** 给对话与出题用的紧凑摘要：一行一条，省 token 又好扫 */
export function buildFactDigest({ limit = 80, sourceId } = {}) {
  const facts = listFacts({ sourceId }).slice(0, limit)
  return facts
    .map((item) => {
      const time = item.time ? `（${item.time}）` : ''
      return `- [${item.categoryLabel}] ${item.title}${time}：${item.content}`
    })
    .join('\n')
}

/* ---------------- 维护：重新归类 / 整理分类 ---------------- */

/**
 * 让模型重新判一遍现有词条的分类。
 * 用于：分类方案调整后把老数据也统一过来，或者发现分类太糊时重来一次。
 */
export async function recategorizeFacts() {
  const db = getDb()
  const facts = db.factEntries.slice(0, 200)
  if (facts.length === 0) return { updated: 0 }

  const categories = listCategories()
  const categoryBlock =
    categories.length > 0
      ? categories.map((item) => `- ${item.label}`).join('\n')
      : '（还没有分类）'

  const parsed = await requestJsonCompletion({
    messages: [
      {
        role: 'system',
        content: `给下面每条事实选一个分类。

【已有分类】
${categoryBlock}

规则：
1. 能用已有分类就用已有的（原样输出分类名）。
2. 确实都不合适才新起一个 2–4 个字的分类名。
3. 一条事实只给一个分类。
4. 原样返回 id。

输出 JSON：{"items":[{"id":"事实id","category":"分类名"}]}`,
      },
      {
        role: 'user',
        content: facts
          .map((item) => `- ${item.id}｜${item.title}｜${item.content.slice(0, 60)}`)
          .join('\n'),
      },
    ],
    maxTokens: 3000,
    temperature: 0,
  })

  const assignments = new Map()
  if (parsed && Array.isArray(parsed.items)) {
    for (const item of parsed.items) {
      if (typeof item?.id !== 'string') continue
      const label = sanitizeCategoryLabel(item?.category)
      if (label) assignments.set(item.id, label)
    }
  }
  if (assignments.size === 0) throw new Error('模型没有返回可用的分类结果，稍后再试')

  let updated = 0
  await mutateDb((state) => {
    for (const fact of state.factEntries) {
      const label = assignments.get(fact.id)
      if (!label) continue
      const nextId = resolveCategoryId(state, label)
      if (fact.categoryId === nextId) continue
      fact.categoryId = nextId
      fact.updatedAt = new Date().toISOString()
      updated += 1
    }
  })

  return { updated }
}

/**
 * 让模型把现有分类里近义的合并掉。
 * 只给建议、由后端执行合并，避免模型直接改数据。
 */
export async function tidyCategories() {
  const db = getDb()
  const categories = listCategories()
  if (categories.length < 2) return { merged: 0, detail: [] }

  const counts = countFacts().byCategory
  const parsed = await requestJsonCompletion({
    messages: [
      {
        role: 'system',
        content: `把下面这些分类里「意思重复或过于接近」的合并成一组。

规则：
1. 只有当两个分类确实在说同一件事时才合并（例如「奖励」「获奖」「奖项」）。
2. 不要为了减少数量把不同的事硬合并（「工作」和「技能」不是一回事）。
3. 每组给出保留哪个（keep）与被合并掉的（merge）。
4. 原样输出分类名。

输出 JSON：{"groups":[{"keep":"荣誉","merge":["奖励","奖项"]}]}`,
      },
      {
        role: 'user',
        content: categories
          .map((item) => {
            const count = counts.find((entry) => entry.id === item.id)?.count ?? 0
            return `- ${item.label}（${count} 条）`
          })
          .join('\n'),
      },
    ],
    maxTokens: 1200,
    temperature: 0,
  })

  const groups = Array.isArray(parsed?.groups) ? parsed.groups : []
  const applied = []

  for (const group of groups) {
    const keepLabel = sanitizeCategoryLabel(group?.keep)
    if (!keepLabel) continue
    const keep = getDb().factCategories.find((item) => isSameCategory(item.label, keepLabel))
    if (!keep) continue

    const mergeLabels = Array.isArray(group?.merge) ? group.merge : []
    for (const raw of mergeLabels) {
      const label = sanitizeCategoryLabel(raw)
      if (!label) continue
      const source = getDb().factCategories.find(
        (item) => item.id !== keep.id && isSameCategory(item.label, label),
      )
      if (!source) continue

      await mergeCategories({ fromId: source.id, toId: keep.id })
      applied.push({ from: source.label, to: keep.label })
    }
  }

  return { merged: applied.length, detail: applied }
}
