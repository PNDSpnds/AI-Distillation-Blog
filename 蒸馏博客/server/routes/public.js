import express from 'express'
import { badRequest, notFound } from '../lib/http-error.js'
import { asyncHandler } from '../middleware/errors.js'
import { findContent, listContents } from '../repositories/contents.js'
import { toPublicContent } from '../services/content-service.js'
import { getPublicProfile } from '../services/settings-service.js'
import { toAbsolutePath } from '../storage/local-storage.js'

const router = express.Router()

router.get('/health', (request, response) => {
  response.json({ ok: true, time: new Date().toISOString() })
})

/** 站点信息：开场白、推荐问题、页脚等 */
router.get('/profile', (request, response) => {
  response.json(getPublicProfile())
})

/** 公开内容列表：只返回已上架内容 */
router.get(
  '/contents',
  asyncHandler(async (request, response) => {
    const { kind, q, category, limit } = request.query
    const max = Math.min(Number.parseInt(limit ?? '20', 10) || 20, 100)

    const items = listContents({
      kind: typeof kind === 'string' ? kind : undefined,
      category: typeof category === 'string' ? category : undefined,
      query: typeof q === 'string' ? q : undefined,
    }).slice(0, max)

    response.json({ items: items.map(toPublicContent) })
  }),
)

router.get(
  '/contents/:id',
  asyncHandler(async (request, response) => {
    const record = findContent(request.params.id)
    if (!record || !record.published || record.deletedAt) throw notFound('内容不存在或已下架')
    response.json({ item: toPublicContent(record) })
  }),
)

/** 下载附件：始终用上传时的原始文件名，浏览器体验更自然 */
router.get(
  '/download/:id',
  asyncHandler(async (request, response) => {
    const record = findContent(request.params.id)
    // 未上架或已删除的内容不能被公开下载：这是内容边界，不是可用性取舍
    if (!record || !record.published || record.deletedAt || !record.filePath) {
      throw notFound('这个内容没有可下载的文件')
    }

    let absolutePath
    try {
      absolutePath = toAbsolutePath(record.filePath)
    } catch {
      throw badRequest('文件路径异常')
    }

    response.download(absolutePath, record.fileName || undefined)
  }),
)

export default router
