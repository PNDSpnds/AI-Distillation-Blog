import express from 'express'
import { asyncHandler } from '../middleware/errors.js'
import { cleanOrphanFiles, listOrphanFiles } from '../services/storage-audit.js'

const router = express.Router()

/** 文件体检：列出没人引用的上传文件 */
router.get(
  '/orphans',
  asyncHandler(async (request, response) => {
    response.json({ items: listOrphanFiles() })
  }),
)

/** 清理孤儿文件 */
router.post(
  '/orphans/clean',
  asyncHandler(async (request, response) => {
    const removed = await cleanOrphanFiles()
    response.json({ removed: removed.length, items: removed })
  }),
)

export default router
