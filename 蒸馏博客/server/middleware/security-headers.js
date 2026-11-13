import fs from 'node:fs'

/**
 * 统一安全响应头。
 *
 * 重点在 CSP：后台是单密码 + Cookie，一旦站点里有 XSS，
 * 攻击者就能用你的登录态去改模型地址、把 Key 导走。
 * 限制脚本只能跑本站自己的文件，能堵掉绝大多数这类路径。
 */
export function securityHeaders({ enableCsp }) {
  return (request, response, next) => {
    // 禁止浏览器猜类型，避免上传的"图片"被当成脚本执行
    response.setHeader('X-Content-Type-Options', 'nosniff')
    // 不把完整 URL 带给第三方
    response.setHeader('Referrer-Policy', 'no-referrer')
    // 不允许被 iframe 嵌套，防点击劫持（后台按钮都很危险）
    response.setHeader('X-Frame-Options', 'DENY')
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    response.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')

    // 走 HTTPS 时告诉浏览器以后都用 HTTPS，防止被降级到明文。
    // 用 request.secure（受 trust proxy 约束），不手读 X-Forwarded-Proto，避免被伪造头误导
    if (request.secure) {
      response.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
    }

    if (enableCsp) {
      response.setHeader(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          // 封面图与预览用的 data:/blob: 要放行
          "img-src 'self' data: blob:",
          // Tailwind 与 React 的 style 属性需要 inline
          "style-src 'self' 'unsafe-inline'",
          "script-src 'self'",
          // SSE 与接口都是同源
          "connect-src 'self'",
          "font-src 'self' data:",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; '),
      )
    }

    next()
  }
}

/** 生产模式（存在前端构建产物）才上严格 CSP，开发模式 Vite 需要 eval 与 HMR */
export function shouldEnableCsp(webDist) {
  return fs.existsSync(`${webDist}/index.html`) && process.env.NODE_ENV !== 'development'
}
