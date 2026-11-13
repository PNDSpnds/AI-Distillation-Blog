import express from 'express'
import { getAdminPassword } from '../config.js'
import { evaluatePassword, minimumPasswordLength } from '../lib/password-policy.js'
import { asyncHandler } from '../middleware/errors.js'
import { createRateLimiter } from '../middleware/rate-limit.js'
import { changeAdminPassword } from '../services/password-service.js'
import { attemptLogin, endSession, isAuthenticated, startSession } from '../services/session.js'

const router = express.Router()

/** 改密码限流：就算密码对了也不允许一分钟连改十几次 */
const passwordLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 5,
  message: '改密码太频繁了，等一分钟再试',
})

/** 前端用来判断是否已登录；未登录也返回 200，避免控制台刷 401 报错 */
router.get('/session', (request, response) => {
  const password = evaluatePassword(getAdminPassword())
  response.json({
    authenticated: isAuthenticated(request),
    // 只告诉前端"密码够不够安全"，绝不回传密码本身
    passwordNeedsChange: !password.safe,
    passwordWarning: password.safe ? '' : password.reason,
    /** 登录页展示"至少 N 位"的提示，避免用户以为前端在乱拦 */
    minPasswordLength: minimumPasswordLength(),
  })
})

router.post(
  '/login',
  asyncHandler(async (request, response) => {
    const result = await attemptLogin(request, request.body?.password)

    if (!result.ok) {
      response.status(result.locked ? 429 : 401).json({ message: result.message })
      return
    }

    startSession(response, request)
    const password = evaluatePassword(getAdminPassword())
    response.json({
      ok: true,
      passwordNeedsChange: !password.safe,
      passwordWarning: password.safe ? '' : password.reason,
    })
  }),
)

/**
 * 在登录页直接改密码：当前密码 + 新密码。
 * 不需要已登录（忘记密码后仍要能改），但必须输对当前密码，且走登录同一套节流。
 */
router.post(
  '/password',
  passwordLimiter,
  asyncHandler(async (request, response) => {
    await changeAdminPassword(
      {
        currentPassword: request.body?.currentPassword,
        newPassword: request.body?.newPassword,
      },
      request,
    )

    // 密码变了 → 旧会话全失效；顺手给当前浏览器下发一张新票，省得再登一次
    startSession(response, request)

    const password = evaluatePassword(getAdminPassword())
    response.json({
      ok: true,
      passwordNeedsChange: !password.safe,
      passwordWarning: password.safe ? '' : password.reason,
    })
  }),
)

router.post('/logout', (request, response) => {
  endSession(response)
  response.json({ ok: true })
})

export default router
