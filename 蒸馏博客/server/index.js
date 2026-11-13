import express from 'express'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import {
  BIND_HOST,
  COVER_DIR,
  PORT,
  ROOT_DIR,
  WEB_DIST,
  ensureDataDirs,
  getAdminPassword,
} from './config.js'
import { evaluatePassword } from './lib/password-policy.js'
import { describeTls, loadTlsOptions } from './lib/tls.js'
import { apiNotFound, errorHandler } from './middleware/errors.js'
import { securityHeaders, shouldEnableCsp } from './middleware/security-headers.js'
import adminBackupRoutes from './routes/admin-backups.js'
import adminContentRoutes from './routes/admin-contents.js'
import adminDistillRoutes from './routes/admin-distill.js'
import adminMaintenanceRoutes from './routes/admin-maintenance.js'
import adminSettingsRoutes from './routes/admin-settings.js'
import authRoutes from './routes/auth.js'
import chatRoutes from './routes/chat.js'
import publicRoutes from './routes/public.js'
import { getDb } from './repositories/db.js'
import { requireAuth } from './services/session.js'
import { getKeyStorageWarning, getLlmKey } from './services/secret-store.js'
import { resumePendingFactJobs } from './services/distill-sources-service.js'
import { runFactMigration } from './services/fact-migration.js'
import { reportOrphanFiles } from './services/storage-audit.js'

ensureDataDirs()
// 启动时就把 Key 读进内存：顺带完成「.env 明文 → 加密存储」的迁移
getLlmKey()
// 旧版本的词条分类 key（award/experience…）迁到新的分类表，幂等
await runFactMigration()
// 上次退出时没跑完的词条整理，重启后接着跑
const resumed = resumePendingFactJobs()
if (resumed > 0) console.log(`[distill] 续跑 ${resumed} 份资料的词条整理`)
// 查一遍有没有"内容删了、附件还在"的孤儿文件（只提示，不自动删）
reportOrphanFiles()

const app = express()
// 只信任本机/内网代理，保证限流拿到的 IP 不会被随意伪造
app.set('trust proxy', 'loopback')
app.disable('x-powered-by')

app.use(securityHeaders({ enableCsp: shouldEnableCsp(WEB_DIST) }))
app.use(express.json({ limit: '1mb' }))

/** 封面是公开资源，直接静态托管；附件只走下载接口，避免被枚举 */
app.use(
  '/media/covers',
  express.static(COVER_DIR, { index: false, maxAge: '7d', fallthrough: true }),
)

app.use('/api', publicRoutes)
app.use('/api', chatRoutes)

// 后台接口：登录相关放在鉴权之前，其余统一要求登录
app.use('/api/admin', authRoutes)
app.use('/api/admin/contents', requireAuth, adminContentRoutes)
app.use('/api/admin/settings', requireAuth, adminSettingsRoutes)
app.use('/api/admin/backups', requireAuth, adminBackupRoutes)
app.use('/api/admin/distill', requireAuth, adminDistillRoutes)
app.use('/api/admin/maintenance', requireAuth, adminMaintenanceRoutes)

app.use('/api', apiNotFound)

// 前端构建产物：存在就托管，并做 SPA 回退；不存在时给出明确提示
if (fs.existsSync(path.join(WEB_DIST, 'index.html'))) {
  const indexHtmlPath = path.join(WEB_DIST, 'index.html')
  // 模板按 mtime 缓存：重新构建后文件名带新哈希，这里必须跟着换，否则页面会引到已删除的旧资源
  let templateCache = { mtime: -1, html: '' }

  const loadIndexTemplate = () => {
    const { mtimeMs } = fs.statSync(indexHtmlPath)
    if (mtimeMs !== templateCache.mtime) {
      templateCache = { mtime: mtimeMs, html: fs.readFileSync(indexHtmlPath, 'utf8') }
    }
    return templateCache.html
  }

  const escapeHtml = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

  /**
   * 把站点信息注入 index.html。
   *
   * 这里做两件事，都是为了"第一帧就是对的"：
   * 1. 标题与 og 摘要写进源码——爬虫（微信、推特、Slack）不执行 JS，只能读到这里；
   * 2. 把完整的站点信息序列化进 <script type="application/json">，前端首帧直接用它渲染。
   *    否则前端只能先用本地演示数据画一帧，等 /api/profile 回来再替换，
   *    表现出来就是"刷新时先闪一下旧文案"。
   */
  const renderIndexHtml = (request) => {
    const { settings, contents } = getDb()
    const siteNameText = settings.siteName || '对话式博客'

    // 每个路由给一个正确标题，避免浏览器标签页在 JS 执行后再跳一次
    const requestPath = request.path || '/'
    let pageTitle = siteNameText
    if (requestPath === '/') {
      pageTitle = `${siteNameText} · 对话主页`
    } else if (requestPath.startsWith('/contents')) {
      pageTitle = `内容 · ${siteNameText}`
    } else if (requestPath.startsWith('/admin')) {
      pageTitle = `${siteNameText} · 后台`
    } else if (requestPath.startsWith('/p/')) {
      const id = requestPath.slice(3)
      const record = contents.find((item) => item.id === id)
      if (record && record.published && !record.deletedAt) {
        pageTitle = `${record.title} · ${siteNameText}`
      }
    }

    const siteName = escapeHtml(siteNameText)
    const description = escapeHtml(
      String(settings.intro || settings.greeting || '一个可以用对话访问的个人博客。')
        .replace(/\s+/g, ' ')
        .slice(0, 120),
    )
    const origin = `${request.protocol}://${request.get('host') ?? 'localhost:8787'}`

    // 前端首帧要用的数据。`<` 一律转成 \u003c，避免站点名里写了 </script> 把页面截断
    const bootProfile = JSON.stringify({
      siteName: siteNameText,
      ownerName: settings.ownerName || '',
      greeting: settings.greeting || '',
      intro: settings.intro || '',
      suggestions: (settings.suggestions ?? []).slice(0, 6),
      footer: settings.footer || '',
    }).replace(/</g, '\\u003c')

    return loadIndexTemplate()
      .replaceAll('__SITE_NAME__', siteName)
      .replaceAll('__PAGE_TITLE__', escapeHtml(pageTitle))
      .replaceAll('__SITE_DESC__', description)
      .replaceAll('__SITE_URL__', escapeHtml(`${origin}${request.originalUrl}`))
      .replaceAll('__SITE_PROFILE__', bootProfile)
  }

  app.use(
    express.static(WEB_DIST, {
      // index.html 交给下面的回退逻辑处理（需要注入站点信息），这里不直接吐
      index: false,
      // 带哈希的静态资源可以长缓存，index.html 不能缓存
      setHeaders(response, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
      },
    }),
  )

  app.get('*', (request, response) => {
    response.setHeader('Cache-Control', 'no-cache')
    response.type('html').send(renderIndexHtml(request))
  })
} else {
  app.get('*', (request, response) => {
    response
      .status(503)
      .type('html')
      .send(
        `<!doctype html><meta charset="utf-8"><title>前端未构建</title>
         <body style="font-family:system-ui;padding:40px;line-height:1.8">
         <h1>还没有前端构建产物</h1>
         <p>请在项目根目录双击 <code>start.bat</code>，或手动执行：</p>
         <pre>cd web
npm install
npm run build</pre>
         <p>完成后刷新本页。</p></body>`,
      )
  })
}

app.use(errorHandler)

/**
 * 有证书就用 HTTPS，没有就退回 HTTP。
 * 这就是"对外开放"的推荐形态：Node 自己终结 TLS，隧道/反代只做 TCP 透传，
 * 密码、Cookie、保存 Key 的请求体全程加密，不需要额外装 Caddy/Nginx。
 */
const tls = loadTlsOptions()
const server = tls ? https.createServer(tls, app) : http.createServer(app)

server.listen(PORT, BIND_HOST, () => {
  const scheme = tls ? 'https' : 'http'
  const address = `${scheme}://${BIND_HOST === '0.0.0.0' ? 'localhost' : BIND_HOST}:${PORT}`
  console.log('')
  console.log('  对话式博客服务已启动')
  console.log(`  监听：${BIND_HOST}:${PORT}（${scheme.toUpperCase()}）`)
  console.log(`  主页：${address}/`)
  console.log(`  后台：${address}/admin`)
  console.log(`  数据目录：${path.join(ROOT_DIR, 'data')}`)

  for (const line of describeTls(tls?.info)) console.log(line)

  if (!tls) {
    console.log('  提示：没有找到证书，当前是 HTTP。要对外提供 HTTPS，把 fullchain.pem + privkey.pem 放进 data/certs/')
  }

  if (BIND_HOST !== '127.0.0.1' && BIND_HOST !== 'localhost' && BIND_HOST !== '::1') {
    console.warn('')
    console.warn(`  [!] 正在监听 ${BIND_HOST}，局域网/公网可能都能访问`)
    if (tls) {
      console.warn('  [!] 已启用 HTTPS，可以对外；但请确认只放行需要的端口')
    } else {
      console.warn('  [!] 目前是 HTTP，外网访问会明文传输密码与 Cookie，不要这样对外开放')
    }
    console.warn('  [!] 只在本机用的话，把 .env 里的 BIND_HOST 删掉（默认 127.0.0.1）')
  }

  const passwordState = evaluatePassword(getAdminPassword())
  if (!passwordState.safe) {
    console.warn('')
    console.warn(`  [!] 后台密码不够安全：${passwordState.reason}`)
    console.warn('  [!] 请修改 .env 里的 ADMIN_PASSWORD（至少 12 位，字母+数字混合）')
    console.warn('  [!] 未改密码前，后台不允许修改模型 Key 与模型地址')
  }

  const keyWarning = getKeyStorageWarning()
  if (keyWarning) {
    console.warn('')
    console.warn(`  [!] ${keyWarning}`)
  }

  console.log('')
})

// Ctrl+C 时优雅退出，避免写入中断
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\n正在关闭服务…')
    server.close(() => process.exit(0))
    // 兜底：3 秒内没关干净就强制退出
    setTimeout(() => process.exit(0), 3000).unref()
  })
}
