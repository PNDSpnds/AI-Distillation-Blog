# 交接文档 · 对话式博客

> 这份文档是给**接手这个项目的 AI / 开发者**看的。
> 目标：读完这一份，就能在没有原开发者在场的情况下理解整个代码、安全地改代码、并把它部署到 Linux 服务器上。
>
> 配套文档：`TECHNICAL.md`（1450+ 行，技术细节的权威来源）。本文负责"全局视角 + 交接上下文"，两者冲突时以代码为准。
>
> 当前版本：**v1.3.3** ｜ 最后更新：2026-11-12

---

## 0. 给接手的 AI：按这个顺序读

1. 本文 §1–§2：搞清"这是什么、用户到底要什么"。**第 2 节是需求真相，比任何代码注释都重要。**
2. 本文 §4：代码地图，知道该去哪个文件改。
3. 本文 §9：改代码的硬规则。**违反会直接破坏项目（有真实事故记录）。**
4. 真要动某块逻辑时，再去 `TECHNICAL.md` 查对应章节（§6 数据设计、§7 接口、§11 决策记录 D1–D50）。

**动手前的三条铁律：**

- 用户的数据在 `data/` 里（1 份资料、31 条词条、9 个分类、25 道题、0 条内容），**没有明确要求不要删改**。
- 改任何后端返回字段，必须同步 `web/src/types/*.ts` 与 `web/src/lib/api.ts`，否则前端静默拿不到值。
- 每次改完：`npm run lint` → `npm run build` → 在 `TECHNICAL.md` §10 加一条变更记录（改了什么 / 达到什么目的 / 为什么改）。

---

## 1. 这是什么

一个**个人对话式博客**：访客打开首页看到的不是文章列表，而是一个 ChatGPT 风格的对话框。AI 以作者"蒸馏后的口吻"回答，聊到作品时会弹出真实的内容卡片（可下载 / 可外链 / 可看站内详情）。

作者在后台做三件事：

1. **蒸馏自己**：上传简历/奖状/文档 → AI 提炼成一条条「事实词条」→ 按 12 个维度出题（目标 1000 题）→ 答题 → 生成「人设卡」。
2. **上传内容**：统一表单，字段随类型（文章/程序/视频/音乐/图片/其他）变化。
3. **管理内容**：改、删（进回收站）、批量、排序、备份。

**长期意图**：这套代码将来要作为"招牌/模板"演进成面向多用户的平台。所以模块边界要清晰、不要写死单人假设在业务层（配置层写死没问题）。

技术形态：**前后端同仓、单进程部署**。Express 静态托管 Vite 构建产物，一个 Node 进程同时提供 API 和页面。

---

## 2. 需求真相（用户原话 + 演变）

这一节是整份文档最有价值的部分。**用户多次纠正过方向，只看代码会误判"为什么这么设计"。**

### 2.1 最初定的 5 条（后续所有工作的基准）

1. **首页要像 ChatGPT 网页版**，主体是对话框。侧边栏内容待定。
2. **必须有个人后台**，侧边栏切换：
   - 蒸馏页：可上传各种文件进一步蒸馏；问题蒸馏要**显示进度**，用户可随时答几题或停下，**必须自动保留进度**（不可能每次重来 1000 题）。
   - 通用内容上传页：展示图、名字、简介、跳转链接、下载链接、内容、类别等；**上传窗口统一，字段随实际填写内容变化**（传程序就填下载链接，传文章就填正文）。
   - 已上传内容可查看、删除、修改。
3. **核心使用场景**：打开网页 → 聊天框 → AI 用蒸馏后的口吻简短自介 → 输入框下方有推荐问题 → 问"最近在做什么"要回答最近上传的东西并附卡片 → 点卡片按填写情况**跳转或下载**。
4. **简约大气、统一配色、动画流畅不硬切换**；**中文注释**；**模块化**（"不希望一动就动特别的东西"）。
5. 先别写代码，先对齐需求。

### 2.2 之后的追加与纠正（按时间）

| # | 用户要求 | 落成了什么 |
|---|---|---|
| 1 | 「新建技术文档，以后改一次就在技术文档里更新改了什么、达到什么目的、为什么要改」 | `TECHNICAL.md` §10 变更记录成为强制流程 |
| 2 | 「合并成一个吧」（指两个启动脚本） | 只留 `start.bat`，`start.bat dev` 走开发模式 |
| 3 | 「后台为什么没有填 key 的地方」+ DeepSeek 默认地址与模型 | 设置页可填 Key；默认 `https://api.deepseek.com` + `deepseek-flash` |
| 4 | 「上传了项目，问你好很明显没接入 AI，用第一性原则解决」 | 补 `retrieval/llm/chat` 服务与 `POST /api/chat` SSE；修掉 `req.on('close')` 导致调用被掐断的真 bug |
| 5 | 「先别急着做下一阶段，先打磨 M1」 | 21 项打磨全部完成（下载校验、封面前后校验、回收站、概览、批量、排序、备份下载、站内详情页…） |
| 6 | 「没让你操作，我说开始做 M2 再做」 | 确认"先讨论、后动手"的协作方式 |
| 7 | 「不要三句不理我自己的项目；问你好就正常问好，问好不要链接最新项目」 | 新增 `detectIntent`（greeting/self/general），寒暄不再注入项目 |
| 8 | 「后期蒸馏后按性格习惯语气回复」 | 人设卡注入 system prompt 最前面 |
| 9 | 「新加的数据库备份是个啥」 | 说明：每次写 `db.json` 前的自动快照，保留 20 份，可下载 |
| 10 | 「蒸馏上传了文件，但问奖项答不出；问题全是代码相关，应该全面蒸馏；已上传资料要清晰显示整理出哪些词条，可单独删改」 | **M2.1 词条层**：AI 提炼事实词条 + 检索修复（单字 token + 15 组同义词）+ 12 维度出题 + 资料页展示词条 |
| 11 | 「词条应该单拎出来一个页面，与资料/答题/人设卡同级；所有来源的词条都汇总到这里，可分类、搜索、选择」 | v1.1.0：词条独立成页 + AI 自动起名分类 + 可改名/合并/重新归类 |
| 12 | 「AI 完全可以回答一些用户没上传过的客观问题，不涉及个人的主观问题没问题」 | v1.2.0：按"问的是谁的事"四类分流，常识问题直接答，回答下方小字标注「本回复含 AI 常识补充，非本人经历」（v1.3.4 起；原先写的是"使用 AI 常识回答"，会让人以为整条回答都不是本人事实） |
| 13 | 「.env 和 .env.example 为什么分开」 | 解释分工；顺手发现模板里写着真实密码，已改为无秘密模板 |
| 14 | 「密码我改了但是为什么没有生效」 | 查出三层原因（没保存 / 需重启 / 旧 Cookie 与密码无关）；改为**保存即生效 + 改密码让旧会话全失效** |
| 15 | 「检查一下有没有需要打磨的地方」 | 出清单 A/B/C/D 四组；用户选择逐项处理 |
| 16 | 「别一个一个改，全问完一起改」 | 一次性确认 10 项后批量实施 |
| 17 | 「密码限制最低 6 位就行，用我指定的那个」 | 最短长度改为可配（`MIN_ADMIN_PASSWORD_LENGTH`，默认仍 12），本机设 6。**用户明确接受抗爆破强度下降** |
| 18 | 「登录页也能改密码，输入一次正确的 + 两次新密码」 | v1.2.8：`POST /api/admin/password` + 登录页「修改密码」模式 |
| 19 | 「从别的地方登录用 https 反向代理是什么意思 / 不配置会怎样」 | 解释了反代与 HTTPS 必要性；顺带发现并修掉"伪造 `X-Forwarded-Proto` 可绕过强制 HTTPS"的真实漏洞（v1.2.9） |
| 20 | 「整理成一份文档，我要换到服务器部署，出问题会在服务器上改」 | **就是本文档** |

### 2.3 仍然有效的产品约束（改代码前先确认没违背）

- 首页 = 对话框，不是文章列表。内容卡片必须能"下载 / 外链 / 站内详情"三种动作。
- 蒸馏进度必须持久（服务端存 `db.json`，不依赖浏览器）。
- 上传窗口统一，字段按类型动态变化。
- 中文注释、模块化、动画不用硬切换。
- 回答不许"三句不离项目"；问好就正常问好；客观常识可以答，但要标注。
- 隐私：回答的「依据」区**只显示标题，不显示内容**（问答答案里有家人/收入/健康等信息，页面是公开的）。

---

## 3. 技术栈与环境

| 层 | 选型 | 说明 |
|---|---|---|
| 前端 | React 19 + Vite 8 + Tailwind v4 + react-router-dom 7 + lucide-react | 无状态库、无 UI 框架，样式全在 class 里 |
| 后端 | Node + Express 4（ESM） | 单进程，`server/index.js` 是入口 |
| 存储 | **纯 JSON 文件**（`data/db.json`）+ 本地文件目录 | 不引数据库（用户明确要求） |
| 文档解析 | `pdf-parse` v2、`mammoth`（docx） | txt/md 直接读；图片只记文件名（无 OCR） |
| 上传 | `multer` | 扩展名白名单 + 大小上限 + 随机文件名 |
| 校验/构建 | TypeScript 7（仅类型）+ oxlint | `npm run lint` 必须 0 警告 |
| 部署 | 单机 Node + 反向代理（Caddy/Nginx） | 默认只听 `127.0.0.1` |

**本地验证过的环境**：Windows 11、Node v24.21.0、npm 11.19.0。
**服务器建议**：Node 20/22 LTS（未验证 <20）。`pdf-parse` 会装 `@napi-rs/canvas`（有预编译二进制，Linux x64 glibc 正常；Alpine 需 musl 版本）。

---

## 4. 代码地图

```
聊天/
├─ package.json              # 根脚本：install:all / build / start / lint
├─ start.bat                 # Windows 一键启动（dev 参数=开发模式）
├─ .env / .env.example       # 真实配置 / 无秘密模板
├─ TECHNICAL.md              # 技术细节权威文档（§10 变更记录、§11 ADR D1–D50）
├─ HANDOFF.md                # 本文档
├─ SPEC.md                   # 早期需求稿，**已作废，仅历史参考**
├─ scripts/snapshot.ps1      # 打版本 zip；默认只打源码，-IncludeData 才连 data/ 一起打（始终排除 .env）
├─ data/                     # 运行时数据（不进包）
│  ├─ db.json                # 唯一的数据库
│  ├─ .session-secret        # 自动生成的会话签名 + Key 加密主密钥
│  ├─ secrets/llm-key.enc    # 模型 Key（AES-256-GCM，绑机器）
│  ├─ uploads/{covers,files,distill}
│  ├─ backups/               # db.json 自动快照，保留 20 份
│  └─ logs/security.log      # 安全审计（1MB 轮转）
├─ server/
│  ├─ index.js               # 入口：启动自检 → 中间件 → 路由 → 静态托管 + SPA 回退
│  ├─ config.js              # 读 .env、路径常量、密码读取与写回、BIND_HOST
│  ├─ lib/                   # 纯函数工具，无业务状态
│  │  ├─ env.js              # .env 解析 / 写回 / 掩码
│  │  ├─ atomic-json.js      # 原子写 + 备份轮转（先写临时文件再改名）
│  │  ├─ auth.js             # HMAC token（含会话代次）、恒定时间比较、派生密钥
│  │  ├─ password-policy.js  # 密码强度判定 + 随机强密码生成
│  │  ├─ secret-box.js       # AES-256-GCM 封装（机器指纹派生密钥）
│  │  ├─ url-guard.js        # 模型地址校验：协议 / 私网 / HTTPS / DNS 复核
│  │  ├─ security-log.js     # 审计日志（不记密码与 Key）
│  │  ├─ persona.js          # 人设结构与转提示词
│  │  ├─ question-dimensions.js # 12 个蒸馏维度 + 每批选维度
│  │  ├─ content-kinds.js    # 内容类型、上传白名单、图片头签名校验
│  │  ├─ fact-categories.js  # 分类标签归一（去重、合并判断）
│  │  ├─ ids.js / http-error.js
│  ├─ repositories/
│  │  ├─ db.js               # 内存缓存 + mutateDb 持久化 + 默认结构 + 缺键补全
│  │  └─ contents.js         # 内容 CRUD / 分类统计
│  ├─ services/              # 业务逻辑都在这里（路由只做参数校验与转发）
│  │  ├─ session.js          # 登录、Cookie、限流退避、鉴权中间件、会话代次
│  │  ├─ password-service.js # 登录页改密码（含回读校验与回滚）
│  │  ├─ settings-service.js # 站点设置、模型配置闸门、二次确认
│  │  ├─ secret-store.js     # Key 加密存取 + 从 .env 迁移
│  │  ├─ llm-service.js      # OpenAI 兼容调用（流式/JSON），每次校验地址
│  │  ├─ chat-service.js     # 提示词拼装、META 切分、卡片与依据兜底 → runChat
│  │  ├─ retrieval-service.js# 中文检索：单字 + 同义词扩展，三路（词条/原文/内容）
│  │  ├─ fact-service.js     # 词条 + 分类的全部业务（体量最大，24KB）
│  │  ├─ knowledge-service.js# 原文切块（400–600 字，重叠 80）
│  │  ├─ distill-sources-service.js  # 资料上传/解析/异步词条整理/续跑
│  │  ├─ distill-questions-service.js# 出题（按维度）、答题、批量、补维度、问答转词条
│  │  ├─ persona-service.js  # 人设读写 + AI 草稿
│  │  ├─ content-service.js  # 内容校验 / 文件归属 / DTO
│  │  ├─ quota-service.js    # 每日额度：访客 + 后台 AI 分开计
│  │  ├─ storage-audit.js    # 孤儿上传文件体检
│  │  └─ fact-migration.js   # 旧分类 key → 分类表（幂等，启动时跑）
│  ├─ routes/                # public / chat / auth / admin-*
│  ├─ middleware/            # upload / security-headers / rate-limit / errors
│  ├─ parsers/material-parser.js
│  └─ storage/local-storage.js # 相对路径 ↔ 绝对路径（带越界校验）
└─ web/
   ├─ index.html             # 含 __SITE_NAME__ 等占位符，由服务端注入
   ├─ public/theme-boot.js   # 同步执行的主题脚本（为满足 CSP 而外置）
   └─ src/
      ├─ App.tsx             # 路由（除首页外全部懒加载）
      ├─ pages/
      │  ├─ PublicChatPage.tsx / PublicContentsPage.tsx / PublicContentPage.tsx
      │  └─ admin/           # Login / Overview / Contents / ContentEditor / Distill / Settings
      ├─ components/
      │  ├─ chat/            # EmptyState、ChatView、Composer、Message、AssistantMessage
      │  ├─ cards/           # ContentCard、ContentPreviewDialog
      │  ├─ admin/           # AdminLayout、FilePickField、distill/（4 个面板）
      │  ├─ layout/          # AppShell、Sidebar、MobileNav
      │  └─ ui/              # BrandMark、ThemeToggle、RailButton、ConfirmDialog、InlineNotice
      ├─ hooks/              # useChat、useAdminSession
      ├─ lib/                # api（统一请求 + 401 跳登录）、chatTransport（SSE）、
      │                      # chat-storage（localStorage）、theme、profile-context、
      │                      # content-kinds、use-document-title、utils
      └─ types/              # chat.ts、content.ts、distill.ts（**后端字段的镜像**）
```

---

## 5. 三条核心链路

### 5.1 对话（最重要，改坏这里等于项目废了）

```
用户输入 → useChat.sendMessage
  → POST /api/chat（SSE）
  → chat.js：normalizeMessages → takeDailyQuota → 开流
  → chat-service.runChat：
      detectIntent（greeting / self / general / mixed）
      ↓
      buildSystemPrompt：
        ① 人设卡（CLOSEST 最前）
        ② 事实词条（buildFactBlocks，来自 factEntries + factCategories）
        ③ 内容块（buildContextBlocks，唯一能挂卡片的来源）
        ④ 原文块（buildKnowledgeBlocks，兜底，命中词条时只补 2 段）
        ⑤ 回答策略（四类分流）+ 说话规矩（150 字、列清单最多 3–4 个）
      ↓
      streamChatCompletion（OpenAI 兼容，忽略 reasoning_content）
      ↓
      createMetaSplitter：正文与 META 分离
      → SSE: {"type":"delta","text":"…"} 多次
      → SSE: {"type":"meta","citations":[],"cards":[],"followups":[],"sources":[],"general":false}
      → SSE: {"type":"done"}
```

**必须知道的约定：**

- 模型在正文里写 `[[c1]]`，前端渲染成上标；卡片来自 `cards[]`，`code` 字段对应。
- 卡片**只能**来自真实内容块（`contents`），词条与原文块不挂卡片（ADR D25）。
- META 缺失时有确定性兜底：`pickMentionedContents()` 按"与标题的最长公共子串 ≥4 字、占标题 ≥60%、且贴在标题头或尾"补卡片，按规则补追问（ADR D16、D53）。
- 问的是本人近况时（含「最近在做什么」这种不带「你」的说法）会注入最新内容（ADR D54）。
- 「依据」`sources[]` 只回标题/问题，**不回内容**（隐私，ADR D45）。
- `general: true` 表示这次用了模型自己的常识，前端在正文下方显示一行小字；模型漏报就不显示（宁缺不错）。
- 上游报错文本必须过 `sanitizeUpstream()` 脱敏后才能返回前端或写日志。

### 5.2 蒸馏（后台最复杂的部分）

```
上传资料 → material-parser 解析（pdf/docx/txt/md；图片仅占位）
  → chunkText 切块 → knowledgeEntries（检索兜底）
  → 立即返回；setTimeout 异步跑 runFactExtraction
      → requestJsonCompletion 提炼事实
      → replaceFactsForSource（只替换 origin='ai' 的，用户的 'user' 保留）
      → resolveCategoryId：AI 起名 → 归一 → 落到 factCategories
  → 前端 2.5s 轮询 factStatus（pending → done/failed）

出题 → pickDimensions（每批跨 4–6 个维度，优先没问过的）
  → 提示词要求题型交替、禁止预设亲属/经历
  → 本地去重（normalizeQuestion）+ 维度兜底分配

答题 → answerQuestion（存答案 + 写 knowledgeEntries 让对话能用）
  → 可选 extractQuestionFacts（问答转词条）

人设 → generateDraft（AI 草稿）→ 存在 personaDraft，确认后 applyDraft 才生效
```

**异步任务注意**：`scheduleFactExtraction` 用 `inflight` 去重；服务重启时 `resumePendingFactJobs()` 会续跑 `factStatus='pending'` 的资料。改这块要保证幂等。

### 5.3 内容与文件

- 封面 → `data/uploads/covers/` → 公开访问 `/media/covers/<file>`。
- 附件 → `data/uploads/files/` → **只走** `GET /api/download/:id`（校验已上架 + 未删除）。
- 彻底删除时连文件一起删；万一漏了，`storage-audit` 会在启动时报出来，后台「设置 → 文件体检」可清理。
- 上传文件名按 UTF-8 还原（浏览器/Windows 会乱码，见 ADR D13）。

---

## 6. 数据模型（`data/db.json`）

顶层键：`version, contents, settings, persona, personaDraft, distillSettings, distillSources, distillQuestions, knowledgeEntries, factEntries, factCategories`

- **`settings`**：`siteName / ownerName / greeting / intro / suggestions[] / footer / categories[] / model{baseUrl, model}`。**Key 不在这里**。
- **`contents[]`**：`id, kind, title, summary, category, tags[], body, coverPath, filePath, fileName, fileSize, jumpUrl, published, pinned, publishedAt, createdAt, updatedAt, deletedAt`。`deletedAt` 非空 = 在回收站。
- **`distillSources[]`**：`id, fileName, ext, size, storedPath, status, charCount, knowledgeCount, factStatus, factCount, createdAt, parsedAt`。
- **`distillQuestions[]`**：`id, batch, question, dimension, status(unanswered/answered/skipped), answer, askedAt, answeredAt`。
- **`knowledgeEntries[]`**：原文切块 + 问答生成的块，`sourceType: material|qa`。
- **`factEntries[]`**：`id, title, content, categoryId, sourceId, origin(ai|user), createdAt`。
- **`factCategories[]`**：`id, label, order, origin(seed|ai|user)`。**分类是数据不是常量**（ADR D39）。
- **`persona` / `personaDraft`**：正式人设与 AI 草稿分离，草稿确认后才覆盖（ADR D24）。

细节字段与校验上限见 `TECHNICAL.md` §6。**改字段必须同步 `repositories/db.js` 的 `withDefaults()`**，否则旧数据缺键会崩。

---

## 7. 安全模型（每一条都有原因，别随手删）

| 机制 | 位置 | 为什么 |
|---|---|---|
| 单密码 + HMAC Cookie（含会话代次） | `services/session.js`、`lib/auth.js` | 单人后台不需要用户表；代次让"退出登录"真能撤销已泄露 token |
| 签名密钥 = `HMAC(SESSION_SECRET, 当前密码)` | `lib/auth.js` `deriveSessionKey` | 改密码即刻让所有旧会话失效 |
| 密码保存即生效（比 `.env` mtime） | `config.js` `getAdminPassword` | 原来必须重启，用户遇到"改了没反应" |
| 密码强度闸门（默认 ≥12 位、非弱口令、≥2 类字符） | `lib/password-policy.js` | 密码弱 → 改模型地址 → Key 被导走，这是最危险的组合 |
| 首次启动无密码时自动生成 24 位随机码 | `config.js` | 避免"装完就是公开默认密码" |
| 登录失败：IP（IPv6 按 /64 聚合）+ 全站 40 次 + 指数退避 ≤3s | `services/session.js` | 挡爆破又不至于把自己锁死 |
| 改模型地址必须二次输密码，且复用登录退避 | `services/settings-service.js` | 会话被盗也改不了地址 |
| 模型地址：拒绝私网/本机、公网强制 HTTPS、DNS 复核、`redirect:'error'` | `lib/url-guard.js` + `llm-service.js` 每次调用都校验 | 防 SSRF，防 `Authorization` 被转发到攻击者服务器 |
| HTTPS 判据只用 `request.secure`（**不许手读 `X-Forwarded-Proto`**） | `services/session.js` | 手读会被伪造头绕过（v1.2.9 修过的真实漏洞） |
| 非本机 http 请求拒绝下发 Cookie | `startSession()` | 明文传 Cookie/密码 = 白送后台 |
| 默认只听 `127.0.0.1` | `config.js` `BIND_HOST` | 防止把明文后台摆到局域网/公网 |
| Key 加密存 `data/secrets/llm-key.enc`（AES-256-GCM + 机器指纹） | `lib/secret-box.js`、`services/secret-store.js` | 打包/备份/转发都带不走可用 Key |
| HTTPS 由 Node 自己终结（`data/certs/` 两个文件） | `lib/tls.js` | 隧道只需 TCP 透传，无需额外装反代；启动自检证书与私钥是否配对 |
| CSP + `X-Frame-Options: DENY` + nosniff + HSTS（HTTPS 下） | `middleware/security-headers.js` | 削弱 XSS/点击劫持；主题脚本外置以适配 CSP |
| 每日额度：访客 800/天、单 IP 120/天、**后台 AI 400/天** | `services/quota-service.js` | 防刷爆 Key 余额；后台接口也可能被打 |
| 审计日志（登录失败/锁定/改密码/改地址/弱密码拦截） | `lib/security-log.js` | 出事能查；**永不记录密码与 Key** |
| 上传：扩展名白名单 + 大小上限 + 随机名 + 图片头签名 + 禁 SVG | `middleware/upload.js`、`lib/content-kinds.js` | 防伪装文件与 XSS |
| 备份/下载：文件名白名单正则 + 路径前缀校验 | `routes/admin-backups.js`、`storage/local-storage.js` | 防路径穿越 |
| `jumpUrl` 只允许 `http(s)://` 或站内 `/` | `services/content-service.js` | 防 `javascript:` |

**已被审查验证挡住的**（改动时别破坏）：静态路径穿越（`.env`/`data/`/secrets 全部取不到）、未登录后台接口 401、React 无 `dangerouslySetInnerHTML`（XSS）、写接口无副作用 GET + SameSite=Lax（CSRF）、提示词注入拿不到 Key、压缩包不含 `.env`/`data`/secrets。

---

## 8. 部署到对外可访问

> 两种形态，二选一：
>
> **形态 A（推荐，最简单）：Node 自己终结 HTTPS。** 把证书丢进 `data/certs/`，服务就是 HTTPS。隧道/反代只做 **TCP 透传**。
> **形态 B：外部反向代理终结 TLS**（Caddy/Nginx）。适合已经有机群、证书统一管理的场景。
>
> 两种都要记住：**不要用明文 HTTP 对外**——Cookie 只在 HTTPS 下才下发，明文传密码等于白送后台。

### 8.0 形态 A：Node 自带 HTTPS（当前部署用的就是这个）

Windows 本机 + 隧道（frp 等）最适合这种。工作量只有"放两个文件 + 重启"：

```bash
# 1) 放证书（顺序不能反：叶子证书在前，中间证书在后）
项目根/data/certs/fullchain.pem
项目根/data/certs/privkey.pem

# 2) 重启服务
# 3) 看启动日志，应当出现：
#    监听：127.0.0.1:8787（HTTPS）
#    证书域名：DNS:www.example.com
#    到期时间：2026-11-27（还剩 15 天）
```

**隧道必须配成 TCP 透传**（让 TLS 一路打到 Node）：

```toml
[[proxies]]
name = "blog-https"
type = "tcp"            # ← 关键：不要用 type = "https"
localIP = "127.0.0.1"
localPort = 8787
remotePort = 443        # 客户端访问 https://你的域名 就到这里
```

用 `type = "https"` 会让 frps 先终结一次 TLS，本地就退化成明文 HTTP，Key 要经隧道裸奔，而且 Node 会以为是"非本机 http"进而拒绝下发登录 Cookie。

**验证（重要）**：不加 `-k` 能 200 才算证书链没问题。

```bash
# Windows 本机
curl.exe -s -o NUL -w "%{http_code}\n" --resolve "www.example.com:8787:127.0.0.1" https://www.example.com:8787/

# 外网
curl -s -o /dev/null -w "%{http_code}\n" https://www.example.com/
curl -sI https://www.example.com/ | grep -i -E "strict-transport|set-cookie"
```

启动自检会拦住两类低级错误：证书/私钥不配对（否则 `https.createServer` 能起但每次握手都失败）、只拷了一个文件。两种情况都会明确告警并退回 HTTP。

**证书续期**：到期前换掉 `data/certs/` 那两个文件再重启即可，不需要改代码、不需要重新构建前端。
私钥文件请收紧权限（Windows：`icacls privkey.pem /inheritance:r /grant:r "用户:(R,W)"`；Linux：`chmod 600`）。

---

### 8.1 形态 B 前置（Linux + Caddy）

- 一台 Linux（Ubuntu 22.04/24.04 为例），root 或 sudo
- Node 20+（推荐 22 LTS），npm
- 一个域名，A 记录指向服务器 IP
- 开放端口：`22`（SSH）、`80`、`443`。**不要开 8787**

```bash
# Node（用 NodeSource，避免发行版自带版本过旧）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v
```

### 8.2 上传代码

**方式一：用 `111/` 目录里的上线整包**（`111/蒸馏博客v1.3.4.zip`，153 文件 / 0.62MB）

这个包是**可以直接上线**的：源码 + 已构建的 `web/dist` + 线上数据（`data/db.json`、`data/uploads/`、`data/certs/`、`data/secrets/`、`data/.session-secret`）都在里面，**不含** `.env`、`node_modules`、`data/logs`、`data/backups`。

```bash
sudo mkdir -p /srv/chat-blog
# 本地执行（.env 单独拷，包里永远不带）：
#   scp 111/蒸馏博客v1.3.4.zip user@服务器:/tmp/
#   scp 111/.env user@服务器:/tmp/chat-blog.env
sudo apt install -y unzip
sudo unzip /tmp/蒸馏博客v1.3.4.zip -d /tmp/pkg
sudo cp -r /tmp/pkg/蒸馏博客v1.3.4/. /srv/chat-blog/
sudo cp /tmp/chat-blog.env /srv/chat-blog/.env   # 用你服务器上原来那份，别重写 SESSION_SECRET
cd /srv/chat-blog && ls   # 应该看到 server/ web/ data/ package.json HANDOFF.md TECHNICAL.md …
```

**方式二：直接把整个目录 rsync 上去**（记得排除大目录）

```bash
rsync -av --exclude node_modules --exclude web/dist --exclude data \
      --exclude snapshots --exclude 版本 --exclude '*.zip' ./ user@服务器:/srv/chat-blog/
```

### 8.3 安装依赖并构建

```bash
cd /srv/chat-blog
npm run install:all      # = server + web 各自 npm install
npm run build            # = 构建 web/dist
ls web/dist/index.html   # 必须存在！
```

> ⚠️ **顺序很重要**：`server/index.js` 在启动时检查 `web/dist/index.html` 是否存在，不存在就进入"前端未构建"的 503 分支并且**不会再切换**。所以必须"先 build，后 start"。

如果 `npm install` 在 `pdf-parse`/`@napi-rs/canvas` 上失败：

```bash
sudo apt install -y build-essential python3   # 让它可以现场编译
# Alpine 系统则需装 musl 版二进制，或改用 Debian 系镜像
```

### 8.4 配置 `.env`

```bash
cd /srv/chat-blog
cp .env.example .env
nano .env
```

生产环境必须改的项：

```ini
# 后台密码：≥12 位，字母+数字+符号混用。也可以留空，首次启动会自动生成 24 位并打印
ADMIN_PASSWORD=换成你自己的强密码

# 监听地址：保持 127.0.0.1（由 Caddy 反代）；不要写成 0.0.0.0
BIND_HOST=127.0.0.1

PORT=8787
SESSION_DAYS=7

# 模型
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-flash

# 额度（按需）
DAILY_CHAT_LIMIT=800
DAILY_CHAT_IP_LIMIT=120
DAILY_ADMIN_AI_LIMIT=400
```

> `LLM_API_KEY` 留空。模型 Key **不要**写进 `.env`，部署完成后在后台「设置 → 模型服务」填，会加密存到 `data/secrets/`。

然后收紧权限：

```bash
sudo chown -R www-data:www-data /srv/chat-blog      # 或你自己的部署用户
sudo chmod 600 /srv/chat-blog/.env
sudo chmod 700 /srv/chat-blog/data
```

### 8.5 迁移旧数据（关键，容易踩坑）

> 用 `111/蒸馏博客v1.3.4.zip` 上线时，`data/` 已经在包里了，这一节只需要看下面「关于模型 Key」那一段。
> 如果你是「只换代码、保留服务器原有数据」，那就**不要**覆盖服务器上的 `data/`。

**必须一起搬的：**

| 路径 | 内容 | 不搬会怎样 |
|---|---|---|
| `data/db.json` | 内容、词条、题目、人设、设置 | 全部丢失，等于重来 |
| `data/uploads/` | 封面、附件、蒸馏资料与抽出的 txt | 卡片图片裂、下载 404、资料打不开 |
| `data/backups/` | 20 份历史快照 | 少了个后悔药（可选） |
| `data/.session-secret` | 会话密钥 + Key 加密主密钥 | 所有登录失效；**模型 Key 解不开** |
| `.env` | 后台密码等 | 按上一节重新配即可（建议重新配） |

```bash
# 本地（Windows PowerShell）：
scp -r data user@服务器:/srv/chat-blog/
```

**关于模型 Key（重点）**

`data/secrets/llm-key.enc` 的加密密钥 = `SHA256(SESSION_SECRET + 机器指纹)`，机器指纹默认是 `hostname|platform|arch`。**Windows → Linux 一定变**，所以：

- ✅ **推荐做法**：`data/secrets/` 不要搬。部署完打开后台 →「设置 → 模型服务」→ 重新填一次 Key。30 秒的事，最省心。
- ⚠️ 若想复用旧密文：必须在**两台机器**的 `.env` 里设置**同一个** `MACHINE_SECRET=xxxx`，并拷贝 `data/.session-secret`。
  注意：在旧机器上**先设好 `MACHINE_SECRET` 再重新保存一次 Key**（保存会用新指纹重新加密），否则密文当场作废。

登录服务器后可以这样确认 Key 状态：

```bash
curl -s http://127.0.0.1:8787/api/chat/status
# {"configured":true,"model":"deepseek-flash"}   ← configured=true 表示 Key 可用
```

若启动日志出现「模型 Key 已加密保存，但当前机器解不开」，就是上面这个原因，去后台重填。

### 8.6 用 systemd 常驻

```bash
sudo nano /etc/systemd/system/chat-blog.service
```

```ini
[Unit]
Description=Chat Blog (对话式博客)
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/srv/chat-blog
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3
# 日志走 journald
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now chat-blog
sudo systemctl status chat-blog --no-pager
sudo journalctl -u chat-blog -n 50 --no-pager   # 首次启动会打印提示（含自动生成的密码）
```

> `NODE_ENV=production` 是必需的：只有非 development 且 `web/dist` 存在时才启用严格 CSP。

### 8.7 用 Caddy 上 HTTPS

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

```bash
sudo nano /etc/caddy/Caddyfile
```

```caddyfile
blog.你的域名.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8787
}
```

```bash
sudo systemctl reload caddy
```

Caddy 会自动申请并续期证书，并把 `X-Forwarded-Proto: https` 传给后端。
后端 `trust proxy = 'loopback'`，只采信**来自本机**的这个头，所以 Caddy 必须和 Node 在同一台机器上（当前部署方式就是）。

> 如果反代在**另一台机器**上：需要改 `server/index.js` 的 `app.set('trust proxy', …)` 为该代理的网段，并用防火墙限制来源。改错了的后果是"伪造头又能绕过强制 HTTPS"。

### 8.8 Nginx 版本（如果你更熟 Nginx）

```nginx
server {
    listen 443 ssl http2;
    server_name blog.你的域名.com;

    ssl_certificate     /etc/letsencrypt/live/blog.你的域名.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/blog.你的域名.com/privkey.pem;

    client_max_body_size 100m;          # 必须 ≥ MAX_UPLOAD_MB

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        # SSE 必须关缓冲，否则回答会攒到最后一次性出现
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### 8.9 上线检查清单

```bash
# 1) 只监听本机（不应该出现 0.0.0.0:8787）
ss -lntp | grep 8787

# 2) 健康检查
curl -s http://127.0.0.1:8787/api/health

# 3) 外网访问（应 200，且 http 会 301 到 https）
curl -I https://blog.你的域名.com/

# 4) 敏感文件必须取不到（都应返回 HTML 而不是文件内容）
curl -s https://blog.你的域名.com/.env | head -c 200
curl -s https://blog.你的域名.com/data/db.json | head -c 200
curl -s https://blog.你的域名.com/data/secrets/llm-key.enc | head -c 200

# 5) 未登录后台接口必须 401
curl -s -o /dev/null -w "%{http_code}\n" https://blog.你的域名.com/api/admin/settings

# 6) Cookie 必须带 Secure（走 HTTPS 时）
curl -si -X POST https://blog.你的域名.com/api/admin/login \
  -H 'Content-Type: application/json' -d '{"password":"你的密码"}' | grep -i set-cookie

# 7) 浏览器实测：首页能聊、卡片能弹、后台能登、蒸馏页能看词条
```

**别忘了**：后台 →「设置 → 模型服务」确认 `configured: true`；用一条「你好」验证能正常出字。

---

## 9. 改代码的硬规则

### 9.1 编码事故（真实发生过，务必遵守）

> **绝对不要**用 PowerShell 的 `Get-Content -Raw` + `Set-Content` 改含中文的源文件。
> Windows PowerShell 5.1 会按 ANSI 读取 UTF-8，再写回时中文全变乱码、引号失效，只能从快照回滚。

安全做法：

```bash
# ✅ 用 node 读写（明确 utf8），且注意文件可能是 CRLF
node -e "const fs=require('fs');const t=fs.readFileSync('文件','utf8');fs.writeFileSync('文件', t.replace(/旧/g,'新'),'utf8')"

# ✅ 正则里换行要写 \r?\n（不要假设 LF）
```

其他编码坑：

- 测试中文数据必须 UTF-8 写文件再 `--data-binary "@file"`，不能用命令行内联。
- `package.json` 带 BOM，`JSON.parse` 会报错；改它要用文本替换，不要整体 parse+stringify（会丢 BOM 并可能改中文）。
- JSX 属性列表里**不能**写 `// 注释`，要用 `{/* */}` 且放在元素外。
- `.env` 里首尾**成对**的引号会被剥掉；密码首尾别加引号（改密码接口已显式拒绝）。

### 9.2 改完必须做

```bash
npm run lint    # oxlint，必须 0 警告（未使用变量/未使用 prop 也算失败）
npm run build   # tsc -b + vite build，必须 0 错误
```

- 改了后端返回字段 → 同步 `web/src/types/*.ts` 和 `web/src/lib/api.ts`。
- 改了 `db.json` 结构 → 同步 `repositories/db.js` 的 `withDefaults()`（旧数据缺键会崩）。
- 改了行为 → 在 `TECHNICAL.md` §10 追加一行：**改了什么 / 达到什么目的 / 为什么要改 / 涉及文件与验证**。
- 重启服务才算生效（`systemctl restart chat-blog`）。

**关于打包：日常改完不要打包。** 只有用户明确说「打包」时才执行 `scripts/snapshot.ps1`；平时只跑 lint/build + 更新文档。打包分两种：

```powershell
# 只打源码（默认）
powershell -ExecutionPolicy Bypass -File scripts/snapshot.ps1 -Version "v1.3.3"

# 连 data/ 一起打（用户要整体迁移时）
powershell -ExecutionPolicy Bypass -File scripts/snapshot.ps1 -Version "v1.3.3" -IncludeData
```

`-IncludeData` 会把 `data/db.json`、`data/uploads/`、`data/certs/`、`data/secrets/`、`data/.session-secret` 一起打进去；**任何模式都不含 `.env`**（含后台密码，需单独拷贝）。含数据的包带着 TLS 私钥与加密模型 Key，只用于自己迁移，不要外发。

### 9.3 不要动的东西

- `data/` 里的用户真实数据（除用户明确要求）。
- 用户的后台密码与模型 Key。
- `TECHNICAL.md` 里的历史记录（只追加，不改写过去）。
- 安全相关的"看起来多余"的判断（`url-guard` 的私网拦截、`request.secure` 判据、`redirect:'error'`…）——每一条都对应一个已确认的攻击路径。

### 9.4 架构约束

- **业务逻辑放 `services/`，路由只做参数校验与转发。** 不要把业务写进 `routes/`。
- 前端"数据获取"统一走 `lib/api.ts`；`chatTransport.ts` 单独负责 SSE。
- 组件按领域分目录（chat / cards / admin / layout / ui），不要新建杂物目录。
- 不引 UI 框架、不引状态库、不引数据库（用户的明确选择）。
- 中文注释，但**只注释需要解释的地方**（为什么这么做、有什么坑），不要逐行翻译代码。

### 9.5 别把带第二个参数的函数直接交给 `.map()`

`Array.prototype.map` 会把 `(元素, 索引)` 一起传给回调。如果被传的函数有第二个参数，索引就会顶上去：

```js
// ✗ 错：索引进了 categories，服务端 500「categories.find is not a function」
listFacts({ sourceId }).map(toPublicFact)

// ✓ 对：显式包一层
listFacts({ sourceId }).map((fact) => toPublicFact(fact, { categories }))
```

**这个坑真实发生过**（v1.3.0 → v1.3.1）：后台「把 N 条问答整理成词条」每一条都报 500，但词条其实已经写进库了，只是返回响应时崩掉，所以页面显示失败、数据却在。

更稳的做法是**导出函数把可选参数收成对象**：`toPublicFact(record, { categories } = {})`、`toPublicQuestion(record, { factCount } = {})`。
万一有人再写成 `.map(该函数)`，解构数字得到 `undefined`，会安全退回默认值，不会崩也不会把索引当数据。全项目已按这个约定改过，新增导出函数请沿用。

### 9.6 首屏要用的数据，随 HTML 一起发下去

浏览器打开页面时，任何"先渲染占位、等接口回来再替换"的写法都会表现为**闪烁**。判断标准很简单：**服务器在生成 HTML 时是否已经知道这份数据？** 知道就别让前端再问一遍。

本项目已有两处按这个原则处理，新增同类需求请沿用：

| 数据 | 做法 | 位置 |
|---|---|---|
| 主题（深浅色） | `<head>` 里同步执行 `theme-boot.js`，渲染前就把 `data-theme` 定好 | `web/public/theme-boot.js` |
| 站点信息（站点名/问候/推荐问题/页脚） | 序列化进 `<script id="boot-profile" type="application/json">`，`ProfileProvider` 首帧直接读 | `server/index.js` 的 `renderIndexHtml` + `web/src/lib/ProfileProvider.tsx` |

三条注意：

1. 用 `type="application/json"` 数据块，**不要**拼内联 JS（CSP 会拦、也有注入风险）。
2. 序列化后把 `<` 转成 `\u003c`，否则用户填的文案里出现 `</script>` 会截断页面。
3. **必须保留接口兜底**：`npm run dev` 走 Vite（5173），`index.html` 不经过后端，内联数据不存在，要靠 `/api/profile`。

同理，`<title>` 也应该由服务端按路由算好（见 `renderIndexHtml` 里的 `pageTitle`），否则标签页会二次跳动。

---

## 10. 当前状态（2026-11-12）

**版本**：`package.json` = 1.3.3 ｜ 迁移包：`版本/蒸馏博客v1.3.3.zip`（**已含 data/**，181 文件 / 0.62MB；不含 `.env`，需单独拷贝）

**数据现状（用户真实数据，勿删）**

| 项 | 数量 |
|---|---|
| 站点名 / 称呼 | `pnds的博客` / `pnds` |
| 模型 | `https://api.deepseek.com` + `deepseek-flash` |
| 内容 | **0 条**（用户说自己上传） |
| 蒸馏资料 | 1 份（`杜佳兴.docx`） |
| 事实词条 | 31 条 |
| 词条分类 | 9 个（荣誉/经历/工作/技能/教育/关系/生活/观点/其他，其中"其他"为空） |
| 蒸馏题目 | 25 道，已答 16 道，目标 1000 |
| 知识块 | 17 |
| 后台密码 | 用户自定的 11 位（`MIN_ADMIN_PASSWORD_LENGTH=6`） |

**已完成**

- M0 静态门面 → M1 数据层与内容后台（+21 项打磨）→ M2 蒸馏后台 → M2.1 词条层 → v1.0.0 安全加固 → v1.1.0 词条独立成页 → v1.2.0 常识可答 → v1.2.1 配置清理 → v1.2.2 密码即时生效 → v1.2.3 文件体检 → v1.2.4 打磨（复制/重新生成、401 跳登录、分享预览、出题跨维度、路由懒加载）→ v1.2.5 内容库页 → v1.2.6 安全加固（9 条）→ v1.2.7 密码阈值可配 → v1.2.8 登录页改密码 → v1.2.9 修 HTTPS 判据。

**已知限制（不是 bug，是取舍）**

- 无 OCR：扫描版 PDF / 图片里的文字读不到，只记文件名。
- 「本回复含 AI 常识补充」依赖模型自报 `general`，漏报则不显示。
- 「重新归类」会覆盖用户手改过的分类（内容与标题不受影响）。
- 每日额度存在内存，重启清零、多进程不共享。
- `security.log` 有 1MB 轮转，但 `logs/` 无自动清理。
- **没有自动化测试**：所有验证都是脚本 + curl + 浏览器手测（每次改动都应至少跑 lint + build + 一条真实对话）。
- 首屏 JS 约 297KB（gzip 93KB），后台已按路由分包。
- 上传目录靠 `storage-audit` 体检，不是实时回收。

**未做（如果用户要）**

- 上线优化：备份一键还原（现在只能下载）、备份自动清理、首屏再瘦身、真机移动端回归。
- 词条增强：批量合并重复、从问答批量回填、OCR。
- 对话增强：导出、多端同步。

---

## 11. 排错速查

| 现象 | 原因 | 处理 |
|---|---|---|
| 页面 503「还没有前端构建产物」 | `web/dist` 缺失 | `npm run build` 后**重启**服务 |
| 启动日志显示「监听：（HTTP）」但我要 HTTPS | `data/certs/` 里两个文件没齐 | 补齐 `fullchain.pem` + `privkey.pem`；或用 `TLS_CERT_FILE` / `TLS_KEY_FILE` 指到别处 |
| 启动日志说「证书与私钥不匹配」 | 两个文件不是同一张证书 | 重新导出配对的两个文件；叶子证书在前、中间证书在后 |
| 浏览器提示证书无效/不受信任 | 链里缺中间证书，或域名不在 SAN 里 | `fullchain.pem` 必须包含中间证书；确认证书 SAN 含你访问的域名（`www.` 和不带 `www.` 是两张证书） |
| 浏览器提示证书过期 | 证书到期 | 换新的两个文件，重启即可 |
| 隧道通了但浏览器报「连接已重置」/ 502 | 隧道是 `type=https`，与本地 HTTPS 撞了；或证书/私钥不配对 | 隧道改成 `type=tcp`；看启动日志有无配对告警 |
| 后台登不进，提示「只能通过 HTTPS 访问」 | 用 http + 非本机地址访问 | 启用 HTTPS；或在本机 `127.0.0.1` 访问 |
| 设置页红条「后台密码不够安全」且模型配置锁着 | 密码短于阈值/命中弱口令 | 改 `.env` 的 `ADMIN_PASSWORD` 或在登录页「修改密码」；保存即生效 |
| 聊天提示「还没有配置模型 API Key」 | Key 未填或换机器解不开 | 后台「设置 → 模型服务」重填 |
| 聊天报 502，信息里带上游原文 | 上游/Key/额度问题 | 看服务日志；检查 Key 与余额 |
| 回答不出字、最后一次性蹦出来 | 反代缓冲了 SSE | Nginx 加 `proxy_buffering off`（Caddy 默认 OK；Node 直出 HTTPS 天然没问题） |
| 上传大文件 413 | 反代体积限制 | Nginx `client_max_body_size` ≥ `MAX_UPLOAD_MB` |
| 资料一直「正在整理词条」 | 模型调用慢/失败 | 看日志；后台点「重新整理词条」 |
| 「把 N 条问答整理成词条」全部报错 | v1.3.1 之前的 `.map` 参数 bug | 升到 v1.3.1+ |
| 卡片图片裂、下载 404 | `data/uploads/` 没搬 | 补搬 uploads 目录 |
| 修改密码后其它设备要求重新登录 | **预期行为** | 签名密钥由密码派生 |
| 提示「模型服务地址不能是内网或本机」 | 地址指向私网 | 用公网 HTTPS 地址；自建模型设 `LLM_ALLOW_PRIVATE=1` |
| 端口被占用 | 旧进程还在 | 找 PID 后停掉，或改 `PORT` |

更多见 `TECHNICAL.md` §13.6。

---

## 12. `TECHNICAL.md` 各节讲什么

| 节 | 内容 |
|---|---|
| §0–§2 | 文档规则、项目定位、**完整需求清单（含回答策略四类分流）** |
| §3 | 技术栈与环境、明确不引入什么 |
| §4 | 目录结构（逐文件注释） |
| §5 | 架构与模块边界、前端数据流、后端分层 |
| §6 | **数据设计（每个字段的含义与上限）** |
| §7 | **接口清单 + 错误格式 + 安全检查项 + SSE 协议 + 分享链接** |
| §8 | 设计系统（颜色变量、字体、动画、后台视觉规范） |
| §9 | 里程碑与验收（M0–M4 每项做了什么） |
| §10 | **变更记录（每次改动：改了什么/目的/原因/文件与验证）** |
| §11 | **关键决策记录 D1–D50**（为什么这么设计，改之前先读） |
| §12 | 已知限制 |
| §13 | 运行、构建、配置项、常见问题、数据位置 |
| §14 | 下一步规划 |
| §15 | 版本与快照表 |

---

## 13. 给接手的 AI 的一段开场白（可直接复制）

```
这是一个个人"对话式博客"项目，位于 <路径>。请先读 HANDOFF.md（交接文档），
再按需读 TECHNICAL.md 的对应章节，然后告诉我你的理解，不要立刻改代码。

关键约束：
1. 首页是 ChatGPT 风格对话框，不是文章列表；内容卡片是核心交互。
2. 后端是 Express + 纯 JSON 存储（data/db.json），业务逻辑都在 server/services/，
   路由只做校验与转发。
3. 改后端返回字段必须同步 web/src/types/*.ts 和 web/src/lib/api.ts；
   改数据结构的键必须同步 server/repositories/db.js 的 withDefaults()。
4. 每次改完必须跑 npm run lint 和 npm run build（都要 0 警告 0 错误），
   并在 TECHNICAL.md §10 追加变更记录（改了什么/达到什么目的/为什么要改）。
5. 不要用 PowerShell 的 Get-Content -Raw + Set-Content 修改含中文的源文件（会乱码），
   用 node 读写 utf8。
6. data/ 里是用户真实数据（1 份资料、31 条词条、25 道题），没有明确要求不要删改。
7. 安全相关的判断不要随手简化（私网拦截、request.secure、redirect:'error' 等），
   每一条都对应一个已确认的攻击路径。
```

---

*本文件与代码同步维护。若代码行为与本文不符，以代码为准，并顺手修正本文。*
