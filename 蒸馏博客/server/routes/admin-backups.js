import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { BACKUP_DIR } from '../config.js'
import { badRequest, notFound } from '../lib/http-error.js'
import { asyncHandler } from '../middleware/errors.js'

const router = express.Router()

/** 只允许下载脚本自己生成的备份文件名，防止路径穿越 */
const BACKUP_NAME = /^db-[0-9TZ\-:.]+\.json$/

/** 备份列表：按时间倒序，带上大小，方便在后台判断要不要下载 */
router.get(
  '/',
  asyncHandler(async (request, response) => {
    if (!fs.existsSync(BACKUP_DIR)) {
      response.json({ items: [] })
      return
    }

    const items = fs
      .readdirSync(BACKUP_DIR)
      .filter((name) => BACKUP_NAME.test(name))
      .map((name) => {
        const stat = fs.statSync(path.join(BACKUP_DIR, name))
        return { name, size: stat.size, createdAt: stat.mtime.toISOString() }
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 30)

    response.json({ items })
  }),
)

router.get(
  '/:name',
  asyncHandler(async (request, response) => {
    const { name } = request.params
    if (!BACKUP_NAME.test(name)) throw badRequest('备份文件名不合法')

    const filePath = path.join(BACKUP_DIR, name)
    if (!fs.existsSync(filePath)) throw notFound('备份不存在')

    response.download(filePath, name)
  }),
)

export default router
