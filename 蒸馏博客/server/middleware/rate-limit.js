/** 简单的内存限流：按 IP 做滑动窗口计数，够个人站使用 */
export function createRateLimiter({ windowMs = 60_000, max = 10, message = '问得太快了，歇一会儿再问' } = {}) {
  const hits = new Map()

  return (request, response, next) => {
    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown'
    const now = Date.now()
    const record = hits.get(ip)

    if (!record || now - record.start > windowMs) {
      hits.set(ip, { start: now, count: 1 })
      next()
      return
    }

    record.count += 1
    if (record.count > max) {
      response.status(429).json({ message })
      return
    }

    next()
  }
}
