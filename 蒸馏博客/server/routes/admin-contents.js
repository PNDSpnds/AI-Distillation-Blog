import express from 'express'
import { badRequest, notFound } from '../lib/http-error.js'
import { asyncHandler } from '../middleware/errors.js'
import { uploadFields } from '../middleware/upload.js'
import { findContent, listCategories, listContents } from '../repositories/contents.js'
import {
  createContent,
  destroyContent,
  patchContentState,
  purgeContent,
  restoreContent,
  reviseContent,
  toPublicContent,
} from '../services/content-service.js'

const router = express.Router()

/** 允许的排序方式，与前端下拉框保持一致 */
const SORT_VALUES = ['latest', 'oldest', 'title']

/** 后台列表：含未上架内容；trash=true 时只看回收站 */
router.get(
  '/',
  asyncHandler(async (request, response) => {
    const { kind, q, category, published, trash, sort } = request.query
    const onlyDeleted = trash === 'true'

    let items = listContents({
      kind: typeof kind === 'string' ? kind : undefined,
      category: typeof category === 'string' ? category : undefined,
      query: typeof q === 'string' ? q : undefined,
      includeUnpublished: true,
      onlyDeleted,
      sort: SORT_VALUES.includes(sort) ? sort : 'latest',
    })

    if (published === 'true') items = items.filter((item) => item.published)
    if (published === 'false') items = items.filter((item) => !item.published)

    response.json({
      items: items.map((record) => toPublicContent(record)),
      categories: listCategories(),
    })
  }),
)

router.get(
  '/:id',
  asyncHandler(async (request, response) => {
    const record = findContent(request.params.id)
    if (!record) throw notFound('内容不存在')
    response.json({ item: toPublicContent(record) })
  }),
)

router.post(
  '/',
  uploadFields(),
  asyncHandler(async (request, response) => {
    const record = await createContent(request.body ?? {}, request.files)
    response.status(201).json({ item: toPublicContent(record) })
  }),
)

router.put(
  '/:id',
  uploadFields(),
  asyncHandler(async (request, response) => {
    const record = await reviseContent(request.params.id, request.body ?? {}, request.files)
    response.json({ item: toPublicContent(record) })
  }),
)

/** 只改上下架 / 置顶状态，避免整表单提交 */
router.patch(
  '/:id',
  asyncHandler(async (request, response) => {
    const { published, pinned } = request.body ?? {}
    const patch = {}

    if (typeof published === 'boolean') patch.published = published
    if (typeof pinned === 'boolean') patch.pinned = pinned

    if (Object.keys(patch).length === 0) {
      throw badRequest('没有需要更新的字段')
    }

    const record = await patchContentState(request.params.id, patch)
    response.json({ item: toPublicContent(record) })
  }),
)

/** 删除 = 放进回收站，文件保留，可恢复 */
router.delete(
  '/:id',
  asyncHandler(async (request, response) => {
    await destroyContent(request.params.id)
    response.json({ ok: true })
  }),
)

/** 从回收站恢复（恢复后是未上架状态） */
router.post(
  '/:id/restore',
  asyncHandler(async (request, response) => {
    const record = await restoreContent(request.params.id)
    response.json({ item: toPublicContent(record) })
  }),
)

/** 彻底删除：记录与文件一起清掉，不可恢复 */
router.delete(
  '/:id/purge',
  asyncHandler(async (request, response) => {
    await purgeContent(request.params.id)
    response.json({ ok: true })
  }),
)

export default router
