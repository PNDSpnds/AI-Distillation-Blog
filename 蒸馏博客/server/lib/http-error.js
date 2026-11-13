/** 带状态码的业务错误，路由里 throw 后由统一错误中间件转成 JSON */
export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

export const badRequest = (message) => new HttpError(400, message)
export const unauthorized = (message = '请先登录') => new HttpError(401, message)
export const forbidden = (message = '没有权限做这件事') => new HttpError(403, message)
export const notFound = (message = '请求的内容不存在') => new HttpError(404, message)
export const tooLarge = (message) => new HttpError(413, message)
