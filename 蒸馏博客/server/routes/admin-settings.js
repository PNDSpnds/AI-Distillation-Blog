import express from 'express'
import { asyncHandler } from '../middleware/errors.js'
import { getAdminSettings, saveSettings } from '../services/settings-service.js'

const router = express.Router()

router.get(
  '/',
  asyncHandler(async (request, response) => {
    response.json(getAdminSettings())
  }),
)

router.put(
  '/',
  asyncHandler(async (request, response) => {
    const settings = await saveSettings(request.body ?? {}, {
      ip: request.ip ?? request.socket?.remoteAddress ?? '',
      // 二次确认密码要复用登录那套节流，所以把整个 request 传下去
      request,
    })
    response.json(settings)
  }),
)

export default router
