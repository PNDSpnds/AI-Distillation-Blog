import express from 'express'
import { badRequest } from '../lib/http-error.js'
import { asyncHandler } from '../middleware/errors.js'
import { uploadFields } from '../middleware/upload.js'
import {
  addSource,
  extractFacts,
  getDistillStats,
  listSources,
  removeSource,
  reparseSource,
  toPublicSource,
} from '../services/distill-sources-service.js'
import {
  batchFacts,
  countFactsBySource,
  createCategory,
  createFact,
  listCategories,
  listFacts,
  mergeCategories,
  recategorizeFacts,
  removeCategory,
  removeFact,
  renameCategory,
  tidyCategories,
  toPublicFact,
  updateFact,
} from '../services/fact-service.js'
import {
  answerQuestion,
  backfillDimensions,
  batchQuestions,
  extractQuestionFacts,
  findQuestion,
  generateQuestions,
  getProgress,
  listQuestions,
  resetQuestion,
  saveQuestionSettings,
  skipQuestion,
  toPublicQuestion,
} from '../services/distill-questions-service.js'
import {
  applyDraft,
  discardDraft,
  generateDraft,
  getPersona,
  savePersona,
} from '../services/persona-service.js'

const router = express.Router()

/* ---------------- 资料 ---------------- */

router.get(
  '/sources',
  asyncHandler(async (request, response) => {
    response.json({ items: listSources().map(toPublicSource) })
  }),
)

/** 上传资料：multipart 字段名必须是 material（见 middleware/upload.js 白名单） */
router.post(
  '/sources',
  uploadFields(),
  asyncHandler(async (request, response) => {
    const file = request.files?.material?.[0]
    if (!file) throw badRequest('没有收到文件')

    const record = await addSource(file)
    response.status(201).json({ item: toPublicSource(record) })
  }),
)

router.post(
  '/sources/:id/reparse',
  asyncHandler(async (request, response) => {
    const record = await reparseSource(request.params.id)
    response.json({ item: toPublicSource(record) })
  }),
)

/** 只重新整理词条：原文不变，重新让模型读一遍已抽取的文本 */
router.post(
  '/sources/:id/facts',
  asyncHandler(async (request, response) => {
    const record = await extractFacts(request.params.id)
    // 用箭头函数包一层：直接写 .map(toPublicFact) 会把索引进第二个参数（categories），运行时崩
    const categories = listCategories()
    const facts = listFacts({ sourceId: request.params.id }).map((fact) =>
      toPublicFact(fact, { categories }),
    )
    response.json({ item: toPublicSource(record), facts })
  }),
)

router.delete(
  '/sources/:id',
  asyncHandler(async (request, response) => {
    await removeSource(request.params.id)
    response.json({ ok: true })
  }),
)

/* ---------------- 事实词条 ---------------- */

/** 词条总列表：支持来源、分类、关键词过滤与排序 */
router.get(
  '/facts',
  asyncHandler(async (request, response) => {
    const sourceId = typeof request.query.sourceId === 'string' ? request.query.sourceId : undefined
    const categoryId =
      typeof request.query.categoryId === 'string' ? request.query.categoryId : undefined
    const query = typeof request.query.q === 'string' ? request.query.q : undefined
    const sort = request.query.sort === 'recent' ? 'recent' : 'category'

    response.json({
      items: listFacts({ sourceId, categoryId, query, sort }),
      categories: listCategories(),
    })
  }),
)

/** 手动补一条词条（AI 没提炼到的部分） */
router.post(
  '/facts',
  asyncHandler(async (request, response) => {
    const record = await createFact(request.body ?? {})
    response.status(201).json({ item: toPublicFact(record) })
  }),
)

/** 批量删除 / 批量改分类 */
router.post(
  '/facts/batch',
  asyncHandler(async (request, response) => {
    const result = await batchFacts(request.body ?? {})
    response.json(result)
  }),
)

/** 让模型重新判一遍现有词条的分类 */
router.post(
  '/facts/recategorize',
  asyncHandler(async (request, response) => {
    response.json(await recategorizeFacts())
  }),
)

router.patch(
  '/facts/:id',
  asyncHandler(async (request, response) => {
    const record = await updateFact(request.params.id, request.body ?? {})
    response.json({ item: toPublicFact(record) })
  }),
)

router.delete(
  '/facts/:id',
  asyncHandler(async (request, response) => {
    await removeFact(request.params.id)
    response.json({ ok: true })
  }),
)

/* ---------------- 词条分类 ---------------- */

router.get(
  '/categories',
  asyncHandler(async (request, response) => {
    response.json({ items: listCategories() })
  }),
)

router.post(
  '/categories',
  asyncHandler(async (request, response) => {
    response.status(201).json({ item: await createCategory(request.body?.label) })
  }),
)

router.patch(
  '/categories/:id',
  asyncHandler(async (request, response) => {
    response.json({ item: await renameCategory(request.params.id, request.body?.label) })
  }),
)

/** 合并两个分类：把 from 下的词条全部挪到 to */
router.post(
  '/categories/merge',
  asyncHandler(async (request, response) => {
    response.json(await mergeCategories(request.body ?? {}))
  }),
)

/** 让模型把近义分类合并掉 */
router.post(
  '/categories/tidy',
  asyncHandler(async (request, response) => {
    response.json(await tidyCategories())
  }),
)

router.delete(
  '/categories/:id',
  asyncHandler(async (request, response) => {
    await removeCategory(request.params.id)
    response.json({ ok: true })
  }),
)

/* ---------------- 问题 ---------------- */

router.get(
  '/questions',
  asyncHandler(async (request, response) => {
    const { status, dimension } = request.query
    const items = listQuestions({
      status: typeof status === 'string' ? status : undefined,
      dimension: typeof dimension === 'string' ? dimension : undefined,
    })
    response.json({
      items: items.map((item) => toPublicQuestion(item, { factCount: countFactsBySource(item.id) })),
      progress: getProgress(),
    })
  }),
)

/** 批量跳过 / 撤销 / 删除；删除会级联清掉问答知识与问答词条 */
router.post(
  '/questions/batch',
  asyncHandler(async (request, response) => {
    const result = await batchQuestions({
      ids: request.body?.ids,
      action: request.body?.action,
    })
    response.json({ ...result, progress: getProgress() })
  }),
)

/** 给旧题目补维度（一次模型 + 关键词兜底） */
router.post(
  '/questions/dimensions',
  asyncHandler(async (request, response) => {
    const result = await backfillDimensions()
    response.json({ ...result, progress: getProgress() })
  }),
)

/** 把某条已答题整理成词条 */
router.post(
  '/questions/:id/facts',
  asyncHandler(async (request, response) => {
    const result = await extractQuestionFacts(request.params.id)
    // 同上：必须包一层箭头函数，否则 Array.map 的索引会被当成 categories 传进去
    const categories = listCategories()
    response.json({
      item: toPublicQuestion(result.item, { factCount: result.facts.length }),
      facts: result.facts.map((fact) => toPublicFact(fact, { categories })),
      progress: getProgress(),
    })
  }),
)

router.post(
  '/questions/generate',
  asyncHandler(async (request, response) => {
    const result = await generateQuestions({ count: request.body?.count })
    response.json({ ...result, progress: getProgress() })
  }),
)

router.patch(
  '/questions/:id',
  asyncHandler(async (request, response) => {
    const { answer, skip, reset } = request.body ?? {}

    let record
    if (reset === true) record = await resetQuestion(request.params.id)
    else if (skip === true) record = await skipQuestion(request.params.id)
    else record = await answerQuestion(request.params.id, answer)

    if (!record) throw badRequest('题目不存在')
    response.json({
      item: toPublicQuestion(record, { factCount: countFactsBySource(record.id) }),
      progress: getProgress(),
    })
  }),
)

router.put(
  '/questions/settings',
  asyncHandler(async (request, response) => {
    const settings = await saveQuestionSettings(request.body ?? {})
    response.json({ settings, progress: getProgress() })
  }),
)

/* ---------------- 人设 ---------------- */

router.get(
  '/persona',
  asyncHandler(async (request, response) => {
    response.json(getPersona())
  }),
)

router.put(
  '/persona',
  asyncHandler(async (request, response) => {
    response.json(await savePersona(request.body ?? {}))
  }),
)

/** AI 生成草稿：只存草稿，不覆盖已确认的人设 */
router.post(
  '/persona/draft',
  asyncHandler(async (request, response) => {
    response.json(await generateDraft())
  }),
)

router.post(
  '/persona/draft/apply',
  asyncHandler(async (request, response) => {
    response.json(await applyDraft())
  }),
)

router.delete(
  '/persona/draft',
  asyncHandler(async (request, response) => {
    response.json(await discardDraft())
  }),
)

/* ---------------- 总览 ---------------- */

router.get(
  '/stats',
  asyncHandler(async (request, response) => {
    response.json({ ...getDistillStats(), progress: getProgress() })
  }),
)

export default router
