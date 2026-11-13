/** 包一层 async 路由，异常自动交给 Express 错误中间件 */
export function asyncHandler(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next)
  }
}

/** 统一错误输出；4xx 原样返回，5xx 隐藏细节只留日志 */
export function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    next(error)
    return
  }

  const status = Number.isInteger(error?.status) ? error.status : 500

  if (status >= 500) {
    console.error(`[error] ${request.method} ${request.originalUrl}：`, error)
  }

  response.status(status).json({
    message: status >= 500 ? '服务器开小差了，稍后再试' : error.message,
  })
}

/** 未匹配的接口统一返回 JSON，而不是 Express 默认 HTML */
export function apiNotFound(request, response) {
  response.status(404).json({ message: '接口不存在' })
}
