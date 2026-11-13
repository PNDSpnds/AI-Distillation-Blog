import express from 'express'
import { asyncHandler } from '../middleware/errors.js'
import { createRateLimiter } from '../middleware/rate-limit.js'
import { badRequest } from '../lib/http-error.js'
import { normalizeMessages, runChat } from '../services/chat-service.js'
import { resolveLlmConfig } from '../services/llm-service.js'
import { takeDailyQuota } from '../services/quota-service.js'

const router = express.Router()

const chatLimiter = createRateLimiter({ windowMs: 60_000, max: 10 })

/**
 * 对话接口。
 * 用 SSE 逐字返回，错误也走 SSE，保证前端只有一套解析逻辑。
 */
router.post(
  '/chat',
  chatLimiter,
  asyncHandler(async (request, response) => {
    const messages = normalizeMessages(request.body?.messages)
    if (messages.length === 0) throw badRequest('缺少消息内容')
    if (messages[messages.length - 1].role !== 'user') throw badRequest('最后一条消息必须来自访客')

    // 额度在开流之前判断：用完了直接 429，不浪费一次上游调用
    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown'
    takeDailyQuota(ip)

    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // 反向代理（如 nginx）下关闭缓冲，否则流式会被攒成一个包
      'X-Accel-Buffering': 'no',
    })

    const send = (payload) => {
      if (response.writableEnded) return
      response.write(`data: ${JSON.stringify(payload)}\n\n`)
    }

    const controller = new AbortController()
    // 访客真正断开连接时才停止调用模型，避免白花钱。
    // 注意必须监听 response：request 的 close 在请求体读完后就会触发，会把调用当场掐断。
    response.on('close', () => {
      if (!response.writableFinished) controller.abort()
    })

    try {
      const config = resolveLlmConfig()
      if (!config.configured) {
        send({ type: 'error', message: '还没有配置模型 API Key，请到后台「设置 → 模型服务」填写' })
        send({ type: 'done' })
        response.end()
        return
      }

      await runChat({ messages, send, signal: controller.signal })
    } catch (error) {
      if (controller.signal.aborted) {
        // 用户主动停止，不算错误
      } else {
        console.error('[chat] 生成失败：', error.message)
        send({ type: 'error', message: error.message || '模型没有返回结果，请稍后再试' })
        send({ type: 'done' })
      }
    } finally {
      if (!response.writableEnded) response.end()
    }
  }),
)

/** 前端可用来显示“当前用的哪个模型”；不暴露服务地址，避免泄漏内网/私有网关信息 */
router.get('/chat/status', (request, response) => {
  const config = resolveLlmConfig()
  response.json({
    configured: config.configured,
    model: config.model,
  })
})

export default router
