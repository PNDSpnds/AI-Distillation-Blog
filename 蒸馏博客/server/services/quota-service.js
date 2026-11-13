import { HttpError } from '../lib/http-error.js'

/**
 * 每日额度保护。
 *
 * 为什么需要：模型调用按量计费，单靠「每分钟 10 次」挡不住慢速刷量——
 * 一天 1440 分钟，跑满就是 14400 次。公网一上线，额度就是真金白银。
 *
 * 两道上限：
 * - 全站每日总量（默认 800，可用 DAILY_CHAT_LIMIT 覆盖）
 * - 单 IP 每日上限（默认 120，可用 DAILY_CHAT_IP_LIMIT 覆盖）
 */
const DAY_MS = 24 * 60 * 60 * 1000

function toLimit(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const TOTAL_LIMIT = toLimit(process.env.DAILY_CHAT_LIMIT, 800)
const IP_LIMIT = toLimit(process.env.DAILY_CHAT_IP_LIMIT, 120)
/**
 * 后台 AI 调用（词条整理、出题、人设草稿、重新归类…）的每日上限。
 * 这些接口只有管理员能点，但一旦后台失守，它们就是刷爆 Key 余额的入口，
 * 所以单独给一个预算，不和访客额度混在一起。
 */
const ADMIN_LIMIT = toLimit(process.env.DAILY_ADMIN_AI_LIMIT, 400)

let windowStart = Date.now()
let totalCount = 0
let adminCount = 0
const ipCounts = new Map()

function rolloverIfNeeded(now) {
  if (now - windowStart < DAY_MS) return
  windowStart = now
  totalCount = 0
  adminCount = 0
  ipCounts.clear()
}

/** 记录一次调用；超出上限则抛 429 */
export function takeDailyQuota(ip) {
  const now = Date.now()
  rolloverIfNeeded(now)

  if (totalCount >= TOTAL_LIMIT) {
    throw new HttpError(429, '今天的对话额度用完了，明天再来吧')
  }

  const key = ip || 'unknown'
  const used = ipCounts.get(key) ?? 0
  if (used >= IP_LIMIT) {
    throw new HttpError(429, '今天问得有点多了，明天再来吧')
  }

  totalCount += 1
  ipCounts.set(key, used + 1)
  return { total: totalCount, totalLimit: TOTAL_LIMIT, ipUsed: used + 1, ipLimit: IP_LIMIT }
}

/** 给后台看的当前用量 */
export function getDailyQuota() {
  rolloverIfNeeded(Date.now())
  return { used: totalCount, limit: TOTAL_LIMIT, perIpLimit: IP_LIMIT, adminUsed: adminCount, adminLimit: ADMIN_LIMIT }
}

/**
 * 后台 AI 调用的每日预算。
 * 所有走 requestChatCompletion / requestJsonCompletion 的蒸馏动作都会先过这里。
 */
export function takeAdminAiQuota() {
  const now = Date.now()
  rolloverIfNeeded(now)

  if (adminCount >= ADMIN_LIMIT) {
    throw new HttpError(
      429,
      `今天的后台 AI 调用额度用完了（上限 ${ADMIN_LIMIT} 次），明天再来，或调整 .env 的 DAILY_ADMIN_AI_LIMIT`,
    )
  }

  adminCount += 1
  return { adminUsed: adminCount, adminLimit: ADMIN_LIMIT }
}
