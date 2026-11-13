# 对话式个人博客 · 技术文档

> 版本：v1.2.0（客观常识可答 + 依据脱敏）
> 最后更新：2026-11-11
> 文档位置：项目根目录 `TECHNICAL.md`

---

## 0. 文档定位与更新规则

### 0.1 这份文档是什么

这是本项目**唯一持续维护的技术文档**，记录：

- 产品目标与已确认需求
- 技术选型、目录结构、模块边界
- 数据结构、接口约定、运行方式
- 每个里程碑的完成情况与验收结果
- 每次改动的原因、目的和影响
- 版本快照位置（用于回滚）

`SPEC.md` 是早期 v0.1 需求稿，**仅作历史参考**。当 `SPEC.md` 与本文档或用户最新指令冲突时，以**用户最新指令 + 本文档**为准。

### 0.1.1 两份文档的分工

| 文档 | 面向谁 | 写什么 |
|---|---|---|
| `HANDOFF.md` | **接手的 AI / 部署的人** | 全局视角：需求真相与演变、代码地图、三条核心链路、安全模型、**Linux 服务器部署步骤**、改代码的硬规则、临时环境坑、当前状态 |
| `TECHNICAL.md`（本文） | 开发者 | 技术细节的权威来源：数据结构逐字段、接口清单、SSE 协议、设计系统、里程碑验收、**变更记录（§10）**、**决策记录 D1–D50（§11）**、已知限制 |

新人/新 AI 接手时**先读 `HANDOFF.md`**，需要某个模块的细节再回到本文对应章节。两者冲突时以代码为准，并顺手修正文档。

### 0.2 更新规则（必须遵守）

以后**每做一次改动**，都要在本文档的「§10 变更记录」追加一条，并明确写清三件事：

1. **改了什么**：具体改了哪些功能、文件、配置或数据结构。
2. **达到了什么目的**：这次改动让产品/代码达到了什么状态，解决了什么问题。
3. **为什么要改**：需求来源、用户反馈、技术原因或风险考虑。

如果改动涉及以下内容，还要同步更新对应章节，不能只写变更记录：

- 技术栈、目录结构、运行方式 → 更新 §3、§4、§13
- 数据结构、接口、输出协议 → 更新 §6、§7
- 设计规范、主题、交互 → 更新 §8
- 里程碑范围、验收标准 → 更新 §9、§14
- 关键取舍 → 更新 §11
- 版本快照 → 更新 §15

**只改代码不更新本文档，视为本次任务未完成。**

### 0.3 每次改动与打包的规则

**每次改代码后，只做两件事：**

1. 跑 `npm run lint`、`npm run build`，确认无警告无报错
2. 更新本文档（变更记录 + 受影响章节）

**打包只在用户明确说「打包」时执行，不要每次改完就打包。** 用户会在需要部署/备份时主动要求。

打包命令（默认只打源码）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/snapshot.ps1 -Version "v1.3.3"
```

需要连运行时数据一起打（迁移到服务器时用）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/snapshot.ps1 -Version "v1.3.3" -IncludeData
```

`-IncludeData` 会把 `data/` 一起打进去（`db.json`、`uploads/`、`certs/`、`secrets/`、`.session-secret`），但**始终不含 `.env`**（里面有后台密码，需单独拷贝或按 `.env.example` 重建），并排除 `data/logs/`。

> ⚠️ 含数据的包里带着 TLS 私钥 `data/certs/privkey.pem` 与加密后的模型 Key。这类包只用于自己迁移，不要外发、不要放进公开仓库。

---

## 1. 项目定位

### 1.1 一句话

一个**以对话为主要入口的个人博客**：访客打开页面，看到的是作者的自述和一个输入框；可以直接问作者问题，回答以作者第一人称给出，并附上真实内容卡片。

### 1.2 当前阶段的目标

- 当前是**单人博客**，不是多用户平台。
- 代码按「未来可以长成平台」的方式组织：页面、组件、业务服务、数据仓库、存储、模型调用分层，模块可替换。
- v1 **不做**多用户、注册、租户、复杂权限。

### 1.3 三条产品原则

1. **它是博客，不是客服**：页面要有个人主页的气质，不能像客服窗口。
2. **回答必须能落到真实内容**：说到的作品、文章、动态，要能显示对应卡片；没有就明确说不知道。
3. **先有人，后有 AI**：开场是作者自述，不是「您好，我是 AI 助手」。

---

## 2. 已确认需求（v1）

> 本节以用户 2026-11-10 的口头确认和后续选择为准。

### 2.1 公开站点（访客侧）

- 首页布局参考 ChatGPT 网页版：左侧窄图标栏 + 中央问候 + 输入框 + 推荐问题。
- 主题：深色 / 浅色都做，默认深色，侧边栏切换，选择记在浏览器。
- 开场：AI 以蒸馏后的作者口吻给一句简短自我介绍。
- 推荐问题：3 条，后台可编辑（M1 已可编辑）。
- 对话：流式输出、第一人称、先给结论、简短；不编造，不知道就说不知道。（**已接真实模型**）
- 回答后展示内容卡片：封面、名称、简介、分类、打开/下载动作。（**已接真实内容**）
- 每条回答后给 2 条追问建议。
- 「最近在做什么」优先取最新发布且上架的内容回答。
- 移动端可用；375px 宽度无横向滚动。
- 支持 `/?q=问题` 分享链接（M3/M4 接入）。
- 站内内容详情页 `/p/:id`：卡片没有外链时，访客在这里读全文并下载附件。
- 对话历史 v1 只存浏览器 `localStorage`，服务端历史暂不做。

### 2.2 管理员后台

访问 `/admin`，单管理员，密码登录。侧边栏 4 个模块：

1. **蒸馏**（M2 已完成）
   - 资料蒸馏：上传 PDF / Word / Markdown / TXT / 图片，AI 把正文整理成一条条事实词条（荣誉、经历、教育…），后台可逐条查看、修改、删除。图片暂只登记文件名。
   - 问题蒸馏：AI 根据资料和内容分批生成问题，目标 1000–2000 题；可随时答题、暂停、继续；进度自动保存；支持跳过、撤销。
   - 人设卡：身份、称呼、说话方式、情绪表达、知识边界、口头禅；可直接编辑，也可让 AI 生成草稿后确认应用。
   - 图片 OCR v1 暂不做，先支持上传，后续接入。
2. **内容上传**（M1 已完成）
   - 统一发布表单，选择内容类型后动态显示字段。
   - 内置类型：文章、程序、视频、音乐、图片、其他。
   - 通用字段：类型、标题、封面、简介、分类/标签、正文/说明、跳转链接（可选）、上传文件（可选）。
   - 上传文件存本地，系统自动生成下载地址。
   - 右侧实时卡片预览：改标题/简介/封面立刻能看到访客视角。
   - 文件支持点击与拖拽；有文件时显示上传进度百分比。
   - 离开未保存的表单会二次确认；校验失败自动滚到第一个出错字段。
   - 分类候选来自「设置」页，不再写死。
3. **内容管理**（M1 已完成）
   - 列表、搜索（关键词高亮 + 匹配数）、按类型/分类/状态筛选、排序（最新/最早/标题）。
   - 编辑、上架/下架、置顶。
   - 删除进入**回收站**（可恢复），彻底删除需二次确认并同时清理文件。
   - 多选批量操作：批量上架/下架/移入回收站/恢复/彻底删除，均带确认。
   - 「最近在做什么」取最新发布且上架的内容（M3 接入对话）。
   - 概览页：内容规模、按类型分布、回收站数量、备份数量、当前模型、最近更新。
4. **设置**（M1 已完成）
   - 站点名称、作者称呼、开场问候、开场自述、页脚。
   - 推荐问题、分类。
   - 模型服务：Base URL、模型名、**API Key（后台可直接填写/清除）**。
   - API Key 只写进项目根目录的 `.env`，不入库、不回传完整值（只显示末尾 4 位）。
   - 数据库备份列表：查看最近 20 份备份的时间与大小，可直接下载。

### 2.3 部署与数据

- 整个项目（代码、数据、上传文件、配置、日志）**全部放在项目目录内**，不写系统目录。
- 最终拷贝到 **Windows + 已安装 Node.js** 的服务器运行。
- 必须一键启动（`start.bat`）；前端构建产物 `web/dist` 可单独上传/替换。
- 数据存储：**纯 JSON 文件 + 本地上传目录**，零外部数据库。
- 数据层做成接口，未来可平移到 SQLite / PostgreSQL / 云存储。

### 2.4 技术与协作约束

- 前端：React + TypeScript + Vite + Tailwind CSS。
- 后端：Node.js + Express。
- 模型：OpenAI 兼容接口，默认 DeepSeek，可替换 Base URL / Key / 模型名。
- 不引入重型 UI 组件库；图标用 `lucide-react`。
- 不写自动化测试框架，验收以人工脚本为主。
- 代码必须写**中文注释**，解释意图而不是复述代码。
- 代码按模块拆分，改一个模块不牵动全局。
- 动画流畅，避免硬切换；尊重 `prefers-reduced-motion`。

---

### 2.5 回答策略（重要）

对话不是"作品检索器"，而是一个人在说话。服务端按问题类型分三路检索（`detectIntent`），提示词里再按**问的是"你身上的事"还是"外面的世界"**分四类回答：

| 提示词里的类别 | 例子 | 依据 | 回答方式 |
|---|---|---|---|
| ① 你身上的事 | 你得过什么奖、你做过什么、你怎么看、你后悔吗 | **只能用材料** | 照词条说具体信息；没有就说"没写过/不记得" |
| ② 外面的世界 | 你家乡有啥好东西、那学校在哪个城市、什么是光合作用、别人的作品 | 可以用模型自己的知识 | 正常回答；**即使句子里带"你的家乡/你的学校"也一样** |
| ③ 混合 | "你家乡有啥好事" + "你小时候干什么" | 拆开 | 常识部分正常说，个人部分按材料说 |
| ④ 都无关 | 算术、通用问题 | 不限 | 像聊天一样答 |

判定标准是**问的这件事属于谁**，不是句子里有没有"你"。

四条硬规则：

1. **不主动把话题引到项目上**：只有对方问起、或材料正好能回答时才提。
2. **不编造个人经历**：个人事实（经历、成绩、作品细节、观点、关系、身体、钱、承诺）材料里没有就说没写过/不记得。
3. **不编精确数字**：常识部分涉及年份、排名、价格、政策、统计时不硬报，记不清就说记不清。
4. **不解释自己的机制**：不说"这属于常识不是我的经历""这不是我记录过的""不敢给你列"。

用常识回答了的时候，页面上会在回答下面加一行小字「本回复使用 AI 常识回答」（由模型在 META 的 `general` 字段自报，前端只负责展示）。

优先级：**事实词条 > 内容卡片 > 原文段落**。问"你得什么奖"这类问题，先照词条里的具体信息说（名称、时间、数字），词条里没有才回落原文，都没有才说不记得。

M2 之后人格（语气、习惯、口头禅）已经是独立的一层：`persona` 经 `formatPersonaForPrompt` 变成「你说话的样子」段落注入提示词，"人味"主要靠它来补；事实来自事实词条（`factEntries`）与内容卡片，原文段落只做兜底。

---

## 3. 技术栈与环境

### 3.1 当前环境（2026-11-10 验证）

| 项 | 版本 / 说明 |
|---|---|
| 操作系统 | Windows |
| Node.js | v24.21.0（建议 ≥ 20） |
| npm | 11.19.0（PowerShell 可能禁止 `npm.ps1`，用 `npm.cmd` 或 `.bat` 脚本） |
| 前端构建 | Vite 8.3.7 |
| React | 19.3.1 |
| TypeScript | 7.0.2 |
| Tailwind CSS | 4.3.5 |
| React Router | 7.18.5 |
| lucide-react | 1.70.0 |
| 后端 | Express 4.21.2 + multer 2.0.2 |
| 资料解析 | pdf-parse 2.4.5（PDF）+ mammoth 1.13.0（DOCX） |
| 数据 | `data/db.json`（JSON，原子写入） |

### 3.2 技术选型

| 层 | 选型 | 说明 |
|---|---|---|
| 前端 | React + Vite + TypeScript | SPA，构建产物 `web/dist` 可独立部署 |
| 样式 | Tailwind CSS v4 + CSS 变量 | 语义色变量统一深浅主题 |
| 路由 | React Router | `/` 公开页，`/admin/*` 后台 |
| 图标 | lucide-react | 轻量、按需引入 |
| 后端 | Node.js ESM + Express | 路由/中间件清晰；纯 JS 便于跨机器拷贝 |
| 上传 | multer（磁盘存储） | 随机文件名 + 扩展名白名单 |
| 数据 | JSON 文件 + 原子写入 + 备份 | 单作者、数据量小；仓储层可替换 |
| 文件 | 本地 `data/uploads/` | 封面、下载文件、蒸馏资料分目录 |
| 会话 | HMAC 签名 Cookie | 无需 session 表；密钥落盘复用 |
| 模型 | OpenAI 兼容接口，原生 `fetch` | 默认 `deepseek-flash`；不引入 LangChain（**已实现**） |
| 检索 | 中文 bigram 关键词打分（BM25 思路） | 只检索已上架内容；不依赖 embedding（**已实现**） |
| 解析 | PDF / Word / Markdown / TXT | `pdf-parse` + `mammoth`；图片只记文件名，不读字（OCR 暂缓） |
| 词条 | 模型提炼结构化事实（获奖/经历/教育…） | 词条是后台可见可改的最小检索单位，优先于原文段落 |

### 3.3 明确不引入

- 重型 UI 组件库（shadcn / antd / MUI）
- ORM / Prisma / 外部数据库
- LangChain 等重型 AI 框架
- 自动化测试框架（v1）
- 多语言、语音、音频播放器、模型微调

---

## 4. 目录结构

### 4.1 当前实际结构（M2）

```
聊天/
├─ README.md                   # 项目门面（GitHub 首页）：定位、功能、快速开始、架构图、安全、部署
├─ SPEC.md                     # 早期需求稿，仅参考
├─ TECHNICAL.md                # 本技术文档
├─ HANDOFF.md                  # 交接文档（需求真相 / 代码地图 / 部署 / 改代码硬规则）
├─ package.json                # 根脚本：dev / build / start / lint / snapshot
├─ start.bat                   # 统一启动：默认正式模式，带 dev 参数进开发模式
├─ .env                        # 本地配置（密码、端口、模型），不入库
├─ .env.example                # 配置模板
├─ .gitignore
├─ snapshots/                  # 版本快照 zip（可回滚）
├─ scripts/
│  └─ snapshot.ps1             # 打包当前版本（排除 node_modules / data）
├─ data/                       # 运行时数据（不入库，随项目一起迁移）
│  ├─ db.json                  # 内容、设置、人设、蒸馏数据
│  ├─ .session-secret          # 自动生成的会话签名密钥
│  ├─ backups/                 # db 自动备份（保留最近 20 份）
│  ├─ logs/
│  └─ uploads/
│     ├─ covers/               # 封面图（公开访问 /media/covers/...）
│     ├─ files/                # 下载附件（只走 /api/download/:id）
│     └─ distill/              # 蒸馏资料 + 抽出的纯文本 <id>.txt
├─ server/                     # 后端
│  ├─ index.js                 # 入口：中间件、路由、静态托管、SPA 回退
│  ├─ config.js                # 读 .env、路径常量、会话密钥
│  ├─ package.json
│  ├─ lib/
│  │  ├─ env.js                # 极简 .env 解析
│  │  ├─ atomic-json.js        # 原子读写 + 备份轮转
│  │  ├─ auth.js               # HMAC token、恒定时间比较
│  │  ├─ secret-box.js         # AES-256-GCM 加解密（存模型 Key）
│  │  ├─ security-log.js       # 安全审计日志（data/logs/security.log）
│  │  ├─ url-guard.js          # 模型地址校验（协议白名单、私网识别）
│  │  ├─ ids.js                # id / 安全文件名
│  │  ├─ http-error.js         # 带状态码的业务错误
│  │  ├─ persona.js            # 人设结构、默认值、转提示词文本
│  │  ├─ fact-categories.js    # 词条分类（荣誉/经历/教育/工作…）
│  │  ├─ question-dimensions.js# 出题维度定义与「本批选哪几个维度」
│  │  └─ content-kinds.js      # 内容类型、上传白名单
│  ├─ parsers/
│  │  └─ material-parser.js    # 资料解析：PDF / DOCX / TXT / MD / 图片占位
│  ├─ repositories/
│  │  ├─ db.js                 # 内存缓存 + mutateDb 持久化 + 默认结构
│  │  └─ contents.js           # 内容查询/新增/更新/删除/分类统计
│  ├─ services/
│  │  ├─ content-service.js    # 校验、文件归属、DTO 转换
│  │  ├─ session.js            # 登录、Cookie、限流、鉴权中间件
│  │  ├─ settings-service.js   # 站点设置读写、模型 key 落 .env
│  │  ├─ retrieval-service.js  # 中文检索（同义词扩展 + 词条/原文/内容三路）
│  │  ├─ llm-service.js        # 流式 / 非流式 JSON 调用（含重试与 reasoning 过滤）
│  │  ├─ chat-service.js       # 提示词拼装（人设 + 词条 + 内容 + 原文）、META 切分
│  │  ├─ fact-service.js       # 词条提炼、增删改、按来源级联、统计与摘要
│  │  ├─ knowledge-service.js  # 原文切块（400–600 字，重叠 80）与增删
│  │  ├─ secret-store.js       # 模型 Key 加密存取 + 从 .env 迁移
│  │  ├─ quota-service.js      # 每日对话额度（全站 + 单 IP）
│  │  ├─ distill-sources-service.js    # 资料上传、解析、异步词条整理、删除
│  │  ├─ distill-questions-service.js  # 出题（按维度）、答题、批量、补维度、问答转词条
│  │  ├─ persona-service.js    # 人设读写 + AI 草稿（确认后生效）
│  │  └─ storage-audit.js      # 上传文件体检：找出没人引用的孤儿文件
│  ├─ routes/
│  │  ├─ public.js             # /api/profile、/api/contents、/api/download
│  │  ├─ chat.js               # POST /api/chat（SSE）、GET /api/chat/status
│  │  ├─ auth.js               # /api/admin/session|login|password|logout
│  │  ├─ admin-contents.js     # 后台内容 CRUD + 回收站恢复/彻底删除
│  │  ├─ admin-distill.js      # 蒸馏：资料 / 词条 / 问题 / 人设 / 统计
│  │  ├─ admin-backups.js      # 备份列表与下载（文件名白名单防穿越）
│  │  ├─ admin-maintenance.js  # 文件体检：孤儿上传文件的查看与清理
│  │  └─ admin-settings.js     # 后台设置读写
│  ├─ middleware/
│  │  ├─ upload.js             # multer 配置、类型白名单、文件名解码
│  │  ├─ security-headers.js   # 安全响应头 + 生产 CSP
│  │  ├─ rate-limit.js         # 按 IP 的滑动窗口限流
│  │  └─ errors.js             # asyncHandler、统一错误输出
│  └─ storage/
│     └─ local-storage.js      # 相对路径 ↔ 绝对路径、删除、封面 URL
└─ web/                        # 前端
   ├─ src/
   │  ├─ App.tsx               # 路由 + 主题 + 站点信息 Provider
   │  ├─ pages/
   │  │  ├─ PublicChatPage.tsx
   │  │  ├─ PublicContentsPage.tsx    # 内容库：已上架内容 + 搜索/类型筛选
   │  │  ├─ PublicContentPage.tsx  # 站内内容详情 /p/:id
   │  │  ├─ NotFoundPage.tsx
   │  │  └─ admin/
   │  │     ├─ AdminLoginPage.tsx
   │  │     ├─ AdminOverviewPage.tsx     # 概览：内容/回收站/备份/模型
   │  │     ├─ AdminContentsPage.tsx
   │  │     ├─ AdminContentEditorPage.tsx
   │  │     ├─ AdminDistillPage.tsx      # 蒸馏：三个标签页的外壳 + 顶部统计
   │  │     └─ AdminSettingsPage.tsx
   │  ├─ components/
   │  │  ├─ admin/              # AdminLayout、FilePickField
   │  │  │  └─ distill/         # DistillFields、Sources / FactList / Questions / Persona
   │  │  ├─ layout/             # AppShell、Sidebar、MobileNav
   │  │  ├─ chat/               # EmptyState、ChatView、Composer、Message
   │  │  ├─ cards/              # ContentCard、ContentPreviewDialog
   │  │  └─ ui/                 # BrandMark、ThemeToggle、RailButton、ConfirmDialog、InlineNotice
   │  ├─ hooks/                 # useChat、useAdminSession
   │  ├─ lib/                   # api、chatTransport、chat-storage、theme、profile-context、
   │  │                         # content-kinds、fact-categories、use-document-title、utils
   │  ├─ data/                  # mockProfile、mockContents（仅在线失败时兜底）
   │  ├─ types/                 # chat.ts、content.ts、distill.ts
   │  └─ styles/globals.css     # Tailwind + 设计变量 + 动画
   └─ dist/                     # 构建产物，可单独上传/替换
```

### 4.2 结构约定

- `web/dist` 只放构建产物，里面**不写业务代码**；改源码后重新 `npm run build`。
- `data/` 是唯一运行时数据目录；迁移只拷这个目录。
- 页面只做组合；接口调用统一走 `web/src/lib/api.ts`。
- 后端路由只做参数与响应；业务在 `services`，数据在 `repositories`，文件在 `storage`。
- 新增内容类型：服务端 `lib/content-kinds.js` + 前端 `lib/content-kinds.ts` 各加一项。

---

## 5. 架构与模块边界

### 5.1 前端数据流

```
App
 ├─ ThemeProvider（深浅主题）
 ├─ ProfileProvider（GET /api/profile，失败回落 mock）
 └─ BrowserRouter
     ├─ /                      → PublicChatPage
     │                            ├─ AppShell（侧栏 / 移动端抽屉）
     │                            ├─ EmptyState（首屏，读站点信息）
     │                            ├─ ChatView → useChat → httpTransport → POST /api/chat（SSE）
     │                            └─ ContentPreviewDialog（真实下载 / 外链）
    └─ /admin/login           → AdminLoginPage
        /admin/*               → AdminLayout（useAdminSession 守门）
            ├─ (index)         → 概览：内容/回收站/备份/模型
            ├─ contents        → 列表 / 筛选 / 排序 / 回收站 / 批量操作
            ├─ contents/new    → 统一上传表单 + 实时卡片预览
            ├─ contents/:id/edit
            ├─ distill         → 蒸馏：资料 / 问题 / 人设卡
            └─ settings        → 站点信息 / 推荐问题 / 分类 / 模型 / 备份
```

### 5.2 前端关键接口

`ChatTransport`（`lib/chatTransport.ts`）：真实实现，调用 `/api/chat` 并解析 SSE；`useChat` 与 UI 只依赖这个接口，换成别的模型源不用改组件。

服务端对话链路（`server/services`）：

```
POST /api/chat
  → normalizeMessages（只留 user/assistant，最近 10 轮，单条 1000 字）
  → detectIntent（greeting / self / general）
  → retrieveContents（关键词 + 同义词扩展；问本人时追加最新 3 条）
  → retrieveFacts（最多 8 条，同源最多 4 条；标题权重最高）
  → retrieveKnowledge（词条已命中只补 2 段原文，否则补 4 段；寒暄不取）
  → buildSystemPrompt（人设 + 词条块 → 内容块 → 原文块，接续编号 + 规则 + 输出协议）
  → streamChatCompletion（DeepSeek 流式，忽略 reasoning_content）
  → createMetaSplitter（按 ⟦META⟧ 切正文与结构化数据）
  → 兜底：漏标引用时按标题匹配补卡片；追问不足时补默认问题
  → SSE：delta… → meta → done
```

蒸馏链路（`server/services`）：

```
POST /admin/distill/sources（multipart material）
  → 落盘 uploads/distill/<id>.<ext>
  → parseMaterial（pdf-parse / mammoth / 纯文本）
  → 全文写 uploads/distill/<id>.txt
  → chunkText（400–600 字，重叠 80）→ knowledgeEntries（原文兜底，weight 2）
  → extractFactsFromText（JSON 模式）→ replaceFactsForSource（factEntries，origin=ai）
      └ 只替换 origin=ai 的，手写/改过的保留

PATCH /admin/distill/questions/:id { answer }
  → 题目置 answered → 写一条 knowledgeEntries（weight 3）

POST /admin/distill/persona/draft
  → 读资料正文 + 已发布内容（预算 7000 字）→ requestJsonCompletion
  → personaDraft（不覆盖 persona）→ 用户点「应用」才写 persona

POST /admin/distill/questions/generate
  → buildFactDigest（词条摘要）+ buildMaterialBrief（原文摘录）
  → pickDimensions（按已出题数选最久没问到的 2–4 个维度）
  → 按维度配额出题 → 落库时带 dimension
```

`lib/api.ts`：所有接口调用集中在此，统一 `credentials: 'include'`、统一 `ApiError`（带 status）。

### 5.3 后端分层

| 层 | 职责 | 约束 |
|---|---|---|
| routes | HTTP 路由、参数提取、响应格式 | 不写业务逻辑 |
| services | 校验、业务流程、DTO 转换 | 不直接拼文件路径 |
| repositories | 内存状态 + JSON 持久化、查询 | 不处理 HTTP |
| storage | 相对路径 ↔ 绝对路径、删除、URL | 阻止 `../` 越界 |
| middleware | 鉴权、上传、错误统一输出 | 统一中文错误信息 |
| lib | 无状态工具（env、json、auth、ids） | 不依赖业务 |

### 5.4 模块化规则

- 页面只负责组合；不直接 `fetch`，不直接读文件。
- 新增字段：`types` → 表单 → 服务端校验 → 仓库，四处同步。
- 颜色/圆角/字体/动画统一走设计变量与工具类。
- 新增依赖前先判断能否用现有能力实现。

---

## 6. 数据设计（已实现）

### 6.1 文件布局

```
data/
├─ db.json          # 全库（原子写入，写前备份）
├─ .session-secret  # 会话签名密钥（自动生成，同时用于加密模型 Key）
├─ secrets/
│  └─ llm-key.enc   # 模型 API Key（AES-256-GCM 加密，换机器解不开）
├─ backups/         # db-YYYY-MM-DDTHH-mm-ss.json，保留最近 20 份
├─ logs/
│  └─ security.log  # 敏感操作审计（登录失败、改 Key、改模型地址）
└─ uploads/
   ├─ covers/       # 封面（公开读）
   ├─ files/        # 附件（仅下载接口）
   └─ distill/      # 蒸馏资料原件 + <sourceId>.txt（抽出的纯文本，不进 db）
```

### 6.2 db.json 结构

```json
{
  "version": 1,
  "contents": [],
  "settings": { "...": "见 6.4" },
  "persona": { "...": "见 6.6" },
  "personaDraft": null,
  "distillSources": [],
  "distillQuestions": [],
  "knowledgeEntries": [],
  "factEntries": [],
  "distillSettings": { "targetCount": 1000, "batchSize": 10, "lastBatch": 0 }
}
```

启动时用默认值补全缺失键，旧文件不会因为缺字段崩溃；`persona` 会过一遍 `normalizePersona` 收敛结构。

### 6.3 ContentRecord（内容）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | `content_<时间戳36进制><随机>` |
| kind | string | article / program / video / music / image / other |
| kindLabel | string | 中文类型名，便于列表直接显示 |
| title | string | ≤ 80 字，必填 |
| summary | string | ≤ 300 字，必填（卡片与搜索都用它） |
| category | string | ≤ 30 字，可空 |
| tags | string[] | 最多 8 个 |
| body | string | 正文或说明，可空 |
| jumpUrl | string | 只允许 `http(s)://` 或 `/` 开头 |
| coverPath | string | 相对 data 的路径，如 `uploads/covers/xxx.png` |
| filePath | string | 相对 data 的路径 |
| fileName | string | 上传时的原始文件名（已修正中文编码） |
| fileSize | number | 字节 |
| published | boolean | 是否上架 |
| pinned | boolean | 是否置顶 |
| publishedAt | string | 首次上架时间（排序用） |
| deletedAt | string | 非空表示在回收站里；软删除时同时把 published 置为 false |
| createdAt / updatedAt | string | ISO 时间 |

排序规则：`pinned` 优先，其次按请求的 `sort`（latest / oldest / title）排序。

删除语义：

- `DELETE /api/admin/contents/:id` → 软删除（打 `deletedAt`），记录与文件都保留，可恢复。
- `POST .../restore` → 清掉 `deletedAt`，保持未上架，避免未经确认重新公开。
- `DELETE .../purge` → 彻底删除，同时清理封面与附件文件。

### 6.4 settings（设置）

| 字段 | 说明 |
|---|---|
| siteName / ownerName | 站点名、作者称呼 |
| greeting / intro | 首屏问候与自述 |
| suggestions | `[{ text, hint }]`，最多 6 条 |
| footer | 页脚一行字 |
| categories | 分类候选，最多 30 个 |
| model | `{ baseUrl, model }`，**API Key 不在此处** |

模型默认值：`https://api.deepseek.com` + `deepseek-flash`（可在设置页修改）。

API Key 的存放（v1.0.0 起）：**不再写 `.env`，也不写 `db.json`**。后台填写后调用 `secret-store.setLlmKey()`，用 AES-256-GCM 加密写入 `data/secrets/llm-key.enc`；密钥由 `SESSION_SECRET` + 机器指纹（hostname/platform/arch）派生。

- 老版本留在 `.env` 里的明文 Key 会在启动时自动迁移，并清空 `.env` 中的值。
- 换机器后加密文件解不开，需在设置页重新填写（安全换可用性）。
- 接口只返回 `llmKeyConfigured` 与末 4 位掩码；上游报错原文也会先脱敏再返回。

### 6.5 写入与安全

- **原子写入**：先写 `db.json.tmp` 再 `rename`，避免断电留半个文件。
- **串行队列**：同进程内所有写操作排队，避免并发覆盖。
- **自动备份**：每次写入前复制旧库到 `backups/`，超过 20 份删最旧。
- **路径安全**：所有相对路径解析后必须仍在 `data/` 内，否则报错。
- **文件清理**：编辑替换、删除内容时删除旧文件；校验失败时清理刚落盘的上传文件。

### 6.6 蒸馏数据结构（M2）

**distillSources**（资料）

| 字段 | 说明 |
|---|---|
| id | `src_<随机>` |
| fileName / ext / size | 原始文件名、扩展名、字节数（文件名已修正中文编码） |
| filePath | 相对 `data` 的原件路径 |
| textPath | 抽出文本的路径（`uploads/distill/<id>.txt`） |
| status | `pending` / `parsing` / `parsed` / `failed` / `empty` |
| note / error | 解析提示（如「扫描版 PDF」）与失败原因 |
| charCount / knowledgeCount | 抽出字数、原文切块数 |
| factCount / factStatus | 提炼出的词条数、词条整理状态（`pending`/`done`/`empty`/`failed`） |
| createdAt / parsedAt | ISO 时间 |

**factEntries**（事实词条，后台可见可改，对话优先用）

| 字段 | 说明 |
|---|---|
| id | `fact_<随机>` |
| categoryId | 指向 `factCategories` 的分类 id（**不再是写死的 key**） |
| title | 短标题，≤ 40 字，如「演讲比赛三等奖」 |
| content | 具体内容，≤ 240 字，保留比赛名、单位、数字 |
| time | 能看出的时间，如 `2026`，可为空 |
| sourceType | `material`（资料提炼）/ `qa`（问答整理）/ `manual`（手写） |
| sourceId / sourceName | 来源资料 id / 题目 id，以及给人看的来源名 |
| origin | `ai` 或 `user`：`user` 表示你改过或手写过，**重新整理词条时不会被覆盖** |

**factCategories**（分类表：AI 起名、系统归一、用户可管）

| 字段 | 说明 |
|---|---|
| id | `cat_<随机>` |
| label | 分类名，≤ 8 字（如「荣誉」「宠物」「志愿服务」） |
| order | 排序权重，越小越靠前 |
| origin | `seed`（旧数据迁移）/ `ai`（模型起的）/ `user`（你改的或新建的） |

分类不再写死在代码里：AI 提炼时优先复用已有分类，实在不合适才新建；用户可改名、合并、删除（只能删空的），也可以让 AI 一键合并近义分类。

**knowledgeEntries**（资料原文切块，只在词条命中不足时兜底）

| 字段 | 说明 |
|---|---|
| id | `kn_<随机>` |
| sourceType | `material`（资料原文切块）/ `qa`（问答） |
| sourceId | 资料 id 或题目 id，用于同源限流与级联删除 |
| title | 资料名或题目文本（检索时加权） |
| text | 400–600 字的片段 |
| weight | 检索权重：资料 2，问答 3 |
| createdAt | ISO 时间 |

**distillQuestions**（问题）

| 字段 | 说明 |
|---|---|
| id | `q_<随机>` |
| batch | 第几批 |
| question / category | 题目与中文分类（与 dimensionLabel 一致） |
| dimension | 出题维度 key：growth / education / work / skill / interest / value / emotion / health / relation / failure / goal / money |
| status | `unanswered` / `answered` / `skipped` |
| answer | ≤ 4000 字，答题时同时生成一条 `qa` 知识 |
| createdAt / answeredAt | ISO 时间 |

**distillSettings**：`targetCount`（100–2000）、`batchSize`（1–20）、`lastBatch`。

**persona / personaDraft**：同一套结构，字段见 `server/lib/persona.js`。

| 字段 | 说明 |
|---|---|
| identity / addressing | 身份一句话、怎么称呼访客 |
| speaking | `{ sentenceLength, commonWords[], punctuation, emoji, neverSay[] }` |
| emotion | `{ caring, upset, joking }` |
| boundaries | `{ knows, unknown, deflect }` |
| catchphrases | `[{ text, frequency: 高/中/低 }]`，最多 8 条 |
| updatedAt | ISO 时间 |

`personaDraft` 非空表示有「未确认的 AI 草稿」：对话只用 `persona`，点「应用」才覆盖。

---

## 7. 接口与输出协议

### 7.1 已实现接口

公开（无需登录）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/profile` | 站点信息、问候、推荐问题、分类 |
| POST | `/api/chat` | 对话（SSE 流式），限流 10 次/分钟/IP |
| GET | `/api/chat/status` | 当前模型名与是否已配置 key |
| GET | `/api/contents` | 已上架内容列表（支持 `kind`、`q`、`category`、`limit`） |
| GET | `/api/contents/:id` | 单条内容（未上架或已删除返回 404） |
| GET | `/api/download/:id` | 下载附件，使用原始文件名；未上架/已删除同样 404 |
| GET | `/media/covers/<file>` | 封面静态资源 |

后台：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/session` | 登录状态 + 密码是否够安全 + 最短长度要求 |
| POST | `/api/admin/login` | `{ password }`，成功下发 Cookie（失败计数 + 退避 + 全站锁定） |
| POST | `/api/admin/password` | `{ currentPassword, newPassword }`：登录页改密码，写 `.env` 后换发新会话 |
| POST | `/api/admin/logout` | 清除 Cookie，同时让已签发的 token 全部失效 |
| GET | `/api/admin/contents` | 列表（含未上架），支持 `q`/`kind`/`category`/`published`/`sort`/`trash` |
| POST | `/api/admin/contents` | multipart 新建（含 `cover`、`file`） |
| PUT | `/api/admin/contents/:id` | multipart 编辑 |
| PATCH | `/api/admin/contents/:id` | 只改 `published` / `pinned` |
| DELETE | `/api/admin/contents/:id` | 移入回收站（软删除） |
| POST | `/api/admin/contents/:id/restore` | 从回收站恢复（保持未上架） |
| DELETE | `/api/admin/contents/:id/purge` | 彻底删除记录与文件 |
| GET / PUT | `/api/admin/settings` | 站点设置读写；PUT 支持 `llmApiKey`（写入 `.env`）与 `clearLlmKey: true` |
| GET | `/api/admin/backups` | 最近 30 份数据库备份（名称/大小/时间） |
| GET | `/api/admin/backups/:name` | 下载指定备份（文件名白名单） |
| GET | `/api/admin/maintenance/orphans` | 上传目录里没人引用的文件（文件体检） |
| POST | `/api/admin/maintenance/orphans/clean` | 删除上一步列出的孤儿文件 |
| GET | `/api/admin/distill/sources` | 资料列表（含解析状态、词条数、词条整理状态） |
| POST | `/api/admin/distill/sources` | multipart 上传资料，字段名 `material`；上传即解析并整理词条 |
| POST | `/api/admin/distill/sources/:id/reparse` | 重新解析文件（重抽正文 + 重整词条） |
| POST | `/api/admin/distill/sources/:id/facts` | 只重新整理词条（原文不变），返回新词条列表 |
| DELETE | `/api/admin/distill/sources/:id` | 删除资料，同时删除原文切块与词条 |
| GET | `/api/admin/distill/facts` | 词条列表：支持 `sourceId`、`categoryId`、`q`（搜标题/内容/来源）、`sort=category|recent` |
| POST | `/api/admin/distill/facts` | 手动新增一条词条（分类可传名字，不存在会自动建） |
| POST | `/api/admin/distill/facts/batch` | `{ ids, action: delete|move, categoryId? , categoryLabel? }`，最多 200 条 |
| POST | `/api/admin/distill/facts/recategorize` | 让模型重新判一遍现有词条的分类 |
| PATCH | `/api/admin/distill/facts/:id` | 改词条（分类/标题/内容/时间），自动标记 `origin=user` |
| DELETE | `/api/admin/distill/facts/:id` | 删一条词条 |
| GET | `/api/admin/distill/categories` | 分类表 |
| POST | `/api/admin/distill/categories` | 新建分类 `{ label }` |
| PATCH | `/api/admin/distill/categories/:id` | 分类改名 `{ label }` |
| POST | `/api/admin/distill/categories/merge` | 合并分类 `{ fromId, toId }` |
| POST | `/api/admin/distill/categories/tidy` | 让模型把近义分类合并掉 |
| DELETE | `/api/admin/distill/categories/:id` | 删分类（只允许删空的） |
| GET | `/api/admin/distill/questions` | 题目列表（`status`、`dimension` 可筛）+ 进度 + 维度覆盖 + 每题已整理词条数 |
| POST | `/api/admin/distill/questions/batch` | `{ ids, action }`，action 为 `skip` / `reset` / `delete`（最多 200 条） |
| POST | `/api/admin/distill/questions/dimensions` | 给旧题目补维度（模型判定 + 关键词兜底） |
| POST | `/api/admin/distill/questions/:id/facts` | 把一条已答题整理成词条 |
| POST | `/api/admin/distill/questions/generate` | 按维度出一批题（`count` 可覆盖每批题数，上限 20） |
| PATCH | `/api/admin/distill/questions/:id` | `{ answer }` 作答 / `{ skip: true }` 跳过 / `{ reset: true }` 撤销 |
| PUT | `/api/admin/distill/questions/settings` | 目标题数（100–2000）与每批题数（1–20） |
| GET | `/api/admin/distill/persona` | 正式人设 + 是否已有内容 + 待确认草稿 |
| PUT | `/api/admin/distill/persona` | 手动保存人设卡 |
| POST | `/api/admin/distill/persona/draft` | AI 读资料生成草稿（**只写草稿**） |
| POST | `/api/admin/distill/persona/draft/apply` | 把草稿应用为正式人设 |
| DELETE | `/api/admin/distill/persona/draft` | 丢弃草稿 |
| GET | `/api/admin/distill/stats` | 资料 / 词条 / 问题三组统计 + 进度 |

### 7.2 错误格式

```json
{ "message": "给用户看的中文提示" }
```

- 4xx 直接返回业务提示；5xx 统一返回「服务器开小差了，稍后再试」并写日志。
- 未匹配的 `/api/*` 返回 JSON 404，不返回 HTML。

### 7.3 安全检查项（已实现）

**传输与响应头**

- 统一安全响应头：`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`、`X-Frame-Options: DENY`、`Cross-Origin-Opener-Policy: same-origin`、`Permissions-Policy`。
- 生产模式（有 `web/dist`）启用 CSP：`default-src 'self'`、`script-src 'self'`、`frame-ancestors 'none'`、`base-uri 'self'`。为此主题引导脚本拆成独立文件 `public/theme-boot.js`（内联脚本会被 CSP 拦掉）。

**模型 API Key（重点）**

- Key 只存 `data/secrets/llm-key.enc`，AES-256-GCM 加密；密钥 = `SESSION_SECRET` + 机器指纹派生。
- 不再写 `.env` 明文；老版本的 `.env` 明文会在启动时迁移并清空。
- 任何接口都不回传完整 Key，只回 `llmKeyConfigured` + 末 4 位。
- 上游报错文本先脱敏（替换真实 Key 与 `sk-`/`xai-`/`gsk-` 长串）再返回/记日志。
- **改模型服务地址必须重新输入后台密码**（`confirmPassword`）；否则一个被盗的会话就能把 Key 导到攻击者服务器。
- 地址只允许 `http`/`https`，禁止 `file:`/`javascript:`/`data:`，禁止 URL 里带用户名密码。
- **拒绝内网/本机地址**（127/8、10/8、172.16/12、192.168/16、169.254/16、100.64/10、`fc00::/7`、`fe80::/10` 等），并在**保存与每次调用前各校验一次**、解析 DNS 后逐个 IP 复核（防 `公网域名 → 127.0.0.1`）；公网地址必须 HTTPS；`fetch` 用 `redirect: 'error'` 禁止跟随重定向。确实要用本地模型时显式设 `LLM_ALLOW_PRIVATE=1`。
- **后台密码不够安全时（< 12 位 / 常见口令 / 单一字符类），整条模型配置（Key + 地址 + 模型名）禁止修改**，避免"用弱口令登进来把 Key 导走"。
- `confirmPassword` 复用登录那套失败计数与退避，避免这里被当成爆破入口。
- 敏感操作写审计日志 `data/logs/security.log`（登录失败/锁定、确认密码失败、改 Key、改地址、弱密码拦截），单文件 1MB 轮转。

**其他**

- 后台 Cookie：`HttpOnly`、`SameSite=Lax`、`Path=/`，7 天有效；HTTPS 下自动加 `Secure` 与 HSTS。
- **非本机访问必须走 HTTPS**：`http` + 非回环请求直接 403，不让密码/Cookie/Key 明文上路。判据用 Express 的 `request.secure`（受 `trust proxy='loopback'` 约束），**绝不手读 `X-Forwarded-Proto`**——那个头谁都能自己加，手读等于让这道防线失效（v1.2.9 修掉的真实漏洞）。
- 默认**只监听 `127.0.0.1`**，要用局域网需显式 `BIND_HOST=0.0.0.0`（启动会警告）。
- **可选：Node 自己终结 HTTPS**（`lib/tls.js`）。`data/certs/fullchain.pem` + `privkey.pem` 存在即以 HTTPS 启动；启动时自检证书与私钥是否配对、打印域名与到期天数；不匹配则退回 HTTP 并告警，不会出现"服务起来了但每次握手都失败"这种极难排查的状态。启用后隧道/反代只需 TCP 透传。
- 密码比较使用 `crypto.timingSafeEqual`。
- 登录失败限流：同 IP（IPv6 按 `/64` 聚合）15 分钟 10 次锁定；另有**全站失败计数**（40 次 / 15 分钟全员锁定）与**指数退避**（最多 3s），换 IP 也快不起来。
- 退出登录会把内存里的会话代次 +1，**已泄露的 Cookie 立刻失效**；改密码也会让全部会话失效。
- 对话限流：10 次/分钟/IP；另有**每日额度**（全站 800、单 IP 120，可用 `DAILY_CHAT_LIMIT` / `DAILY_CHAT_IP_LIMIT` 覆盖），防止慢速刷量烧额度。
- **后台 AI 调用单独计额度**（默认 400 次/天，`DAILY_ADMIN_AI_LIMIT`），防止后台失守后被用来刷爆 Key。
- `/api/chat/status` 只返回是否已配置 + 模型名，不回传服务地址。
- 上传：扩展名白名单 + 大小上限 + 随机文件名；封面禁止 SVG。
- 封面额外校验：**独立 5MB 上限** + 文件头签名（PNG/JPEG/GIF/WebP/AVIF），失败清理已落盘文件。
- 附件只能通过 `/api/download/:id` 获取；未上架或已删除的内容不能公开下载。
- 正文上限 20000 字，标题 80 字，简介 300 字，标签最多 8 个。
- 备份文件名走白名单正则，阻止 `../` 路径穿越。
- `jumpUrl` 只允许 `http(s)://` 或站内 `/`，阻止 `javascript:`。
- 静态托管只暴露 `web/dist` 与 `/media/covers`；`.env`、`data/`、`server/` 通过 HTTP 取到的都是 SPA 的 HTML，不是文件本体（v1.0.0 已实测）。

### 7.4 对话 SSE 协议（已实现）

```
data: {"type":"delta","text":"我"}
data: {"type":"delta","text":" 最近在弄"}
data: {"type":"meta","general":false,"citations":["c1"],"cards":[{...}],"followups":["...","..."],"sources":[{...}]}
data: {"type":"done"}
```

- 错误：`data: {"type":"error","message":"..."}`，HTTP 仍为 200（流已开）。
- `cards[].code` 与正文里的 `[[c1]]` 对应，前端渲染成上标序号。
- `general`：模型自报"这次用了自己的常识"，前端在回答下面显示一行小字「本回复使用 AI 常识回答」。
- `sources[]` 是回答依据，前端渲染成「依据 N 条」折叠区：
  ```json
  { "code": "c1", "kind": "fact", "title": "演讲比赛三等奖", "label": "荣誉" }
  ```
  `kind` 为 `fact`（事实词条）/ `content`（已发布内容，带 `contentId`，可点开卡片）/ `knowledge`（资料原文片段）。
  **只给标题/问题，不给内容摘要**——依据里的内容可能是资料原文或问答答案，属于隐私，不应该在页面上展示给任何访客。
- 正文会被服务端过滤：`reasoning_content`（模型思考过程）不发给前端。
- 限流触发时返回 429 + JSON `{ message }`；每日额度用完同样 429，但文案不同。
- 单条消息 ≤ 1000 字；只带最近 10 轮上下文。
- 对话历史存在浏览器 localStorage（`chatblog.conversation.v1`，最近 60 条）。

### 7.5 分享链接

`/?q=问题` 进页面自动发送该问题（≤200 字），发送后立即从地址栏移除 `q`，避免刷新重复发送。已有对话历史时不自动发送。

---

## 8. 设计系统

### 8.1 颜色变量

浅色：

| 变量 | 值 | 用途 |
|---|---|---|
| `--bg` | `#FAF9F6` | 页面背景（米白，不用纯白） |
| `--surface` | `#FFFFFF` | 卡片/输入框 |
| `--surface-2` | `#F1EEE7` | 悬停/次级面 |
| `--text` | `#1C1C1C` | 正文 |
| `--text-dim` | `#6B6B6B` | 次要文字 |
| `--line` | `#E5E2DB` | 边框 |
| `--accent` | `#B4552F` | 砖红，链接/强调 |
| `--user-bubble` | `#EEEAE2` | 用户消息气泡 |
| `--sidebar` | `#F5F2EC` | 侧栏背景 |

深色：

| 变量 | 值 |
|---|---|
| `--bg` | `#0F0F10` |
| `--surface` | `#1A1A1B` |
| `--surface-2` | `#232324` |
| `--text` | `#ECECEC` |
| `--text-dim` | `#9B9B9B` |
| `--line` | `#2C2C2E` |
| `--accent` | `#E08A63` |
| `--user-bubble` | `#262628` |
| `--sidebar` | `#151516` |

### 8.2 字体与排版

- 正文：系统字体栈（PingFang SC / Microsoft YaHei 等），15px / 行高 1.9。
- 标题/品牌：衬线栈（Songti SC / SimSun / Noto Serif SC）。
- 公开页内容宽度：对话 780px，首屏 820px；后台内容区最大 980px。
- 圆角：输入框 22–26px，卡片/面板 12px，按钮 8–12px。

### 8.3 动画

- 首屏 → 对话：空状态淡出 + 上移，对话淡入，约 300ms。
- 消息上浮 360ms；卡片/追问 70ms 级联。
- 主题切换 240ms 颜色过渡；首帧禁用，避免闪烁。
- 移动端抽屉 280ms；后台确认弹窗 `scale-in`。
- 全部在 `prefers-reduced-motion: reduce` 下降级为瞬时。

### 8.4 可访问性

- 图标按钮都有 `aria-label`。
- 表单字段用 `<label>` 关联；错误提示用 `role="alert"`。
- 当前导航项标记 `aria-current="page"`；类型选择按钮用 `aria-pressed`。
- 移动端抽屉与隐藏空状态使用 `inert`；Esc 可关闭。
- 统一 `:focus-visible` 描边。

### 8.5 后台视觉规范

- 与公开页共用同一套颜色变量与字体。
- 左侧固定 232px 侧栏；移动端改为顶部横向标签。
- 面板一律「白/深底 + 1px 边框 + 12px 圆角」，不用阴影堆叠。
- 危险操作（删除）用 `#B4322F`，只出现在确认弹窗与删除按钮悬停态。

---

## 9. 里程碑与验收

### 9.1 M0 静态门面（已完成）

范围：项目初始化、设计系统、公开首页空状态、假对话、卡片、追问、深浅主题、移动端抽屉、后台占位页、开发启动脚本。

验收：lint/build 通过，375px 无横滚，控制台无报错，主题与抽屉正常，推荐问题链路通。

### 9.2 M1 数据层与内容后台（已完成，2026-11-10）

范围：

- JSON 数据仓库（内存缓存 + 原子写入 + 备份）
- 后台单密码登录（Cookie 会话、失败限流、默认密码告警）
- 内容上传（按类型动态字段、封面、附件、跳转链接、分类标签）
- 内容管理（列表、搜索、类型/分类/状态筛选、编辑、删除、上架/置顶）
- 附件下载（原始文件名、中文名 RFC 5987 编码）
- 公开只读接口 + 站点设置（公开页问候/自述/推荐问题/页脚改为读后端）
- 一键启动 `start.bat`（含 `dev` 开发模式参数）

### 9.2.1 M1 打磨（已完成，2026-11-11）

正确性与安全：

- [x] 未上架/已删除内容的附件下载返回 404（此前知道 id 仍可下载）
- [x] 封面独立 5MB 上限（此前与附件共用 100MB）
- [x] 封面文件头签名校验，文本改名 `.png` 被拒且不留孤儿文件
- [x] 正文上限 20000 字
- [x] 浏览器标题跟随站点名与内容标题（此前写死「一页 · 对话主页」）

可用性：

- [x] 编辑页「未保存」提示 + 关闭/返回二次确认
- [x] 保存成功回到列表显示「已保存/已发布《…》」
- [x] 分类候选来自设置页（此前写死 5 个）
- [x] 上传进度百分比（XHR）
- [x] 校验失败自动滚动并聚焦第一个出错字段
- [x] 编辑页右侧实时卡片预览
- [x] 列表排序（最新/最早/标题）
- [x] 设置页备份列表与下载

体验：

- [x] 文件支持拖拽上传
- [x] 批量上架/下架/删除/恢复/彻底删除（均带确认）
- [x] 搜索关键词高亮 + 匹配数
- [x] 后台概览页
- [x] 回收站（软删除 + 恢复），彻底删除清理文件
- [x] 列表封面懒加载（`loading=lazy` + `decoding=async`）
- [x] 站内内容详情页 `/p/:id`
- [x] 移动端表单底部固定保存条

验收结果（逐项实测）：

- [x] `npm run lint` 0 警告；`npm run build` 成功
- [x] 假封面（文本改名 png）→ 400，封面目录文件数不变
- [x] 6MB 封面 → 400「封面不能超过 5MB」
- [x] 20001 字正文 → 400
- [x] 软删除 → 默认列表不可见、回收站可见、公开接口不可见；恢复后为未上架
- [x] 彻底删除 → 记录与文件一并清除
- [x] 未上架内容 `/api/download/:id`、`/api/contents/:id` 均 404
- [x] 备份列表 20 份、下载 200、路径穿越 400、未登录 401
- [x] 编辑页预览实时更新、未保存提示、离开确认拦截、保存后提示
- [x] 拖拽图片出现预览；列表封面 `loading=lazy`
- [x] 375px 后台表单无横向滚动，底部保存条可见
- [x] 详情页 `/p/:id` 正常渲染标题/摘要/正文/封面，标题正确
- [x] 全程控制台无报错，用户既有数据未被改动

### 9.3 M2 蒸馏后台（已完成，2026-11-11；v1.1.0 加了词条页）

后台四个标签页：**资料 / 词条 / 问题 / 人设卡**。

功能：

- 资料上传与解析：PDF（`pdf-parse`）、DOCX（`mammoth`）、TXT、Markdown；图片暂只登记文件名
- **事实词条层**：AI 读完资料后提炼成一条条可读的词条，**分类由 AI 起名**、系统归一、用户可改名/合并
- **词条页**：汇总所有来源（资料 / 问答 / 手动）的词条，支持关键词搜索、分类筛选、来源筛选、排序、批量删除、批量改分类、疑似重复提示、分类管理
- 原文切块（400–600 字、重叠 80）保留为检索兜底
- 问题蒸馏按 12 个维度轮流出题，每批覆盖 2–4 个最久没问到的维度
- 人设卡：手写编辑 + AI 草稿（只写 `personaDraft`，确认后才覆盖正式人设）
- 对话注入顺序：**人设 → 事实词条 → 内容卡片 → 原文兜底**；寒暄不注入任何材料

验收（本机实测）：

- [x] 上传 docx → 抽出 258 字 → 整理出 13 条词条（12 个奖项 + 无偿献血）
- [x] 词条页顶部显示 31 条，分类 chips 显示各分类条数，点一下即筛选
- [x] 搜索「献血」→ 1 条；搜索时分类 chips 只显示命中的分类
- [x] 选中「荣誉」→ 8 条，其它分类按钮仍在（可继续切换）
- [x] 从资料页点「看词条」→ 跳到词条页并自动按该资料筛选（13 条）
- [x] 两条同名词条显示「疑似重复 ×2」
- [x] 批量删除 2 条 → `affected: 2`；空分类可删除
- [x] 「重新归类」让模型重判 31 条，改了 11 条，没有新建无意义分类
- [x] 375px 后台四个标签页均可操作，无横向滚动
- [x] `npm run lint` 与 `npm run build` 均 0 警告

OCR 仍未做：扫描版 PDF 与图片只会得到空文本，列表会给出「没解析出文字」提示。

### 9.4 M3 对话打通（核心已完成，2026-11-10）

已完成：

- 检索：中文 bigram + 同义词扩展 + 单字，命中词条/内容/原文三路
- 话题策略：greeting / self / general 三路分流，寒暄与常识问题不注入项目
- 真实模型流式回答：`POST /api/chat`，DeepSeek `deepseek-flash`
- 结构化输出：`⟦META⟧` 切分、内容卡片、2 条追问、`[[cN]]` 上标、**回答依据（sources）**
- 兜底：模型漏标引用 → 按标题补卡片；追问不足 → 补默认问题
- 卡片可下载附件、可跳外链；未上架内容不参与检索
- 限流 10 次/分钟/IP + 每日额度；单条 1000 字；最近 10 轮
- **对话历史存 localStorage，刷新不丢**
- **`/?q=` 分享链接自动发送**

### 9.5 M4 安全加固（已完成，2026-11-11）

- 模型 Key 改为加密存储（AES-256-GCM，机器绑定），`.env` 明文自动迁移并清空
- 改模型地址需二次确认后台密码；默认密码未改时禁止改模型配置
- 生产 CSP + 安全响应头；主题引导脚本改为外部文件以适配 CSP
- 每日对话额度（全站 / 单 IP）
- 安全审计日志
- 27 项对抗式检查全部通过（见 §10 变更记录）

---

## 10. 变更记录

> 规则：每次改动追加一条。必须写清「改了什么」「达到了什么目的」「为什么要改」。

| 日期 | 里程碑 | 改了什么 | 达到了什么目的 | 为什么要改 | 涉及文件 / 验证 |
|---|---|---|---|---|---|
| 2026-11-10 | 需求 | 产品方向从 `SPEC.md` 的「文章式博客」调整为「ChatGPT 式对话首页 + 个人蒸馏后台」；确认前后端分离、JSON 存储、单密码后台、DeepSeek 默认、OCR 暂缓 | 统一后续开发目标，避免照旧文档做出错误方向 | 用户明确表示以最新口述需求为准 | `SPEC.md` 保留；§1、§2、§11 |
| 2026-11-10 | M0 | 初始化 React + Vite + Tailwind；实现公开空状态、假对话、卡片、追问、停止生成、深浅主题、移动端抽屉、后台占位页、开发启动脚本 | 先验证视觉与交互，降低接真实后端后的返工风险 | 用户希望先看到 ChatGPT 风格的个人博客效果 | `web/src/**`；lint/build/preview 验证 |
| 2026-11-10 | M0 修正 | 移动端问候语字号 32→28px 并加 `text-balance`；补充假回答关键词；抽屉加 `inert` 焦点隔离；附件按钮加提示 | 修复 375px 标题断行不美观、演示追问答非所问、键盘可聚焦屏幕外元素 | 实测截图与键盘检查发现问题 | `EmptyState.tsx`、`fakeTransport.ts`、`MobileNav.tsx`、`AppShell.tsx`、`Composer.tsx` |
| 2026-11-10 | 文档 | 新建 `TECHNICAL.md`，写入架构、需求、设计系统、数据/接口计划、里程碑与变更规则 | 让需求、决策、改动可追溯 | 用户要求每次修改都更新技术文档 | `TECHNICAL.md` |
| 2026-11-10 | 版本管理 | 新增 `scripts/snapshot.ps1` 与 `snapshots/`，生成 `v0.1.0-m0` 快照；脚本转 UTF-8 BOM | 每个版本可回滚；避免 PowerShell 5.1 读中文脚本报错 | 用户要求每做完一个版本就保存一次 | `scripts/snapshot.ps1`、`snapshots/v0.1.0-m0-*.zip`（48 文件 / 0.17MB） |
| 2026-11-10 | M1 后端 | 新建 `server/`：Express + multer；JSON 仓库（内存缓存、原子写入、20 份备份轮转）；HMAC Cookie 会话、登录限流；内容 CRUD 与文件归属；公开接口；设置接口 | 让内容、设置、文件真正持久化，后台可用 | M1 目标：数据层与内容后台；SPEC 禁止数据库，改用 JSON | `server/**`；curl + 浏览器实测全部接口 |
| 2026-11-10 | M1 前端 | 新增后台布局与 5 个页面（登录 / 列表 / 上传编辑 / 蒸馏占位 / 设置）；`lib/api.ts` 统一请求；`ProfileProvider` 让公开页读后端设置；类型动态字段配置 | 后台可视化操作，公开页门面文案可在线修改 | 用户要求统一上传窗口、字段随类型变化、模块化便于改动 | `web/src/pages/admin/**`、`components/admin/**`、`lib/api.ts`、`lib/content-kinds.ts` |
| 2026-11-10 | M1 修复 | `/api/admin/session` 不再回传默认密码，改为 `usingDefaultPassword` 布尔；中文文件名按 UTF-8 还原；分类筛选可点击；删除后刷新分类计数；后台导航精确匹配（此前「内容管理」与「上传内容」同时高亮） | 消除密码泄露风险与实际使用 bug | 自查接口响应时发现密码外泄；UI 实测发现中文名乱码与导航双高亮 | `routes/auth.js`、`middleware/upload.js`、`AdminContentsPage.tsx`、`AdminLayout.tsx`；curl 验证文件名与下载头 |
| 2026-11-10 | 一键启动 | 新增 `start.bat`（检查 Node → 装依赖 → 缺 dist 则构建 → 启动 → 2 秒后开浏览器，支持 `NO_BROWSER=1`）；`dev.bat` 改为同时起后端与前端 | 拷到服务器双击即可运行；开发时前后端一起起 | 用户要求一键启动且前端可单独替换 | `start.bat`、`dev.bat`、根 `package.json`；`cmd /c start.bat` 实测 |
| 2026-11-10 | M1 交付 | 生成 `v0.2.0-m1` 快照（不含 `.env`、`data`、`node_modules`）；清理测试数据（保留空库与默认站点信息）；修复快照脚本遗漏清理临时文件 | 交付一个干净可用的 M1 起点，随时可回滚到 M0，且快照不会带出密码与 key | 用户要求每完成一个版本就保存并记录；自查发现快照原先包含 `.env` | `snapshots/v0.2.0-m1-20261110-1427.zip`（86 文件 / 0.24MB）；`data/` 已清空测试内容 |
| 2026-11-10 | 启动脚本合并 | 把 `dev.bat` 合并进 `start.bat`：默认正式模式，`start.bat dev` 进开发模式；正式模式新增「源码比产物新就自动重建」；开发模式等待改用 PowerShell（`timeout` 在无控制台输入时可能报错） | 只需记一个启动文件，避免两份脚本逻辑漂移；也避免改了代码却看到旧构建产物 | 用户提问「dev 也要单独启动吗」后要求「合并成一个」 | 删除 `dev.bat`；`cmd /c start.bat` 与 `cmd /c start.bat dev` 均实测通过 |
| 2026-11-10 | 模型配置 | 设置页新增 API Key 输入（密码框 + 显示/隐藏 + 清除）；服务端把 key 写入 `.env`（保留注释与顺序），只回传掩码；默认模型改为 `https://api.deepseek.com` + `deepseek-flash`（`.env`、`.env.example`、默认库、已有 `db.json` 同步） | 后台能直接配模型，不用手工改配置文件；密钥仍不落数据库 | 用户问「为什么后台没有填 key 的地方」，并要求更换默认模型 | `server/lib/env.js`、`server/services/settings-service.js`、`server/config.js`、`AdminSettingsPage.tsx`、`lib/api.ts`；实测保存/保留/清除/未登录 401，`db.json` 无 key |
| 2026-11-10 | 失误与修复 | 验证密钥时用了 ASCII 编码的测试 JSON，把站点名「pnds的博客」写成了 `??`；已从 `data/backups/db-2026-11-10T08-59-19-063Z.json` 找到原值并用 UTF-8 提交恢复 | 保证用户已有的站点信息与内容不丢 | 自查发现问题；后续所有含中文的测试请求一律用 UTF-8 写文件再提交 | `data/db.json`；`GET /api/profile` 已确认恢复为「pnds的博客」 |
| 2026-11-10 | M3 对话 | 新增 `retrieval-service`（中文 bigram 打分）、`llm-service`（OpenAI 兼容流式、过滤 reasoning）、`chat-service`（提示词、META 切分、卡片与追问兜底）、`POST /api/chat` 与 `/api/chat/status`、限流中间件；前端用 `chatTransport` 替换 `fakeTransport`，卡片支持真实下载/外链，正文 `[[cN]]` 渲染成上标 | 访客提问真正走模型，回答基于后台上传的内容，并附真实卡片 | 用户反馈「很明显没有接入 AI」，要求按第一性原则解决 | 新增 `server/{services,routes,middleware}` 与 `web/src/lib/chatTransport.ts`；删除 `fakeTransport.ts`；curl + 浏览器实测「你好」「最近在做什么」「你昨天吃了什么」 |
| 2026-11-10 | M3 修复 | `req.on('close')` 在请求体读完后立即触发，导致模型调用被当场中断（表现为空回答）；改为监听 `res.on('close')` 且仅在未 finished 时 abort。另加确定性兜底：模型漏写 META/citations 时按标题补卡片、按规则补追问 | 流式回答稳定返回；卡片与追问不再依赖模型“每次都听话” | 真实联调时出现空响应与偶发无卡片，属上游不稳定 | `routes/chat.js`、`services/chat-service.js`；三条问题均实测通过 |
| 2026-11-10 | M3 语气修正 | 提示词新增一条：被直接问「你是 AI 吗」时坦白说是基于本人写过内容的对话版本，不否认；顺带去掉上标前的多余空格 | 既保持人格又不对访客撒谎 | 实测该问题被回答成「不是」，与产品原则冲突 | `services/chat-service.js`、`AssistantMessage.tsx`；实测回复「我是基于 pnds 写过的东西做的对话版本…」 |
| 2026-11-10 | M3 话题策略 | 新增 `detectIntent`（greeting / self / general）；寒暄与常识问题不再注入最新项目；提示词重写为「按问题类型分两类回答」，明确禁止「这不是我写过的内容」这类声明、禁止主动把话题引到项目、打招呼要简短；追问兜底只在「问本人且有卡片」时补；前端文案去掉「只讲我写过的东西」；渲染前裁掉模型多余空行 | 回答像一个正常人，而不是只会念作品的检索器；项目只在合适时才出现 | 用户指出「不要三句不离我的项目」「问好就正常问好」，并要求为后期蒸馏留出承载个人问题的空间 | `services/chat-service.js`、`services/retrieval-service.js`、`AssistantMessage.tsx`、`Composer.tsx`；五条问题逐条实测（你好 / 1+1 / 斐波那契 / 最近在做什么 / 昨天吃了什么） |
| 2026-11-11 | M1 打磨·正确性 | 下载接口校验 `published`/`deletedAt`；封面独立 5MB 上限 + 文件头签名校验（失败清理已落盘文件）；正文 20000 字上限；浏览器标题改由页面用 `useDocumentTitle` 声明 | 补上「知道 id 就能下载未上架附件」「改名伪装成图片」两个真实缺口，并消除标题写死 | 用户要求按第一性原则打磨 M1，先修正确性 | `routes/public.js`、`middleware/upload.js`、`lib/content-kinds.js`、`services/content-service.js`、`lib/use-document-title.ts`；curl + 浏览器实测 |
| 2026-11-11 | M1 打磨·数据 | 删除改为软删除：新增 `deletedAt`、`markContentDeleted`/`restoreContent`/`removeContent`；列表支持 `trash` 与 `sort`；恢复后保持未上架；彻底删除才清理文件 | 误删可恢复，且不会因为一次手滑丢掉附件 | 打磨清单 C5；同时为列表排序（B7）提供后端支持 | `repositories/contents.js`、`services/content-service.js`、`routes/admin-contents.js`；curl 走完 软删→回收站→恢复→彻底删除 |
| 2026-11-11 | M1 打磨·后台体验 | 新增概览页；列表加排序/批量操作/关键词高亮/匹配数/回收站视图/懒加载；编辑页加实时卡片预览、上传进度（XHR）、未保存提醒、字段定位、设置页分类联动；文件支持拖拽；设置页加备份列表与下载；新增 `/api/admin/backups` | 后台从「能用」提升到「顺手」，并给出备份入口 | 打磨清单 A/B/C 全部，用户确认「全做」并强调不要越改越乱 | `pages/admin/**`、`components/admin/**`、`lib/api.ts`、`server/routes/admin-backups.js`；浏览器逐项实测 |
| 2026-11-11 | M1 打磨·公开页 | 新增站内内容详情页 `/p/:id`，卡片弹窗增加「详情页」入口；列表封面懒加载 | 卡片没有外链时也有确定去处，不再只能在弹窗里读 | 打磨清单 C7 | `pages/PublicContentPage.tsx`、`components/cards/**`、`App.tsx`；实测详情页渲染与标题 |
| 2026-11-11 | M1 打磨修正 | 批量删除/彻底删除补上确认弹窗；浏览器标题改为页面各自声明（此前 Provider 会覆盖详情页标题） | 避免批量误操作与标题互相覆盖 | 实测发现批量删除无确认、详情页标题被覆盖 | `AdminContentsPage.tsx`、`ProfileProvider.tsx`、`PublicChatPage.tsx`、`PublicContentPage.tsx`；复测通过 |
| 2026-11-11 | M2 后端·解析与知识 | 新增 `parsers/material-parser.js`（pdf-parse v2 `PDFParse` + `pageJoiner:''`、mammoth、TXT/MD、图片占位）、`knowledge-service.js`（400–600 字分块 / 重叠 80 / 资料权重 2 / 问答权重 3 / 按来源级联删除）、`distill-sources-service.js`（上传即解析，抽出的文本单独存 `uploads/distill/<id>.txt`，不塞进 db.json） | 让「上传一份文件」真正变成可检索的知识，而不是只存一个文件名；长文放文件里避免 db.json 被撑大 | 蒸馏的地基是知识，知识必须先有可靠的切分与来源追踪 | 新增 3 个服务 + 1 个解析器；实测 TXT/DOCX/PDF 解析与重新解析、删除级联 |
| 2026-11-11 | M2 后端·出题与答题 | 新增 `distill-questions-service.js`：读资料 + 已发布内容出题（JSON 模式、双端去重、按批入库）、答题同时写一条 `qa` 知识、跳过/撤销、目标题数与每批题数设置、`getProgress`；`distillSettings` 落库 | 「答一题存一题、随时停下、下次接着答」成立：进度完全由数据决定，不依赖浏览器 | 用户明确要求答 1000–2000 题不能从头再来 | 新增服务 + `db.js` 默认结构；实测生成 3 题、答 1 题、刷新后进度仍在 |
| 2026-11-11 | M2 后端·人设 | 新增 `lib/persona.js`（结构收敛、`formatPersonaForPrompt`）、`persona-service.js`（读写 / AI 草稿 / 应用 / 丢弃）；`db.js` 增加 `personaDraft` 并用 `normalizePersona` 收敛旧数据 | 人设可以有 AI 草稿但不会悄悄覆盖手写内容；提示词只注入填了的字段 | 用户要「蒸馏我的语气习惯」，直接让 AI 改写正式人设风险太大 | 新增 2 个文件 + `db.js`；实测草稿→应用→丢弃全流程 |
| 2026-11-11 | M2 接入对话 | `chat-service` 改为「内容块 + 知识块 + 人设段落」三段拼提示词；知识块编号接在内容块之后，但**只有内容块能挂卡片**；寒暄不注入知识；`retrieveKnowledge` 同源最多取 2 段防单份资料占满上下文 | 问「你平时折腾什么」时回答来自蒸馏资料，而不是靠模型编；同时不破坏原有 `⟦META⟧` 协议与兜底 | M2 的价值必须体现在对话里，否则只是后台里的一个孤岛 | `services/chat-service.js`、`services/retrieval-service.js`；SSE 实测回答内容与上传资料一致 |
| 2026-11-11 | M2 修复·JSON 截断 | 新增 `requestJsonCompletion`：JSON 解析失败就把 `max_tokens` 翻倍重试一次（上限 8000）并记日志；人设与出题都改用它（预算 3000 起） | 消除「生成人设草稿偶发失败」——带推理的模型 `reasoning_tokens` 也算在 `max_tokens` 里，预算偏小会把 JSON 截断 | 实测第一次生成草稿直接报「模型返回的内容无法解析」，第二次同样输入却成功，属预算问题而非模型不稳定 | `services/llm-service.js`、`persona-service.js`、`distill-questions-service.js`；连续两次生成草稿均成功 |
| 2026-11-11 | M2 前端 | 新增 `types/distill.ts` 与 20 个蒸馏接口；`/admin/distill` 从占位页重写为三个标签页，拆成 `DistillFields`（卡片/输入/词条输入/按钮）+ `DistillSourcesPanel` + `DistillQuestionsPanel` + `DistillPersonaPanel`；顶部四个统计；侧栏徽标改 M2 | 后台三块能力各自独立成模块，以后单独改一块不用碰另外两块；操作后统计同步刷新 | 用户要求模块化、避免牵一发动全身；占位页已经不能承载真实功能 | 新增 5 个前端文件 + `lib/api.ts`；浏览器实测上传/出题/答题/草稿/移动端/浅色主题 |
| 2026-11-11 | M2 交互细节 | 答题输入按题目 id 记草稿（切题不闪旧内容）、答完自动跳下一题、题目列表可点选、资料列表显示字数与知识条数、`DistillCard` 标题与右侧操作不换行、`set-state-in-effect` 警告改为请求回调式写法 | 连续答题的手感连贯；lint 回到 0 警告 | 第一版实现里切题会闪一下上一题的答案，且 oxlint 报了 4 处 `set-state-in-effect` | `components/admin/distill/**`、`AdminDistillPage.tsx`；`npm run lint` 0 警告 |
| 2026-11-11 | M2 交付 | 打快照 `v0.4.0-m2`（110 文件 / 0.33MB）；根 `package.json` 版本号 0.2.0 → 0.4.0；清空所有测试用的资料、题目、知识、草稿（用户原有 2 条内容与 4 个上传文件未动） | 交付可回滚的 M2 起点，且运行库里没有测试噪声 | 用户要求每完成一个版本保存一次并记录；测试数据必须彻底清掉 | `snapshots/v0.4.0-m2-20261111-1002.zip`；`data/db.json` 已确认 distill 相关三表为空、persona 为空 |
| 2026-11-11 | M2.1 词条层 | 新增 `factEntries` 数据层与 `fact-service`（AI 提炼 / 增删改 / 按来源级联 / 统计 / 摘要）、`lib/fact-categories.js`；上传流程改为「解析 → 切块兜底 → 提炼词条」并把 `factCount`/`factStatus` 写回资料；新增 5 个词条接口与「只重新整理词条」接口 | 让「上传了什么、AI 整理出了什么」在后台一眼可见、逐条可改可删；对话有了结构化事实可用 | 用户上传 `杜佳兴.docx`（12 个奖项 + 无偿献血）后问「你得什么奖」被答成「没得过」，根因是长文切块检索命中不了 | `server/lib/fact-categories.js`、`services/fact-service.js`、`services/distill-sources-service.js`、`routes/admin-distill.js`、`repositories/db.js`；实测该文件提炼出 13 条词条 |
| 2026-11-11 | M2.1 检索修复 | `tokenize` 增加单字 token（带虚词停用表）；新增 `SYNONYM_GROUPS`（奖/获奖/奖学金、经历/履历、献血/公益 等 15 组）并做 `expandTokens`；`retrieveContents` 与 `retrieveKnowledge` 都改用扩展后的 token；新增 `retrieveFacts`（标题 ×6、分类 ×4、内容 ×2、时间 ×1，同源最多 4 条） | 「你得什么奖」现在能命中标题写着「演讲比赛三等奖」的词条，而不再 0 命中 | 中文两字切词有盲区：问句切出「你得/得什/什么/么奖」，资料写的是「一等奖/获奖」，没有共享片段；单字「奖」原来被直接丢掉 | `services/retrieval-service.js`；同一问题修复前答「没得过」，修复后列出真实奖项 |
| 2026-11-11 | M2.1 对话注入 | `chat-service` 改为四段注入：词条块（最前，无卡片）→ 内容块（可挂卡片）→ 原文块（兜底）；词条命中时原文只补 2 段；提示词新增「按词条说具体信息」「列清单最多举 3–4 个代表」两条规矩 | 回答既具体又不刷屏；卡片仍然只来自真实内容，不会被词条污染 | 修好检索后模型把 12 个奖项全念了一遍，超过「150 字」的说话规矩 | `services/chat-service.js`；「你得什么奖」实测输出 4 个代表 + 「还有几个就不一一念了」 |
| 2026-11-11 | M2.1 出题维度 | 新增 `lib/question-dimensions.js`（12 个维度 + 每个维度的引导语 + `pickDimensions`）；出题改为「按维度分配题数」并把 `dimension` 落到题目；prompt 明确要求覆盖生活/家庭/感情/健康/钱/失败，且不许只问代码；`getProgress` 返回 `dimensions` 覆盖情况 | 出题从「围着作品打转」变成「蒸馏整个人」，并且能看出还有哪些方面没问到 | 用户反馈问题全是代码相关，个人与生活问题一个没有，无法全面蒸馏 | `lib/question-dimensions.js`、`services/distill-questions-service.js`；实测 6 题分布为 成长 2 / 教育 2 / 工作 2 |
| 2026-11-11 | M2.1 前端 | 新增 `DistillFactList`（按分类分组、行内编辑、行内二次确认删除、手动新增）、`lib/fact-categories.ts`；资料面板改为可展开看词条 + 「重新整理词条」按钮；顶部统计「知识条数」改成「词条」；问题面板增加维度覆盖面板与题面维度标签 | 后台能直接回答「这份资料整理出了哪些词条」，并按需改删 | 用户明确要求「已上传的资料应该清晰显示整理出哪些词条，词条可单独删除或修改」 | `components/admin/distill/DistillFactList.tsx`、`DistillSourcesPanel.tsx`、`DistillQuestionsPanel.tsx`、`types/distill.ts`、`lib/api.ts`；浏览器实测增删改与统计联动 |
| 2026-11-11 | M2.1 说话精度 | 提示词补一条：词条里没写的细节一律不加（例如只写了「参加过无偿献血」，就不许补「证书还在」「献过三次」） | 避免修好检索后又冒出"有理有据的编造" | 实测问「你献过血吗」回答了「参加过无偿献血，证也在」，后半句材料里没有 | `services/chat-service.js`；同问题复测输出「献过，无偿献血，这个我确实参加过」 |
| 2026-11-11 | M2.1 交付 | 打快照 `v0.4.1-m2-facts`（0.35MB）；根 `package.json` 0.4.0 → 0.4.1 | 词条层可回滚到 v0.4.0 | 用户要求每完成一次改动就快照 | `snapshots/v0.4.1-m2-facts-20261111-1202.zip` |
| 2026-11-11 | v0.9.9 基线 | 动手前先把当前状态打包成 `蒸馏博客v0.9.9.zip` 放到项目根目录（同时保留 `snapshots/v0.9.9-*.zip`） | 大改动前留一个可以整体回退的基线 | 用户要求"先把此版本打包成压缩包放到该目录下命名为蒸馏博客v0.9.9" | `蒸馏博客v0.9.9.zip`（0.35MB） |
| 2026-11-11 | M3 收尾·历史与分享 | `useChat` 初始化从 localStorage 恢复、每次变化落盘、`resetChat` 清空；新增 `lib/chat-storage.ts`（最多 60 条、单条截断 4000 字、读写全 try/catch）；`/?q=` 进页面自动发送（≤200 字）并从地址栏移除参数 | 刷新不再丢对话；问题可以直接分享成链接 | 对话是主入口，刷新丢历史是最容易被访客感知的缺陷；分享链接是最基础的传播方式 | `hooks/useChat.ts`、`lib/chat-storage.ts`、`pages/PublicChatPage.tsx`；浏览器实测刷新后历史仍在、分享链接自动提问且地址栏被清理 |
| 2026-11-11 | 回答溯源 | `chat-service` 新增 `buildSources`，meta 事件多带 `sources[]`（fact / content / knowledge 三类，含标题、分类标签、摘要、contentId）；前端 `AssistantMessage` 增加「依据 N 条」折叠区，内容类可点开卡片 | 访客能看到回答是从哪条词条/哪段资料来的，不再是"凭空说" | 用户要求"回答溯源做一下" | `services/chat-service.js`、`types/chat.ts`、`lib/chatTransport.ts`、`components/chat/AssistantMessage.tsx`；实测 meta 返回 2 条依据并正确渲染 |
| 2026-11-11 | 安全·Key 加密 | 新增 `lib/secret-box.js`（AES-256-GCM）、`services/secret-store.js`；Key 从 `.env` 明文改为 `data/secrets/llm-key.enc`，启动时自动迁移并清空 `.env`；`llm-service` 改从加密存储读；上游报错文本脱敏 | 项目目录、备份、快照被转发时都带不走可用的 Key | 用户明确要求"apikey 千万不能上线后被别人破解" | `lib/secret-box.js`、`services/secret-store.js`、`services/settings-service.js`、`services/llm-service.js`、`index.js`；实测启动日志「已把 .env 里的模型 Key 迁移到加密存储」，`.env` 中 `LLM_API_KEY=` 为空，聊天仍正常 |
| 2026-11-11 | 安全·防 Key 外流 | 新增 `lib/url-guard.js` 与二次确认：改 `baseUrl` 必须带 `confirmPassword`；地址只允许 http/https、禁止带账号密码；默认密码未改时整条模型配置禁止修改；新增 `middleware/security-headers.js`（CSP + 安全头）、`lib/security-log.js`（审计）；主题引导脚本拆成 `public/theme-boot.js` 以适配 CSP | 堵住"偷到一个会话就能把 Key 导到攻击者服务器"和"用默认密码登进来导 Key"两条真实路径；CSP 削弱 XSS 偷会话的可能 | 会话被盗 + 可改 baseUrl = Key 直接外泄，这是最危险的组合 | `lib/url-guard.js`、`services/settings-service.js`、`middleware/security-headers.js`、`lib/security-log.js`、`web/index.html`、`web/public/theme-boot.js`；守卫单测 4 条全拦截，浏览器控制台无 CSP 报错 |
| 2026-11-11 | 安全·额度 | 新增 `services/quota-service.js`：全站每日 800 次、单 IP 每日 120 次（可配置），在开流前判断，超限 429 | 防止公网被慢速刷量把模型额度烧光 | 原来只有每分钟 10 次，一天跑满可达 1.4 万次 | `services/quota-service.js`、`routes/chat.js` |
| 2026-11-11 | M2 增强·异步词条 | 资料上传改为「解析 + 切块后立即返回」，词条整理 `setTimeout` 后台跑；`inflight` 防重复触发；启动时 `resumePendingFactJobs()` 续跑上次未完成的；前端在有 `pending` 时每 2.5s 轮询资料列表 | 上传大文件不再卡在"转圈 30 秒"；关掉服务也不会让资料永远停在「正在整理词条」 | 词条整理要调模型，同步等待会让上传体验很差 | `services/distill-sources-service.js`、`index.js`、`components/admin/distill/DistillSourcesPanel.tsx` |
| 2026-11-11 | M2 增强·问答转词条 / 批量 / 补维度 | 新增 `extractFactsFromAnswer` 与 `POST /questions/:id/facts`；`POST /questions/batch`（跳过/撤销/删除，删除级联清知识与词条）；`POST /questions/dimensions`（模型判定 + 关键词兜底）；`GET /questions` 支持 `dimension` 过滤；题目 DTO 增加 `factCount` | 已答的题能沉淀成词条参与对话；题目多了可以筛选和批量处理；旧题补上维度后维度覆盖才准确 | 用户要求"v0.6 蒸馏好用"这些点 | `services/fact-service.js`、`services/distill-questions-service.js`、`routes/admin-distill.js`、`lib/api.ts`、`types/distill.ts`、`components/admin/distill/DistillQuestionsPanel.tsx`；实测补维度 10 条、某问答提炼出 3 条词条、按维度筛选返回 2 条 |
| 2026-11-11 | 对抗式检查 | 用脚本跑 27 项：未登录访问 6 个后台接口、已登录可访问、词条空标题/不存在 id、批量 ids 非数组/超量截断、整理不存在的题、聊天空消息/角色错误、`/.env` `/data/db.json` `/data/secrets/llm-key.enc` `/server/config.js` 静态泄露、备份路径穿越、不存在的内容、设置接口不回传明文 Key | 确认没有"能通过 HTTP 直接拿到密钥或数据文件"这类低级洞 | 用户要求"对抗式检查是否还有其他 bug" | 27 项全部 PASS（见本轮汇报） |
| 2026-11-11 | 检查后修复 | 撤销单题 / 批量撤销时同时删除该题的问答词条；批量操作的 `affected` 改为真实命中数（原来把不存在的 id 也算进去）；分享链接即使已有历史也照发一次；移动端输入框 16px 防 iOS 自动缩放；侧栏徽标 M1/M2 → v1.0 | 消除孤儿词条继续影响回答、批量结果虚高、分享链接在已有对话时不生效三个问题 | 对抗式检查与真机回归时发现 | `services/distill-questions-service.js`、`pages/PublicChatPage.tsx`、`components/chat/Composer.tsx`、`MobileNav.tsx`、`AdminLayout.tsx`；批量传入不存在 id 返回 `affected:0` |
| 2026-11-11 | v1.0.0 交付 | 打快照 `v1.0.0`（125 文件 / 0.73MB）并复制成项目根目录 `蒸馏博客v1.0.0.zip`；已确认包内不含 `.env`、`data/`、`secrets` | 交付可回滚的正式版本，且压缩包不带任何密钥与运行时数据 | 用户要求"版本直接到 v1.0.0"并打包 | `蒸馏博客v1.0.0.zip`、`snapshots/v1.0.0-*.zip` |
| 2026-11-11 | v1.1 词条独立成页 | 蒸馏后台从 3 个标签变 4 个：资料 / **词条** / 问题 / 人设卡；词条页汇总所有来源（资料、问答、手动），支持搜索（标题+内容+来源）、分类筛选、来源筛选、排序（分类/最近修改）、批量删除、批量改分类、疑似重复提示、行内编辑；顶部「词条」数字可点直接跳过去 | 词条原本散在各份资料里，想找一条得先想起它来自哪个文件；集中一页后能搜、能按类看、能批量处理 | 用户明确要求"词条单拎出来一个页面与资料答题人设卡同级，所有地方整理到的词条都放这个页面下" | 新增 `DistillFactsPanel.tsx`；`AdminDistillPage.tsx`、`types/distill.ts`、`lib/api.ts`；实测搜索/筛选/批量/重复提示全部生效 |
| 2026-11-11 | v1.1 分类体系 | 分类从「代码里写死的 12 个 key」改成数据库里的 `factCategories` 表：AI 提炼时优先复用已有分类、不合适当场新建（2–4 字）；新增分类管理（改名/合并/删除空分类/AI 合并近义分类）与「重新归类」；`factEntries.category` 改为 `categoryId`；启动时幂等迁移旧数据 | 满足"分类由 AI 按内容自动决定"，同时不会因为同义命名把分类打散 | 用户提出"应该根据用户回答的问题 AI 自动分类，不要上来就设置这些类别"，并确认采用"AI 起名 + 分类表归一 + 可改名合并" | 新增 `fact-migration.js`；重写 `fact-service.js`、`services/fact-categories.js`；`db.js`、`chat-service.js`、`retrieval-service.js`、`routes/admin-distill.js`；迁移 31 条词条、重新归类改了 11 条 |
| 2026-11-11 | v1.1 资料页收敛 | 资料页不再内嵌词条编辑，展开只显示"整理出 N 条词条 + 去过词条页管理"，每行加「看词条」按钮（跳转并自动筛该来源）；删除只在这里保留解析/重整/删除三个动作 | 编辑逻辑只留一份，不会出现"两处都能改、改完不一致" | 与上一条配套，避免同一个词条有两个入口 | `DistillSourcesPanel.tsx`；删除 `DistillFactList.tsx`、`lib/fact-categories.ts`；实测点「看词条」跳转后显示该资料的 13 条 |
| 2026-11-11 | v1.2 常识可答 | 提示词把两类分流（"与本人相关 / 无关"）改成四类（你身上的事 / 外面的世界 / 混合 / 都无关），判定标准从"句子里有没有你"改成"问的是谁的事"；混合问题要求拆开答；新增「不许解释自己机制」「常识不硬报精确数字」两条规矩；META 增加 `general` 字段（放在第一位） | 「你家乡有啥好东西」这类问题能用常识回答，不再答成"我没写过、不敢给你列" | 用户指出潍坊风筝属于常识，不该因为没上传过就拒答 | `services/chat-service.js`；实测「你的家乡有啥好东西」→ 讲风筝/年画/肉火烧/朝天锅，`general:true`；「什么是光合作用」→ 正常解释，`general:true`；「你昨天晚饭吃什么」→ 仍是「没写过」，`general:false` |
| 2026-11-11 | v1.2 常识标注 | 新增一行小字「本回复使用 AI 常识回答」，渲染在回答正文下方（不进正文）；`meta` 事件多带 `general`；历史消息持久化时保留该标记 | 让人知道这段是 AI 常识而非本人事实，同时不破坏"像人说话"的语感 | 用户要求"可在回复的句子下面一行小字" | `AssistantMessage.tsx`、`types/chat.ts`、`lib/chatTransport.ts`、`hooks/useChat.ts`、`lib/chat-storage.ts`；浏览器实测小字出现在回答下方 |
| 2026-11-11 | v1.2 依据脱敏 | `buildSources` 不再返回 `excerpt`；前端依据区只显示「类型标签 + 标题/问题」，去掉内容摘要行 | 问答答案、资料原文里的私人内容不会再通过「依据」暴露给访客 | 用户要求"依据不要显示出回答的内容，只显示问题即可，有些回答涉及隐私" | `services/chat-service.js`、`types/chat.ts`、`AssistantMessage.tsx`；实测依据只显示「生活 · 老家潍坊」 |
| 2026-11-11 | 配置模板清理 | `.env.example` 重写：密码改成 `change-me`（原来写的是真实密码，等于把密码随项目一起发出去）、补上 `DAILY_CHAT_LIMIT` / `DAILY_CHAT_IP_LIMIT` / `MACHINE_SECRET`、注明 `LLM_API_KEY` 已废弃改为加密存储、说明 `.env` 与模板的分工 | 模板恢复"只有键名没有秘密"的初衷；换机器时照着模板就能配齐 | 用户问「一个 .env 一个 .env.example 为啥分开」，顺手发现模板里带真实密码且内容过时 | `.env.example`；本次未改代码逻辑 |
| 2026-11-11 | v1.2.2 密码即时生效 | `config.js` 把 `ADMIN_PASSWORD` 常量换成 `getAdminPassword()`：按 `.env` 的 mtime 缓存判断是否被改过，改完保存立刻生效；`.env` 里该行为空时沿用上一次的值（避免手滑写空退回默认密码）；`lib/auth.js` 新增 `deriveSessionKey`，`session.js` 用「会话密钥 + 当前密码」派生签名密钥 | 改密码不用重启服务，并且旧 Cookie 会当场失效、强制重新登录，别人捡到的旧会话也一起作废 | 用户反馈「密码我改了但是为什么没有生效」：实测磁盘 `.env` 仍是旧值（改动没保存），而运行中的进程是 14:01 启动的，`.env` 15:44 才改，且旧会话 Cookie 有效期 7 天、与密码无关，所以即使改了也看不出变化 | `server/config.js`、`server/lib/auth.js`、`server/services/session.js`、`server/routes/auth.js`、`server/services/settings-service.js`、`server/index.js`、三处前端提示文案；脚本实测 9 项全通过（旧密码登录 200 → 改 `.env` → 旧 Cookie 失效 → 旧密码 401 → 新密码 200 → 还原后原密码 200，`.env` 逐字节还原） |
| 2026-11-11 | v1.2.3 文件体检 | 新增 `services/storage-audit.js` 与 `/api/admin/maintenance/orphans`（查）+ `/orphans/clean`（清）：按 db 里的引用算出没人用的上传文件；启动时只提示不自动删；设置页新增「文件体检」卡片，可一键清理 | 上传目录不再悄悄堆积垃圾文件；漏清的附件有了正经出口，也不必手翻 `data/uploads` | 体检发现 `data/uploads/files/mwbgfkaa…txt`（277B）没有任何内容引用——之前的"彻底删除"在某些路径上没清干净 | `server/services/storage-audit.js`、`server/routes/admin-maintenance.js`、`server/index.js`、`web/src/types/content.ts`、`web/src/lib/api.ts`、`pages/admin/AdminSettingsPage.tsx`；实测查 1 条 → 清理 1 条 → 再查 0 条，蒸馏的两个文件与全部数据未受影响 |
| 2026-11-11 | v1.2.4 对话手感 | 输入框去掉那个点不动的回形针；回答下方新增「复制 / 重新生成」（复制带非 HTTPS 兜底，重新生成复用 `regenerateLast`，只有最后一条回答才给按钮）；`useChat.retryLast` 更名 `regenerateLast` 并兼顾重试与重跑 | 界面上不再有"点了没反应"的假按钮；回答可以复制走、不满意可以原地重问 | 自查清单 A3/A4：回形针是 `aria-disabled` 占位，复制与重新生成是对话类产品的基本操作 | `components/chat/Composer.tsx`、`AssistantMessage.tsx`、`ChatView.tsx`、`hooks/useChat.ts`、`PublicChatPage.tsx`；浏览器实测「复制」变「已复制」、「重新生成」出现在最后一条回答下 |
| 2026-11-11 | v1.2.4 会话失效 | `lib/api.ts` 统一拦截：后台业务接口返回 401 时带上当前地址跳 `/admin/login?next=…`（登录接口本身 401 不跳，避免盖掉"密码不正确"）；上传用的 XHR 同样处理 | 改完 `.env` 里的密码后，后台旧页面下一次操作就会被送回登录页，不再是满屏"登录已失效"却不知道去哪登录 | 配合 D46：密码一改旧 Cookie 全废，但前端原来只把 401 当普通业务错误 | `web/src/lib/api.ts`；实测改密码后在后台点「内容管理」→ 自动跳到 `/admin/login?next=%2Fadmin%2Fcontents`，`.env` 已逐字节还原 |
| 2026-11-11 | v1.2.4 分享预览 | `index.html` 增加 `og:*` / `twitter:*` 占位符，由 `server/index.js` 在返回页面时注入站点名与简介（含 `og:url`）；模板按 mtime 缓存，重新构建后自动换新 | 分享链接到微信/群里能看到正确标题与摘要，不再是写死的旧标题；也不影响"改完前端不重启也能生效" | 用户专门做了 `/?q=` 分享链接，但爬虫不执行 JS，标题与摘要必须服务端先写好 | `web/index.html`、`server/index.js`；实测 `/` 与 `/admin` 都返回 `<title>pnds的博客</title>` 与正确 `og:description`，引用的新哈希 JS/CSS 均 200 |
| 2026-11-11 | v1.2.4 出题更全面 | `pickDimensions` 每批从"最多 4 个维度（默认 3）"改为"至少 4 个、最多 6 个"；出题提示词新增「题型要交替：回忆 / 二选一 / 假设 / 观点 / 细节 / 对比 / 列举，同批至少 3 种」与「不许预设作者的家庭与经历（不要写"你弟弟"）」；进度条达成目标后提示可调高继续 | 一批题不再清一色问同一类事，也不再凭空假设作者有某个亲属；目标是 1000 题时仍能一直往下出 | 用户反馈"不要一次只是同样类型的问题，要包含方方面面"；实测新批次还出现了「你跟你弟弟」这种预设存在的关系，已加规则并删掉那条题 | `lib/question-dimensions.js`、`services/distill-questions-service.js`、`components/admin/distill/DistillQuestionsPanel.tsx`；实测新生成 10 题覆盖 兴趣 3 / 情绪 3 / 健康 2 / 人际 2，题型含二选一与列举 |
| 2026-11-11 | v1.2.4 首屏瘦身 | `App.tsx` 改路由级懒加载：后台六个页面 + 登录页 + 内容详情页 + 404 全部拆成独立 chunk，首页对话保持同步引入，`Suspense` 用一行灰字占位；顺带把后台侧栏写死的「v1.0」和概览页的「蒸馏（M2 开放）」改掉 | 访客只看首页时不必下载整个后台：主包 431.84KB → 309.06KB（gzip 126.59KB → 97.63KB），少下约 29% | 自查清单 D1，用户确认"不影响使用就做" | `web/src/App.tsx`、`components/admin/AdminLayout.tsx`、`pages/admin/AdminOverviewPage.tsx`；`npm run build` 产物确认后台各自分包（蒸馏页 58KB、编辑页 20KB 等），浏览器实测首页与后台均正常 |
| 2026-11-11 | v1.2.5 内容库 | 新增公开页 `/contents`（`PublicContentsPage`）：列出所有已上架内容，支持关键词搜索（标题/简介/分类/标签）与类型筛选（前端过滤），卡片复用对话里的 `ContentCard`，点开进 `/p/:id`；侧栏「内容」从死按钮改成真入口（含激活态），删掉「搜索对话」「关于」两个占位按钮，移动端抽屉同步，并去掉「v1.0」角标 | 访客能在对话以外按自己的方式翻内容；侧栏不再有三处"点了没反应" | 用户选择"只保留内容并做成真页面"；同一批里已经因为同样的理由删掉了输入框的回形针 | `pages/PublicContentsPage.tsx`、`App.tsx`、`lib/api.ts`（`fetchPublicContents`）、`components/layout/Sidebar.tsx`、`MobileNav.tsx`；浏览器实测：空态、1 条内容渲染卡片、搜索命中/不命中、点卡片跳详情页标题正确；临时数据已 purge，内容数回到 0 |
| 2026-11-11 | v1.2.6 安全加固·凭据链 | ① `lib/password-policy.js` 新增密码强度判定（≥12 位、非常见口令、≥2 类字符），首次启动若无 `ADMIN_PASSWORD` 自动生成 24 位随机密码并写回 `.env` + 控制台打印；② 模型配置的闸门从"是否等于 admin123"改为"密码够不够安全"；③ `session.js` 登录失败改为 IP（IPv6 按 /64 聚合）+ 全站计数 + 指数退避（≤3s），并补齐 `login_failed` / `login_locked` 审计；④ `confirmPassword` 复用同一套校验与退避；⑤ `url-guard` 真正启用私网拦截 + 公网强制 HTTPS + 保存与每次调用双重校验 + DNS 解析后复核 + `redirect:'error'`；⑥ 默认只监听 `127.0.0.1`，非回环 http 请求拒绝下发 Cookie，HTTPS 下加 HSTS | 把"猜中密码 → 改地址 → 导走 Key"这条路从两头堵死：密码猜不动、地址改不了 | 对抗式审查发现 9 条问题，其中 CRITICAL 1 条、HIGH 3 条全部指向凭据外泄；用户确认全部修复 | 新增 `lib/password-policy.js`；改 `config.js`、`services/session.js`、`services/settings-service.js`、`lib/url-guard.js`、`lib/auth.js`、`services/llm-service.js`、`services/quota-service.js`、`routes/auth.js`、`routes/admin-settings.js`、`routes/chat.js`、`middleware/security-headers.js`、`index.js`、`.env.example`、`start.bat`、前端 6 处文案/类型；实测：弱密码下改模型 403、87 段私网/HTTP/不可解析地址全部 400、强密码 + 正确确认 200、错误确认 403 且记审计、退出登录旧 Cookie 401、失败第 3 次起延迟 340ms、`netstat` 仅 `127.0.0.1:8787` |
| 2026-11-11 | v1.2.6 安全加固·其余 | 后台 AI 调用改用独立预算 `takeAdminAiQuota()`（默认 400 次/天，`DAILY_ADMIN_AI_LIMIT`）；`/api/chat/status` 不再回传 `baseUrl`；退出登录把内存会话代次 +1、token 带上代次，已泄露 Cookie 立刻失效；`security.log` 现在真的会写登录失败 | 后台失守后也刷不爆 Key 余额；公开接口不再泄露私有网关地址；退出登录是"真退出" | 审查第 5–9 条（MEDIUM/LOW）：后台蒸馏接口无额度、status 泄露地址、登录失败零审计、会话无法撤销 | `services/quota-service.js`、`services/llm-service.js`、`lib/security-log.js`（补掉死分支使用）、`lib/auth.js`、`services/session.js`、`routes/chat.js`；实测 `/api/chat/status` 只返回 `configured` + `model`，`security.log` 出现 `login_failed` 计数 |
| 2026-11-11 | v1.2.7 密码阈值可配 | 密码最短长度从写死的 12 改为读 `MIN_ADMIN_PASSWORD_LENGTH`（下限 6，默认仍 12）；本机 `.env` 设为 6 并按用户要求把密码改成指定的 11 位字符串 | 用户能按自己的习惯设密码，同时产品默认仍是 12 位 | 用户明确要求"限制最低 6 位就行，就用我跟你说的那个"。⚠️ 这条实质上放松了审查第 1 条（CRITICAL）的强度：该密码是键盘主行连排（具体值只存在 `.env` 里，本文档不记录），属于字典早期就会命中的模式；其余防护（IPv6 /64 聚合、全站 40 次/15 分钟锁定、指数退避 ≤3s、只监听 127.0.0.1、非本机强制 HTTPS、地址白名单校验）全部保留 | `server/lib/password-policy.js`、`.env`（`MIN_ADMIN_PASSWORD_LENGTH=6`、`ADMIN_PASSWORD` 改为指定值）、`.env.example`；实测新密码 200、旧密码 401、`passwordNeedsChange=false`、模型配置解锁 |
| 2026-11-11 | v1.2.8 登录页改密码 | 新增 `POST /api/admin/password`（当前密码 + 新密码）与 `services/password-service.js`：校验当前密码（复用登录节流）→ 校验强度 → 写入 `.env` → **回读比对**（不一致自动回滚）→ 下发新会话票 → 审计；`config.js` 新增 `invalidateAdminPasswordCache()` / `persistAdminPassword()`；登录页增加「修改密码」模式（当前密码 + 新密码 + 确认，两次不一致当场拦、按最短长度提示、眼睛切换明文）；`/api/admin/session` 增加 `minPasswordLength` | 忘密码或想换强密码时不用先进后台、也不用去手改文件；改完立刻可用新密码登录，旧密码与其它设备登录同时作废 | 用户要求"登录页面也让我可以改密码，只需要输入一次对的 + 两次新密码"。放在登录页而不是设置页，是因为这一步正好发生在登录；安全性靠"必须输对当前密码 + 新密码同样过强度校验" | 新增 `server/services/password-service.js`；改 `server/config.js`、`server/routes/auth.js`、`web/src/lib/api.ts`、`web/src/types/content.ts`、`web/src/pages/admin/AdminLoginPage.tsx`；脚本实测 9/9（错当前密码 403、太短 400、新旧相同 400、正确修改 200、`.env` 写入一致、改完直接拿到新会话、旧密码 401、新密码 200、`.env` 已还原）；浏览器实测两次不一致提示、成功后自动进 `/admin/contents`，测试密码已还原为用户指定值 |
| 2026-11-11 | v1.2.9 修复 HTTPS 判据 | `session.js` 的 `isSecureRequest` 与 `security-headers.js` 的 HSTS 判断，都从"手读 `X-Forwarded-Proto`"改为"只看 `request.secure`" | 让"非本机必须 HTTPS"这道防线真的成立：伪造请求头不再能骗到登录 Cookie | 用户问"不配置反向代理会怎样"，顺着核对代码时发现：`isSecureRequest` 直接读 header 而没判断来源是否可信。实测局域网地址 + `X-Forwarded-Proto: https` 曾被判定为 secure=true（可拿到 Cookie），属认证绕过 | `server/services/session.js`、`server/middleware/security-headers.js`；实测 ① 直连本机 http → Cookie 无 `Secure`（正常）；② 局域网内另一台机器带伪造头 → `secure=false`，且伪造 `X-Forwarded-For` 也不影响 IP 判定（限流仍按真实 IP）；③ 全项目已无手读 `X-Forwarded-*` 的源码 |
| 2026-11-12 | v1.3.0 交接文档 | 新增 `HANDOFF.md`（700+ 行）：① 需求真相（最初 5 条 + 20 次追加纠正的时间线）；② 代码地图（逐文件职责 + 关键导出）；③ 三条核心链路（对话/蒸馏/内容）；④ 安全模型表（每条为什么）；⑤ **Linux 服务器部署全流程**（Node/Caddy/systemd/Nginx/上线检查清单）；⑥ 数据迁移与「Key 换机器解不开」的两种解法；⑦ 改代码的硬规则（编码事故、lint/build、不要动的东西）；⑧ 当前数据状态与已知限制；⑨ 排错速查；⑩ 可直接复制的"给接手 AI 的开场白"。本文 §0.1.1 增加两份文档分工 | 换到服务器部署时，接手的人或 AI 不用读 1300 行技术文档也能理解全局、安全改代码；部署步骤从"散落在对话里"变成可照抄的清单 | 用户要求"把所有的聊天整理成一份文档，因为要换到服务器部署，有问题会在服务器上改，需要一份 AI 能看懂的文档" | 新增 `HANDOFF.md`；`TECHNICAL.md` §0.1.1、§10、§15；版本 1.2.9 → 1.3.0 |
| 2026-11-12 | 快照脚本修复 | `scripts/snapshot.ps1`：① `$excludeDirs` 加上 `版本`；② 复制完成后兜底删除临时目录里**任意层级**的 `*.zip` | 快照从 6.1MB 回到 0.47MB，历史版本包不会再被打进新包 | 用户把历史 zip 收进了 `版本/`，而原脚本只排除**根目录**的 `*.zip`，打 v1.3.0 时把 13 个旧包一起塞了进去（典型的"包自我膨胀"） | `scripts/snapshot.ps1`；重新打包后核对：151 文件 / 0.47MB，含 `HANDOFF.md`，不含 `.env`、`data/`、`版本/`、嵌套 zip、`.session-secret`、`llm-key.enc` |
| 2026-11-12 | v1.3.1 修复 `.map` 崩溃 | ① `routes/admin-distill.js` 两处 `list.map(toPublicFact)` 改为 `.map((fact) => toPublicFact(fact, { categories }))`，并复用一次 `listCategories()`；② `services/distill-questions-service.js` 的 `accepted.map(toPublicQuestion)` 同样包一层；③ `toPublicFact` / `toPublicQuestion` 的可选参数从裸值改为**对象解构**，误用 `.map(fn)` 时安全退回默认值而不是抛错；④ `HANDOFF.md` 新增 §9.5 记录这个坑 | 修好部署实例上「把 N 条问答整理成词条」每条都 500 的故障；同时让同类误用以后不会再变成线上 500 | 用户在服务器上跑了一晚，日志刷 `TypeError: categories.find is not a function at toPublicFact (fact-service.js:162) ← admin-distill.js:254`。根因是 `Array.map` 把元素索引当第二个参数传给了 `toPublicFact`（索引是数字，没有 `.find`），属确定性代码 bug，与部署、运行时长、模型额度都无关 | `server/routes/admin-distill.js`（4 处调用点）、`server/services/fact-service.js`、`server/services/distill-questions-service.js`、`HANDOFF.md`；实测 5 项断言全 PASS（误用 `.map(toPublicFact)` 不再抛错且 `categoryLabel` 为字符串、显式分类生效 荣誉/经历、误用 `.map(toPublicQuestion)` 时 `factCount` 全为 0、显式 `factCount` 生效）；接口实测 `GET /questions` 的 `factCount`、`GET /facts` 的 31 条分类名（荣誉/经历…）全部正确，`未分类` 为 0 条 |
| 2026-11-12 | v1.3.2 自带 HTTPS | 新增 `server/lib/tls.js`：`data/certs/fullchain.pem` + `privkey.pem` 存在即以 HTTPS 启动，缺失则保持 HTTP；启动自检「证书/私钥是否配对」并打印域名与到期天数，不匹配则告警并退回 HTTP；`config.js` 增加 `CERT_DIR` / `TLS_CERT_FILE` / `TLS_KEY_FILE` 并把 `certs` 纳入 `ensureDataDirs()`；`index.js` 由 `app.listen` 改为显式 `http/https.createServer`；`.env.example` 增加 HTTPS 段说明 | `www.pnds.asia` 可以不经 Caddy/Nginx 直接提供 HTTPS：隧道只做 TCP 透传，Cookie 自动带 `Secure`、自动下发 HSTS，"非本机必须 HTTPS"闸门自然满足 | 用户给了 `www.pnds.asia` 的证书链与私钥，要求"部署上这个 https 证书"；项目原本只能靠外部反代上 HTTPS，而用户是 Windows + 隧道形态，装反代成本高 | `server/lib/tls.js`（新增）、`server/config.js`、`server/index.js`、`.env.example`、`data/certs/`（本地，不进包）；实测 ① 证书链 3 张、域名 `www.pnds.asia`、`openssl` 等价的 `X509Certificate` 校验通过、私钥匹配、本地 TLS 握手成功；② `curl --resolve www.pnds.asia:8787:127.0.0.1 https://…` **不加 `-k` 严格校验即 200**（说明浏览器也会信任）；③ 端到端 11 项全 PASS（首页 200、HSTS、CSP、X-Frame-Options、登录 200、Cookie 带 `Secure`+`HttpOnly`+`SameSite=Lax`、会话有效、后台可访问、明文 HTTP 打同一端口失败）；④ 启动日志打印「监听：127.0.0.1:8787（HTTPS）」与「到期时间：2026-11-27（还剩 15 天）」并提示尽快续期 |
| 2026-11-12 | v1.3.3 首屏不闪旧文案 | ① `server/index.js` 的 `renderIndexHtml` 把完整站点信息序列化进 `<script id="boot-profile" type="application/json">`（`<` 转 `\u003c` 防 `</script>` 截断），并按路由注入正确 `<title>`（首页 / 内容库 / 后台 / 站内详情，查不到就退回站点名）；② `web/index.html` 增加 `__SITE_PROFILE__` 与 `__PAGE_TITLE__` 占位；③ `ProfileProvider` 首帧直接读内联数据，**拿不到才请求 `/api/profile`**（开发模式 Vite 走这条兜底） | 刷新页面时不再"先显示演示文案再换成真文案"：第一帧就是真值，且生产环境完全省掉一次 `/api/profile` 往返；标签页标题从第一个字节起就正确，不会二次跳动 | 用户反馈「设置页改的主页默认信息，每次刷新都先显示原来的再显示新的」。根因是第一性原理层面的：服务器生成 HTML 时**已经知道**真实文案（`og:title` 就在用它），却没交给前端渲染，前端只能用硬编码的 M0 演示数据画第一帧 | `server/index.js`、`web/index.html`、`web/src/lib/ProfileProvider.tsx`；实测 ① 首页 HTML 首字节即含 `"siteName":"pnds的博客"` 与 `<title>pnds的博客 · 对话主页</title>`；② 浏览器打开后 **`performance` 里 `/api/*` 请求数 = 0**（说明没有等请求、也没有二次覆盖）；③ 首帧渲染的就是「你好，我是pnds」「你的家乡在哪？」「这是pnds的 AI 博客」；④ 五个路由标题分别正确：`/`→`pnds的博客 · 对话主页`、`/contents`→`内容 · pnds的博客`、`/admin` 与 `/admin/settings`→`pnds的博客 · 后台`、不存在的 `/p/xxx`→`pnds的博客` |
| 2026-11-12 | v1.3.3 清理开发期残留 + 启动脚本简化 | ① 删除无引用的 `web/src/data/mockContents.ts`（M0 演示卡片）；② `RailButton` 去掉 `disabled` 属性与「· 即将开放」提示（已无调用方）；③ 登录页删掉「密码存在项目根目录的 .env 里」及底部整段说明；④ 后台横幅与设置页红条改为「请在登录页点『修改密码』」，不再指向 `.env`；⑤ 设置页隐去 `data/secrets` 路径；⑥ **重写 `start.bat`**：110 行精简到 105 行但结构清晰化（正式/开发两块 + 6 个子过程，去掉重复 echo），新增自动识别 HTTPS 并据此选择打开地址、从 `.env` 读取真实 `PORT`、把「密码在哪 / 怎么改 / 怎么停」合并成一块启动信息 | 访客和后台界面不再暴露"密码存在哪个文件"这类运维细节；运维提示集中到启动窗口这一处，界面回归干净；启动脚本自己就能说清关键信息，不用去翻文档 | 用户指出「输入后台密码的地方提示得太多了，还告诉密码在哪个文件里」，要求把这些整合进 `start.bat` 并把它整理得简单明了 | `web/src/data/mockContents.ts`（删除）、`components/ui/RailButton.tsx`、`pages/admin/AdminLoginPage.tsx`、`components/admin/AdminLayout.tsx`、`pages/admin/AdminSettingsPage.tsx`、`start.bat`；实测 ① lint + build 通过；② 构建产物里 `项目根目录` / `ADMIN_PASSWORD` / `data/secrets` / `即将开放` / `mockContents` 均为 **0 处**；③ 新 `start.bat` 实跑输出为 4 行启动信息 + 服务自身状态，自动识别 `HTTPS` 且端口从 `.env` 读到 8787；④ 脚本经 UTF-8 无 BOM 校验，与旧文件编码一致 |
| 2026-11-12 | 打包规则调整 | `scripts/snapshot.ps1` 新增 `-IncludeData` 开关：默认仍只打源码，加了开关才把 `data/`（`db.json`、`uploads/`、`certs/`、`secrets/`、`.session-secret`、`backups/`）打进去，任何模式下都不含 `.env`，并排除 `data/logs/`。同时在 §0.3 明确**打包时机**：只在用户说「打包」时执行，日常改完只跑 lint/build + 更新文档 | 需要整体迁移时一个包就够，不用再手工拼 data 目录；平时不再产出一堆没人用的 zip | 用户明确要求「以后我说打包你再打包，不用每次动代码都打包一次，只做更新文档即可」，并要求这次把数据一起打进去 | `scripts/snapshot.ps1`、`TECHNICAL.md` §0.3 与 §15；实测 `-IncludeData` 打出的包 181 文件 / 0.62MB，含 `data/db.json`、`data/uploads/`、两个证书、`secrets/llm-key.enc`、`.session-secret`，不含 `.env`、`data/logs`、`node_modules`、嵌套 zip |
| 2026-11-13 | v1.3.4 README | 新增根目录 `README.md`（GitHub 首页）：① 定位对比（书架 vs 前台）；② 访客侧 / 作者侧 / 工程侧功能表；③ 快速开始（`start.bat` 与手动两条路，标注 Node ≥ 20.19 / ≥ 22.12 的硬要求，来自 Vite 8）；④ `.env` 配置表（补 `LLM_ALLOW_PRIVATE`、`MACHINE_SECRET`）；⑤ ASCII 架构图与目录树（按 CJK 双宽字符精确对齐，框线统一 69 列）+ 两张 mermaid 图（对话链路、蒸馏管线）；⑥ 12 个蒸馏维度全列；⑦ 安全表；⑧ 部署（Node 自带 HTTPS、systemd、搬家）；⑨ FAQ；⑩ 许可声明 | 仓库首页能一眼说清"这是什么、怎么跑、凭什么信"，不用点进 `TECHNICAL.md` 才知道全貌；所有图在 GitHub 上都能正确渲染，代码块不出现横向滚动 | 用户上传 GitHub 后要求"写一篇精美的 README" | `README.md`（新增，374 行 / ~10KB）、`TECHNICAL.md` §4.1 目录树补 `README.md`；实测 ① 代码块围栏、表格列数、`<div>/<details>/<summary>/<sub>` 标签全部配对；② 内部锚点 `#-快速开始`、`#-蒸馏从一堆文件到一个像你的人` 经 GitHub slug 规则（emoji 移除后保留前导连字符）校验有效，`./TECHNICAL.md` 与 `./HANDOFF.md` 链接文件存在；③ 两个 mermaid 块在浏览器里用 mermaid@11 真实渲染，`errors: []`、生成 2 个 SVG，无 `Syntax error`；④ 9 个 shields.io 徽章 URL 全部 200；⑤ ASCII 框图所有 `│…│` 行宽度均为 69 列，中轴 `┬`/`▼`/`│` 对齐同一列；⑥ 代码块最宽行 96 列（≤100，不出横向滚动条）；⑦ 敏感信息扫描通过（无密码、无私钥、无真实 Key） |
| 2026-11-12 | v1.3.4 上线整包 | 按「真正可以上线、去冗余」的要求打了一个整包放到 `111/`：源码（`server/`、`web/src`、`web/public`、`web/dist`、lock 文件）+ 文档（`TECHNICAL.md`、`HANDOFF.md`）+ `start.bat` + `.env.example` + **线上数据**（`111/data` 里的 `db.json`、`uploads/`、`secrets/`、`.session-secret`，站点名 `pnds的克隆`、2 条内容、29 条词条、10 道题）+ 补上 `data/certs/`（v1.2.8 的线上数据里还没有证书目录）。排除：`node_modules`、`.env`、`data/logs`、`data/backups`、`SPEC.md`、`scripts/`、`.vscode/`、`版本/`、`snapshots/`、`tmp-m2/`、任何 `*.zip`。ZIP 条目名由脚本写成 `正斜杠`（`Compress-Archive` 在 PS 5.1 下会写反斜杠，Linux 解压会得到怪文件名） | 服务器上解压即可跑：不用再 `npm run build`，数据不用手工搬，HTTPS 证书就位；同时包里没有开发期残留和运行痕迹，体积 0.62MB | 用户要求「打包一份真正可以上线的、去除所有冗余的东西，把数据换成我之前上线的数据，放在 111 文件夹下」 | 产物 `111/蒸馏博客v1.3.4.zip`；实测 ① 153 个条目、全部正斜杠、无 `node_modules`/`.env`/`data/logs`/`data/backups`/`SPEC.md`；② 解压后文件清单与暂存目录 **153/153 完全一致**；③ 用解压出的副本实跑（`PORT=8790`、临时关掉 TLS）：`/api/profile` 返回站点名 `pnds的克隆`，`/api/contents` 返回 2 条（AI总结浏览器插件、AI博客），封面 `/media/covers/...` 200/12309 字节，下载 `/api/download/...` 200/18050 字节且 `content-disposition` 带 UTF-8 `filename*`，`/admin/login` 与 `/contents` 均 200，无启动报错 |
| 2026-11-12 | v1.3.4 用户视角全流程审计 | 按真实访客 + 真实博主两条路径把站点走了一遍，修 5 类问题：① **退出登录后重新登录卡在登录页**——`AdminLayout.handleLogout` 去掉多余的 `navigate`，守卫改用 router 的 `location.pathname/search`，`goAdmin()` 把 `/admin/login` 排除出合法 `next`，登录页在已登录时给出「直接进入后台」入口；② **「最近在做什么」不弹内容卡片**——`detectIntent` 增加 `LATEST_ACTIVITY_PATTERN`（句子不带「你」也识别为问本人近况），兜底匹配由「标题整串 `includes`」换成新的 `pickMentionedContents()`（最长公共子串 ≥4 字、占标题 ≥60%、且重合需贴在标题头或尾；有整串命中时丢弃模糊命中）；③ **程序类「下载文件」格式提示错**——`KIND_FORMS` 新增 `fileFormats` 字段，`FilePickField` 优先用显式格式，不再从共享 accept 反推前三个扩展名；④ **「本回复使用 AI 常识回答」一刀切**——改为「本回复含 AI 常识补充，非本人经历」，与「整条回答」解耦；⑤ **两处计数文案**——未出题的维度显示「未出题」而不是空，「共 1 份 · 13 条词条」改为「共 1 份资料 · 整理出 13 条词条」 | 访客问「最近在做什么」能真的看到作品卡片；博主退出后能立刻重新登录；上传页的格式提示与字段说明一致；常识标注不再把本人事实一起误标；蒸馏页的计数不再让人以为数字丢了 | 用户要求「模仿实际用户操作，审查有没有不符合常理或有 bug 的地方」。5 项都是走查时实际踩到的现象，且各自的根因都在代码层：退出登录时路由守卫与手动 `navigate` 抢先后、卡片兜底只认完整标题、格式提示从共享 accept 反推、常识标注用布尔值描述整条回答、计数用 `total === 0` 时隐藏 | `web/src/components/admin/AdminLayout.tsx`、`web/src/pages/admin/AdminLoginPage.tsx`、`server/services/chat-service.js`、`server/services/retrieval-service.js`、`web/src/lib/content-kinds.ts`、`web/src/components/admin/FilePickField.tsx`、`web/src/pages/admin/AdminContentEditorPage.tsx`、`web/src/components/chat/AssistantMessage.tsx`、`web/src/components/admin/distill/DistillQuestionsPanel.tsx`、`web/src/components/admin/distill/DistillSourcesPanel.tsx`；实测 ① lint 0 警告、build 通过；② `pickMentionedContents` 11 条断言全通过（含「关于夏天的记忆」不得命中「一首关于夏天的歌」这类反例）；③ 浏览器实测 `/admin` → 登录 → 退出 → 再登录，最终停在 `/admin`，不再绕回登录页，且已登录访问 `/admin/login` 会显示「直接进入后台」；④ 上传页「程序」的下载文件区显示 `ZIP / RAR / 7Z / EXE / MSI / APK`，封面显示 `PNG / JPG / WebP`；⑤ 蒸馏页两个未出题维度显示「未出题」，资料卡显示「共 1 份资料 · 整理出 13 条词条」；⑥ 真实调模型问「最近在做什么」（句中没有「你」），回答提到了内容且 `cards` 返回 1 张卡片 |
| 2026-11-13 | v1.3.5 源码包（GitHub） | ① 打出**不含数据**的源码包 `版本/蒸馏博客v1.3.5.zip`（121 文件 / 0.35MB）：含 `README.md`、`TECHNICAL.md`、`HANDOFF.md`、`server/`、`web/src`、`web/public`、lock 文件、`scripts/snapshot.ps1`、`start.bat`、`.env.example`、`.gitignore`；**排除** `data/`、`.env`、`node_modules/`、`web/dist/`、`snapshots/`、`版本/`、`111/`、`tmp-m2/`、`*.log`、`*.zip`（与 `.gitignore` 对齐）。② 修 `server/config.js`：`.env` 整个不存在时也走 `generateAndPersistPassword()` 生成 24 位随机密码并创建 `.env`（新增 ADR D55）。③ 打包脚本改为「只排除根目录的运行时目录」——初版按目录名全局排除，把 `web/src/data/mockProfile.ts` 一起排掉了 | 别人 clone / 解压后直接 `npm run install:all` → `npm run build` → `npm start` 就能跑，不会带出任何业务数据、上传文件、证书或密钥；全新安装的后台口令一定是随机的，"装完就是公开默认密码"这条风险从源头消除 | 用户要求「打包一个不包含数据的最新版，全部都是新的，我要上传 GitHub」。修 `.env` 缺失那条是在**实跑打包结果**时发现的：解压 → 装依赖 → 构建 → 启动，日志里出现「后台密码只有 8 位」，与 README 承诺的"首次启动自动生成 24 位随机密码"不符 | `版本/蒸馏博客v1.3.5.zip`、`server/config.js`、`package.json`（1.3.4 → 1.3.5）；实测 ① 解压后 121 个文件与工作区**逐文件 sha1 一致**，无遗漏、无多余；② 全部条目用正斜杠，无 `node_modules` / `data/` / `.env` / `web/dist` / `*.zip` / `*.log`；③ 从包内 `npm run build` 成功（初版在这里报找不到 `@/data/mockProfile`，暴露了排除规则写错）；④ 启动后 `/api/profile`、`/api/contents`、`/contents`、`/admin/login`、`/` 全部 200；⑤ 首次启动自动生成 `ADMIN_PASSWORD`（长度 24）并创建 `.env`，用该密码 `POST /api/admin/login` 返回 200；⑥ 二次启动密码不变、不重复生成 |

---

## 11. 关键决策记录（ADR）

### D1：以用户最新需求覆盖 SPEC 的视觉与范围

公开页采用 ChatGPT 式对话首页，后台成为核心功能。原因：用户明确说明 SPEC 仅参考。

### D2：前端与后端分离为 `web/` + `server/`

前端独立构建到 `web/dist`，后端托管并做 SPA 回退；也支持把 `dist` 放静态托管。原因：用户要求前端可单独上传/替换，未来平台化也需要清晰边界。

### D3：JSON 文件存储而不是数据库

`data/db.json` + `data/uploads/`，原子写入 + 备份 + 仓储层封装。原因：单作者、数据量小；整目录可拷贝；服务器只需 Node。代价：写入串行、查询需全量扫描，数据量超万级时要换 SQLite。

### D4：后台单密码登录 + HMAC Cookie

`.env` 配 `ADMIN_PASSWORD`，登录后签发签名 Cookie，无需 session 表。原因：单人博客不需要用户表。代价：未来多人时再升级账号体系。密码改完保存即生效，签名密钥由密码派生，所以旧登录会自动作废（见 D46）。

### D5：先假 transport，后真实 SSE

M0 用 `fakeTransport` 验证 UI；M3 换成 `lib/chatTransport.ts`（真实 SSE）。原因：先稳住交互，再接模型。**M3 起 `fakeTransport.ts` 已删除**，前端只剩真实链路。

### D15：检索不引入向量库

用中文 bigram + 字段加权打分，命中内容与最新 3 条一起进上下文。原因：个人站内容量小，关键词足够；零额外依赖、零额外费用。代价：同义改写（“做的东西” vs “作品”）召回弱，后续可加 embedding 兜底。

### D16：结构化输出做确定性兜底

`⟦META⟧` 让模型返回引用与追问，但模型会偶发漏写。服务端在解析后补两条规则：正文出现内容标题 → 自动挂对应卡片；追问不足 2 条 → 用固定问题补齐。原因：界面形态不能依赖模型稳定性。

### D17：卡片动作真实化

卡片详情里，有附件就 `/api/download/:id` 直接下载，有外链就新窗口打开，都没有就展示正文。原因：访客点卡片必须有确定结果，不能停留在“演示内容”。

### D18：话题策略——项目是“聊到才说”

三类问题分开处理（见 §2.5）。原因：用户的直觉判断是“这人怎么三句不离自己的项目”，说明把“作品证据”当成了“回答框架”。改成：寒暄和常识问题不注入材料、不提免责声明；只有问本人/作品时才带上下文与卡片。

代价：意图判断是规则式的（出现“你/您”即视为问本人），个别时候会多带一点上下文。因为不编造个人经历这条底线还在，多带上下文不会造成幻觉，最多是模型多一句可选材料。

### D19：删除先软删除，进回收站

`DELETE /api/admin/contents/:id` 只打 `deletedAt` 并把 `published` 置 false，记录与文件都保留；恢复后保持未上架，必须手动重新上架；彻底删除（`/purge`）才移除记录并清理文件。

原因：手滑删除会连带丢掉上传的附件，而附件通常是最难重建的资产。代价：`db.json` 会积累已删记录，需要用户主动清理回收站；列表与公开接口都必须显式过滤 `deletedAt`。

### D20：封面必须验真实类型

扩展名白名单挡不住「把 exe 改名成 .png」。落盘后读文件头，按 PNG/JPEG/GIF/WebP/AVIF 签名判断，不匹配就删掉已上传文件并返回 400。同时给封面单独设 5MB 上限，避免一张列表缩略图拖来 100MB 文件。

原因：封面会被浏览器当作图片直接渲染并公开托管，真实类型校验是必要边界。代价：每次上传封面多一次文件读取（读 16 字节，可忽略）。

### D21：浏览器标题由页面声明

`useDocumentTitle(title)` 放在各页面里，`ProfileProvider` 不再统一设置标题。原因：Provider 的后置 effect 会覆盖详情页标题，导致「点进详情页但标签页还是首页标题」。

### D22：缩略图暂不做真实压缩

列表封面用 `loading="lazy"` + `decoding="async"` + 封面 5MB 上限来缓解，不引入 `sharp` 生成缩略图。原因：个人站内容量小，真实压缩的收益低于引入原生依赖的成本（跨平台安装、包体积、迁移复杂度）。若内容规模上来，再在 `storage` 层加 `sharp` 生成 320px 缩略图，接口不变。

### D6：默认 DeepSeek，OpenAI 兼容

原生 `fetch`；默认 `https://api.deepseek.com` + `deepseek-flash`，可换成任意兼容端点。

API Key 的处理：**后台可以填写**，但服务端只把它写进项目根目录的 `.env`，不写 `db.json`。原因：数据文件会被频繁备份、随项目拷贝，密钥留在配置文件里更好管理；接口只回传掩码。

> 注：M3 实际调用时以设置页里的 Base URL / 模型名为准；若接口返回「模型不存在」，把模型名改回对应服务商可用的名字即可。

### D7：对话历史只存浏览器

v1 不做服务端会话历史。代价：换设备/清缓存后丢失；分享链接只复现问题。

### D8：OCR 暂缓

v1 支持图片上传但不识别；接口预留。

### D9：深浅主题都做，默认深色

CSS 变量 + `data-theme`，`localStorage` 持久化，`index.html` 内联脚本避免首屏闪烁。

### D10：中文注释 + 模块化

业务代码写中文注释并解释意图；页面、组件、hooks、lib、server 分层。

### D11：上传与内容一起提交（multipart）

新建/编辑内容时，表单字段与文件一次性 multipart 提交。原因：避免「先传文件再保存」产生孤儿文件；校验失败时统一清理。

### D12：附件只走下载接口

封面用 `/media/covers/*` 静态托管；附件只经 `/api/download/:id`，用原始文件名。原因：避免目录枚举与路径穿越，同时保证下载体验。

### D13：上传文件名按 UTF-8 还原

multer/busboy 默认按 latin1 解码文件名。在 `fileFilter` 里用 `Buffer.from(name,'latin1').toString('utf8')` 还原，出现替换字符则保留原值。原因：中文文件名在列表和下载头里都会乱码。

### D14：版本快照用 zip，不用 git

环境无 git。`scripts/snapshot.ps1` 打包源码（排除 `node_modules`、`data`、`snapshots`）。代价：无分支/差异对比，靠版本号与日期区分。

### D23：蒸馏原文存文件、检索索引存 db

`distillSources` 只记元数据；抽出的全文写 `uploads/distill/<id>.txt`；真正参与检索的是 `factEntries`（词条）与 `knowledgeEntries`（原文切块）。

为什么：全文直接进 `db.json` 会让一个 20 万字的 PDF 把每次写库都拖慢（每次写库还要备份一次），而检索索引必须留在 db 里才能被查询与级联删除。

### D24：人设草稿与正式人设分开存

AI 生成的结果只写 `personaDraft`，页面顶部提示「还没生效」，用户点「应用」才覆盖 `persona`。

为什么：手写的人设是用户自己核对过的内容，让一次 AI 调用直接覆盖它属于不可接受的破坏性操作；分开存也能让用户「先看看像不像」。

### D25：词条与原文块都不挂卡片

编号延续 `cN`（词条在最前，内容块其次，原文块最后），但 `blockByCode` 只装内容记录，因此词条与原文被引用时不会生成卡片。

为什么：卡片点开是「作品详情/下载」，词条和资料片段没有这些动作；强行生成空卡片会让人以为点击无效。

### D26：JSON 调用失败就翻倍预算重试

`requestJsonCompletion` 首次用 3000 `max_tokens`，解析失败则 6000、8000 再试，并把原始输出记进日志。

为什么：DeepSeek 这类带推理的模型，`reasoning_tokens` 也计入 `max_tokens`，预算偏小时 JSON 会被截断，表现是「解析失败」而不是报错；不重试就变成用户反复点按钮碰运气。

### D27：答题进度只认数据，不认浏览器

「已答 / 目标」全部由 `distillQuestions` 实时统计，前端不做本地缓存，每答一题立刻 `mutateDb` 落盘。

为什么：1000+ 题的蒸馏要跨很多天，任何依赖 localStorage 的进度都有丢失风险；换设备、清缓存都不该影响进度。

### D28：资料先变成「词条」，原文只做兜底

上传后被解析的正文，先用模型提炼成一条条事实词条（`factEntries`），原文切块（`knowledgeEntries`）只在词条命中不足时补 2 段。

为什么：一份简历被切成 400–600 字的段落，"获奖"只是其中一小截，既不便于人核对，也很难被关键词命中。词条短、信息密度高、后台可读可改，才是"蒸馏一个人"的正确单位。

### D29：词条区分 ai / user 来源，重新整理不覆盖手写

`origin: 'ai'` 的词条会在「重新整理」时整体替换；`origin: 'user'`（你改过或手写的）原地保留。

为什么：重新提炼的动机通常是"想更好一点"，但如果它把你手工核对过的内容冲掉，用户就再也不敢点这个按钮了。

### D30：检索做同义词扩展 + 单字

`SYNONYM_GROUPS` 把「奖 / 获奖 / 奖项 / 荣誉 / 奖学金 / 竞赛…」等归组，命中任意一个就展开整组；同时保留单字 token（虚词用停用表过滤）。

为什么：中文两字切词对短问题极不友好——「你得什么奖」切出「你得/得什/什么/么奖」，与资料里的「一等奖」没有任何共享片段。这是"资料明明上传了却答没得过"的直接原因。

### D31：出题按维度轮流，而不是围着资料转

12 个维度（成长、教育、工作、技能、兴趣、价值观、情绪、健康、人际、失败、目标、金钱）每批选最久没问到的 2–4 个，按数量配额出题，并把 `dimension` 落到题目上。

为什么：只顺着资料出题，模型会一直问"你那个项目怎么做的"，蒸馏出来的只是一个"技术账号"而不是人。维度配额把家庭、情绪、健康、金钱这些"人味"强制拉进清单。

### D32：列清单类问题最多举 3–4 个代表

提示词加一条：问"有哪些奖 / 做过什么"时只举最有代表性的 3–4 个，其余用「还有几个」带过，除非对方明确要求全列。

为什么：词条修好之后，模型会把 12 个奖项一条条念完，反而不像人在说话。

### D33：模型 Key 加密存储 + 机器绑定

Key 不写 `.env`、不写 `db.json`，只写 `data/secrets/llm-key.enc`；密钥由 `SESSION_SECRET` 与机器指纹派生。

为什么：`.env` 是明文，随项目一起打包/上传备份就泄露；`db.json` 会进自动备份和后台下载。机器绑定是刻意的取舍——换机器要重填一次 Key，但即使整个 `data` 目录被拷走也解不开。

### D34：改模型地址必须二次输入密码

`PUT /api/admin/settings` 里，`model.baseUrl` 有变化时要求 `confirmPassword` 且校验通过。

为什么：Key 是以 `Authorization: Bearer` 发到 baseUrl 的。只要有人拿到你的会话（XSS、Cookie 泄露、共用电脑），改一个地址就能在下一次聊天时把 Key 原封不动收到自己服务器。这是"盗 Key"最短的一条路。

### D35：默认密码未改时禁止动模型配置

`ADMIN_PASSWORD === 'admin123'` 时，改 Key、清 Key、改地址一律 403，并记审计日志。

为什么：默认密码写在文档和启动提示里，等于公开。允许它改模型配置就等于允许任何人把 Key 导走。

### D36：生产开 CSP，主题脚本外置

`web/index.html` 里的主题引导内联脚本改成 `public/theme-boot.js`，配合 `script-src 'self'`。

为什么：CSP 是防 XSS 偷会话最有效的一道墙，但内联脚本会被它拦掉，表现为"页面能开、主题不生效 + 控制台报错"。要么放弃 CSP，要么把脚本挪出去——选后者。

### D37：词条整理放后台跑

上传接口只做「解析 + 切块」就返回，词条整理用 `setTimeout` 异步执行，前端轮询 `factStatus`。

为什么：解析 PDF 已经要几秒，再同步等一次模型调用（10–30 秒）会让上传像卡死。异步 + 轮询能让用户立刻看到"文件已收到、正在整理"。

### D38：每日额度而不是只做每分钟限流

每分钟 10 次 + 每日全站 800 次 / 单 IP 120 次，两层一起用。

为什么：只做每分钟限流，慢速刷量一天能跑 1.4 万次；模型是按量计费的，公网一上线这就是真金白银。

### D39：分类是数据，不是常量

`factCategories` 存分类（label/order/origin），词条用 `categoryId` 关联。AI 提炼时把现有分类喂给模型，要求"优先复用、实在不合适才新建"；后端再做一次相似度归一（去标点小写后互相包含且长度接近即视为同一类）。

为什么：写死 12 类是我拍的，遇到"养猫""做饭"这类内容只能硬塞进「生活」，分类就变成骗人；完全自由起名又会让「荣誉/获奖/奖项/奖励」散成四个，筛选和统计全废。分类当数据处理，才能既自动又可用。

### D40：词条单独成页，资料页不再内嵌编辑

所有来源的词条汇总到「词条」标签页；资料页只显示条数 + 「看词条」跳转（带来源筛选）。

为什么：词条原本按资料分组，想找一条得先想起它来自哪个文件；两个地方都能编辑还容易出现"改完不一致"。集中一页后可搜索、可按类看、可批量处理，编辑逻辑也只有一份。

### D41：分类筛选在前端做

后端一次返回「来源 + 搜索」过滤后的全量，分类切换在前端 `useMemo` 里过滤。

为什么：分类筛选如果走后端，选中一个分类后其它分类的计数会变成 0、按钮集体消失，用户就没法切回去了。数据量在千级以内，前端过滤足够快。

### D42：疑似重复只提示，不自动合并

同名词条（去标点小写后相同）标「疑似重复 ×N」，不自动删除。

为什么：同名不同事很常见（比如两次「一等奖」），自动合并会丢信息。提示 + 批量删除让人自己判断更安全。

### D43：按「问的是谁的事」区分材料与常识

判定标准从"句子里有没有你"改成"问的这件事属于你身上的事，还是外面的世界"：

- 你身上的事 → 只认材料，没有就说没写过
- 外面的世界（地方特产、概念、原理、历史、别人的作品）→ 用模型自己的常识答，即使句子里带"你的家乡/你的学校"
- 混合 → 拆开答

为什么：原来按"含不含你"分流，「你家乡有啥好东西」被整句归成个人问题，模型只能答"我没写过，不敢给你列"，把常识也锁死了。改成按事实归属判断后，同一句话里"潍坊风筝出名"（常识）和"我小时候在干啥"（个人）能各归各位。

### D44：常识标注放在回答下方，不写进正文

模型在 META 里自报 `general:true/false`，前端在回答下面渲染一行小字「本回复使用 AI 常识回答」。

为什么：写在正文里会破坏"像人在说话"的感觉（`这属于常识不是我的记录` 正是上一版要禁止的元解释）；用一行小字既满足"让人知道这段是 AI 常识"，又不打扰阅读。

### D45：依据区只显示标题，不显示内容

`buildSources` 不再回传 `excerpt`，前端只渲染「类型标签 + 标题/问题」。

为什么：依据里原本带的是词条内容、资料原文片段或问答答案。问答答案里有大量私人信息（家里几口人、收入、身体），而这是任何访客都能展开看的公开页面。只给标题既能说明"依据是什么"，又不会把内容暴露出去。

### D46：后台密码即时生效，并让旧会话失效

`getAdminPassword()` 每次读之前先比 `.env` 的 mtime，变了就重新解析；会话签名密钥改成 `HMAC(SESSION_SECRET, 当前密码)`。

为什么：原来 `ADMIN_PASSWORD` 是启动时读进内存的常量，改 `.env` 必须重启才生效；更隐蔽的是，登录 Cookie 用 `SESSION_SECRET` 签名、有效期 7 天，跟密码完全无关，所以**即使重启了，浏览器里那个旧 Cookie 依然能进后台**，用户看到的现象就是"改了没反应"。

两个必须一起做：不即时生效就得重启；不改派生密钥，改完密码旧会话照样能进，等于没改。顺带的好处是——泄露出去的老 Cookie 会在改密码那一刻全部作废。

注意 `.env` 里这一行被写空时**沿用上一次的密码**，不退回 `admin123`，避免手滑把后台解锁成默认密码。

### D55：`.env` 整个不存在时也要生成随机密码

原来只有"`.env` 存在但没有 `ADMIN_PASSWORD` 这一行"才会生成随机密码；`.env` **完全不存在**时直接沿用代码里的 `DEFAULT_ADMIN_PASSWORD`（8 位）。

这个差别在源码仓库场景下是致命的：`.env` 在 `.gitignore` 里，别人 clone 下来（或者自己解压一个源码包）**一定没有 `.env`**，于是"全新安装自动生成强密码"这条保护完全没生效，后台口令就是公开可见的默认值。实测打好的源码包首次启动，日志里出现的就是「后台密码只有 8 位」而不是随机密码。

改成两条路径共用同一个 `generateAndPersistPassword()`：`.env` 缺失 → 生成并创建文件；`.env` 存在但缺这一行 → 生成并补上。只有"运行期间 `.env` 被删掉"这一种情况沿用内存里的旧值——那种场景下退回默认密码比沿用更危险。

---

### D47：标题与分享预览由服务端注入

`index.html` 里留 `__SITE_NAME__` / `__SITE_DESC__` / `__SITE_URL__` 占位，返回页面时用当前设置替换；模板按 mtime 缓存。

为什么不能只靠前端：`useDocumentTitle` 改的是浏览器标题，但微信、推特、Slack 的预览抓取**不执行 JS**，只会读到 HTML 源码。写在源码里的又只能是写死的默认值（用户随时能在后台改站点名），所以唯一稳的做法是服务端渲染这几个标签。

模板按 mtime 缓存是为了不倒退：`web/dist` 的 JS 文件名带哈希，构建后必须换新模板，否则页面会引用已删除的旧文件。这样"改完前端不重启也能生效"这条老约定保住了。

### D48：安全闸门按"密码强度"判定，而不是"是否等于某个字符串"

原来只把 `admin123` 当默认密码，于是 `.env.example` 里写的 `change-me` 反而被当成"安全密码"，默认密码保护形同虚设。现在统一用 `password-policy.js`：**少于 12 位 / 命中常见口令 / 字符种类少于 2 类** 都算"未安全初始化"，后台锁住模型配置并挂红条；首次启动若没有密码，直接生成 24 位随机密码写回 `.env` 并在控制台打印。

为什么不静默生成、也不强制改：静默生成会让老用户一头雾水；强制弹窗要求改密码会在没有前端构建产物时把人挡在门外。折中方案是"**只拦最危险的动作**（改模型配置），其余功能照用"，并在启动日志、后台横幅、登录页三处都写清楚怎么改。

### D49：限流用"退避 + 全站计数"，默认只听本机
三个决定，都是为了既挡爆破又不把自己锁死：

1. **IPv6 按 `/64` 聚合**：同一台机器能随手换几十亿个地址，按完整 IP 计数等于没限制。
2. **指数退避而不是硬锁**：失败 3 次起开始延迟（最多 3s）。硬锁 15 分钟固然更狠，但攻击者发几十个请求就能把站长关在门外（自己 DoS 自己）；退避把爆破速度压到每分钟十几二十次，配合 12 位密码足够安全。
3. **默认只听 `127.0.0.1`**：这个项目天生是"本机跑、外网靠反代"的形态。默认绑定 0.0.0.0 等于把明文 HTTP 的后台直接摆到局域网里；需要手机调试时显式 `BIND_HOST=0.0.0.0`，启动会打印警告，非回环的 http 请求也不给下发 Cookie。

### D50：改密码放在登录页，不需要先登录

`POST /api/admin/password` 收「当前密码 + 新密码」，校验通过后写 `.env` 的 `ADMIN_PASSWORD`，并给当前浏览器换一张新会话票。

为什么放在登录页而不是设置页：忘了密码、或者想把弱密码换成强的，往往正好发生在登录这一步；要求"先进后台才能改密码"在密码已经弱到不敢用的时候是死结。安全性由两点保证：**必须输对当前密码**（复用登录的失败计数 + 退避 + 全站锁定，所以这里不是新的爆破口），**新密码同样过强度校验**（不能借改密码的机会把密码改弱）。

写入后必须做两件事，否则会出现"提示改成功但登录不上"：一是**回读校验**（`persistAdminPassword` 会重新解析 `.env` 并比对，不一致就整体回滚文件）；二是**主动让密码缓存失效**（`invalidateAdminPasswordCache`），因为同一秒内多次写文件 mtime 可能不变，光靠 mtime 判断会读到旧值。

`/` 和 `"` 这类字符本身没问题，但**首尾成对的引号会被 `.env` 解析规则剥掉**，所以直接拒绝并提示换一个，避免用户"密码明明输对了却进不去"。

### D51：HTTPS 由 Node 自己终结，隧道只做 TCP 透传

`lib/tls.js` 在 `data/certs/fullchain.pem` + `privkey.pem` 同时存在时返回 TLS 选项，`index.js` 据此 `https.createServer` 而不是 `http.createServer`；两个文件缺失就保持 HTTP。

为什么不让用户装 Caddy/Nginx：这个项目天生"本机跑、隧道对外"。多一个反代就多一处要装、要配、要开机自启、要单独续证书的东西；而 Node 原生支持 TLS，加 ~40 行就够。证书放 `data/certs/` 还有一个好处——`data/` 本来就被排除在 git、打包、快照之外，私钥不会顺手带出去。

必须做启动自检：**证书与私钥不配对时 `https.createServer` 依然能起来**，但每次握手都会失败，浏览器只显示一句"连接已重置"，这是最难排查的一类故障。所以启动时用 `crypto.X509Certificate` 比对两边的公钥，不匹配就明确告警并退回 HTTP。

配套的行为变化：一旦是 HTTPS，`request.secure` 为真 → Cookie 自动带 `Secure`、下发 HSTS（`max-age=15552000`），而"非本机必须 HTTPS"这道闸门也自然满足。所以**不要把隧道配成 `type=https`**（那会在 frps 先终结一次 TLS，本地就变成明文 HTTP，KEY 要经过隧道），应该用 `type=tcp` 让 TLS 一路到达 Node。

### D52：站点信息随 HTML 一起下发，首帧就渲染真值

`renderIndexHtml` 把 `settings` 里前端要用的字段序列化进 `<script id="boot-profile" type="application/json">`，`ProfileProvider` 首帧直接读它；只有读不到时才请求 `/api/profile`。

问题原本是：服务器在生成 HTML 时**已经知道**真实文案（`og:title`/`og:description` 就在用它），却没交给前端渲染，前端只能先用硬编码的演示数据画一帧，等请求回来再替换——表现出来就是"刷新时先闪一下旧文案"。

为什么用 `type="application/json"` 而不是内联 JS：数据块浏览器不执行，不用担心注入，也不受 CSP `script-src 'self'` 限制，是这类"首帧数据"的标准做法。序列化时必须把 `<` 转成 `\u003c`，否则站点名里写了 `</script>` 会把页面截断。

顺带解决标题跳动：`renderIndexHtml` 按 `request.path` 注入对应标题（首页 / 内容库 / 后台 / 站内详情，详情查库且校验已上架），这样 `useDocumentTitle` 之后设置的值与首字节一致，标签页不会二次变化。

开发模式必须保留兜底：`npm run dev` 时页面由 Vite（5173）提供，`index.html` 不经过后端，`__SITE_PROFILE__` 是字面量、`JSON.parse` 会失败，`readBootProfile()` 返回 null，自动走 `/api/profile`。这也保证了"后端是旧版本"时不会白屏。

### D53：卡片兜底用"连续重合"判断，不用词元重合

模型漏写 `[[cN]]` 时，服务端要从正文反推"这条回答在说哪条内容"。旧实现是 `answerText.includes(title)`，只要模型换个说法（"那个批量文件重命名的小工具" vs 标题"批量文件重命名工具"）就完全失效，卡片永远弹不出来。

改成 `pickMentionedContents()`：算回答与标题的**最长公共子串**，要求重合 ≥4 字、占标题 ≥60%，并且**重合片段必须贴在标题开头或结尾**。

为什么不用词元/分词重合：中文双字切分会把"关于夏天的记忆"和"一首关于夏天的歌"算成高度相似（共享"关于/于夏/夏天/天的"），但它们说的不是一回事。连续重合 + 头尾锚定能把这类误判挡掉；"只共享中段"的说法（半截标题）宁可不挂卡片。另外一旦存在整串命中，就丢弃所有模糊命中——模糊命中基本是"被长标题包含"的错觉。

### D54：句子里没有「你」，也可能是在问本人

`detectIntent` 原来只看有没有「你/您」，「最近在做什么」这种再自然不过的问法会被判成 `general`，于是**不注入最新内容**，访客问近况永远看不到作品。

现在补一条 `LATEST_ACTIVITY_PATTERN`：「最近…做/忙/搞/写/弄/干/玩」「在做什么」「在忙什么」「最近怎么样」「最新作品」直接判为 `self`。刻意不收「最近有什么」这类通用说法——「最近有什么新闻」问的不是本人，收进来会把人物料硬塞给常识问题。

---

## 12. 已知限制

- **换机器后模型 Key 解不开**：加密密钥绑了机器指纹，需要在设置页重新填一次（见 D33）。
- **密码不够安全时不能配置模型**：这是刻意的。判定标准是"短于阈值 / 常见口令 / 只有一类字符"，不再是只比 `admin123`；改 `.env` 的 `ADMIN_PASSWORD` 保存即生效。阈值默认 12，可用 `MIN_ADMIN_PASSWORD_LENGTH` 调低（下限 6），但调低等于放弃抗爆破能力。
- 「本回复含 AI 常识补充」靠模型自报 `general`：模型偶尔会漏写，此时不会显示这行小字（宁可不提示，也不错标）。
- 卡片兜底只认"和标题连续重合"的表述：模型把标题拆得太散（"批量那个重命名的工具"）时不会自动挂卡片，仍以模型自己写 `[[cN]]` 为主路径。
- 常识回答的知识有截止时间，可能过时；提示词只要求"不确定就说记不清"，无法保证每条都准确。
- 分类由 AI 起名，虽然做了归一，仍可能长期积累出相近分类；用「管理分类 → 合并」或「让 AI 合并近义分类」收拾。
- 「重新归类」会把所有词条重新判一遍，你手改过的分类也会被覆盖（内容与标题不受影响）。
- 疑似重复只按标题判断，标题不同但内容相同的情况查不出来。
- 依据只显示标题，所以"这句话到底参考了哪一段"无法在页面上核对（换来的是不泄露隐私）。
- 每日对话额度存在内存里，重启服务会清零；多进程部署时各自计数。
- CSP 限制 `script-src 'self'`：以后要接第三方脚本（统计、客服）需要先改 CSP，否则会被拦掉。
- 对话历史只在本浏览器：换设备/清缓存就没了；也没有"导出对话"。
- **OCR 未做**：扫描版 PDF、图片里的文字都读不出来，只会得到空文本并提示「没解析出文字」。
- 词条提炼要调一次模型（约 10–30 秒），上传后会显示「正在整理词条」并自动轮询刷新。
- 词条没有批量编辑/批量删除，只能一条条来。
- 词条分块检索仍可能漏：非常规说法命中不了同义词表。
- 问答产生的词条不会自动生成，需要点「整理成词条」或一键整理（一次最多 15 条）。
- 题目批量操作上限 200 条/次；没有"全选全部"。
- 人设卡只影响「怎么说」，不会让模型知道新的事实。
- 题目没有批量删除；撤销只能一题一题来（`reset`）。
- 检索是关键词匹配：同义改写可能召回不到，只能靠最新 3 条兜底。
- 内容正文参与检索时最多取 600 字，长文后半段可能没被模型看到。
- 未上架内容不参与检索（符合预期，但删改内容后模型记忆是即时的）。
- `/?q=` 分享链接只自动发送一次；已有历史时不会自动发送。
- 无自动化测试，验收靠人工脚本。
- 单进程 JSON 存储：只适合个人站，不适合高并发写入。
- 没有备份恢复界面，需要手工从 `data/backups/` 拷回（后台可下载备份，但不提供一键还原）。
- 列表封面未做真实缩略图（见 D22），仅懒加载 + 5MB 上限。
- 批量操作是前端逐条调用接口，条目很多时较慢，未做事务。
- 附件下载未做防盗链与流量限制（个人站可接受）。
- 回收站不会自动清理，需要手动彻底删除。

---

## 13. 运行、构建与排错

### 13.1 一键启动（统一入口）

只有一个启动脚本：`start.bat`。

**正式模式**（日常看效果、部署到服务器）：

```
双击 start.bat
```

1. 检查 Node.js（缺失则提示安装）
2. 缺少 `.env` 时从 `.env.example` 复制
3. 缺少 `server/node_modules`、`web/node_modules` 时自动安装
4. `web/dist` 缺失，或 `web/src` 等源码比产物新时，自动重新构建
5. 启动单进程服务，2 秒后打开 `http://localhost:8787/`

**开发模式**（改代码要看热更新）：

```
start.bat dev
```

1. 同样的环境检查与依赖安装
2. 打开两个窗口：后端 `8787`、前端 Vite `5173`
3. 4 秒后打开 `http://localhost:5173/`

> 开发模式下请访问 **5173**。8787 显示的是上次构建的页面，不带热更新。

**服务器上不想弹浏览器**：先 `set NO_BROWSER=1`，再运行任一模式。

### 13.3 手动命令

```powershell
cd C:\Users\pnds\Desktop\聊天
npm.cmd run dev          # 只起前端（需另开后端）
npm.cmd run dev:server   # 只起后端（--watch）
npm.cmd run build        # 构建前端
npm.cmd start            # 起后端（等价 node server/index.js）
npm.cmd run lint
npm.cmd run install:all
```

需要前后端一起起时，直接 `start.bat dev`，比手动开两个终端省事。

PowerShell 禁止 `npm.ps1` 时一律加 `.cmd`。

### 13.4 访问地址

| 地址 | 说明 |
|---|---|
| `http://localhost:8787/` | 公开首页 |
| `http://localhost:8787/admin` | 后台（未登录跳登录页） |
| `http://localhost:8787/admin/login` | 登录页 |
| `http://localhost:8787/api/health` | 健康检查 |

### 13.5 配置项（`.env`）

两个文件的分工：

- `.env`：真实配置（含后台密码），**不进 git、不进压缩包**（`.gitignore` 与 `scripts/snapshot.ps1` 都排除它）。
- `.env.example`：只有键名与默认值的模板，会跟着项目一起走。换机器时 `copy .env.example .env` 再逐项填。

| 变量 | 默认 | 说明 |
|---|---|---|
| `ADMIN_PASSWORD` | 首次启动自动生成 | 后台密码，**至少 12 位**；不写这一行时启动会自动生成 24 位随机密码并打印到控制台、写回 `.env`。密码不够安全时后台禁止配置模型。**改完保存即生效，不用重启**，且所有旧登录会立刻失效 |
| `BIND_HOST` | `127.0.0.1` | 监听地址。默认只听本机；局域网/手机调试改成 `0.0.0.0`，公网必须启用 HTTPS |
| `TLS_CERT_FILE` | `data/certs/fullchain.pem` | 证书链（叶子 + 中间证书）。文件存在即启用 HTTPS |
| `TLS_KEY_FILE` | `data/certs/privkey.pem` | 对应私钥。与证书不匹配时自动退回 HTTP 并告警 |
| `MIN_ADMIN_PASSWORD_LENGTH` | `12` | 密码最短长度（下限 6）。调小会显著降低抗暴力破解能力，仅本机离线使用才建议放松 |
| `DAILY_ADMIN_AI_LIMIT` | `400` | 后台 AI 调用（词条整理 / 出题 / 人设草稿）每天上限 |
| `LLM_ALLOW_PRIVATE` | 空 | 设成 `1` 才允许把模型地址指向内网/本机（自建 Ollama 用） |
| `SESSION_DAYS` | `7` | 登录有效期（天） |
| `SESSION_SECRET` | 空 | 留空则自动生成到 `data/.session-secret`；它同时用于加密模型 Key，删了要重填 Key |
| `PORT` | `8787` | 服务端口 |
| `MAX_UPLOAD_MB` | `100` | 单文件上限 |
| `LLM_BASE_URL` | `https://api.deepseek.com` | 首次生成的默认值，之后以设置页为准 |
| `LLM_API_KEY` | 空 | **已废弃**：仅用于把老版本的明文 Key 迁移到加密存储，迁移后自动清空 |
| `LLM_MODEL` | `deepseek-flash` | 首次生成的默认值，之后以设置页为准 |
| `DAILY_CHAT_LIMIT` | `800` | 全站每天最多对话次数（内存计数，重启清零） |
| `DAILY_CHAT_IP_LIMIT` | `120` | 单个 IP 每天最多对话次数 |
| `MACHINE_SECRET` | 空 | 换了机器但想继续用旧 Key 时，手动填原来的机器标识 |

### 13.6 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| `npm.ps1 无法加载` | PowerShell 执行策略 | 用 `start.bat`，或 `npm.cmd` |
| 页面 503「还没有前端构建产物」 | `web/dist` 缺失 | 跑 `npm run build`，或重新双击 `start.bat` |
| 后台提示登录已失效 | Cookie 过期或换了密钥 | 重新登录；确认 `data/.session-secret` 未被删除 |
| 设置页提示「后台密码不够安全」 | 密码少于 12 位，或是常见口令 | 改 `.env` 的 `ADMIN_PASSWORD`（≥12 位、字母+数字），保存即生效，再刷新设置页 |
| 手机/局域网打不开 | 默认只监听 `127.0.0.1` | `.env` 里加 `BIND_HOST=0.0.0.0` 再重启；公网务必启用 HTTPS |
| 外网 HTTPS 打不开，`https://` 连不上 | 证书没放或放错位置 | 放 `data/certs/fullchain.pem` + `privkey.pem`，看启动日志是否显示「监听：（HTTPS）」 |
| 启动日志说「证书与私钥不匹配」 | 两个文件不是同一张证书 | 重新导出配对的两个文件；顺序是叶子证书在前、中间证书在后 |
| 浏览器提示证书过期 | 证书到期 | 换新的两个文件，重启即可（不需要改代码） |
| 隧道通了但浏览器报 502 / 空响应 | 隧道是 `type=https`（在 frps 终结 TLS），而本地已是 HTTPS | 改成 `type=tcp`（TCP 透传），让 Node 做 TLS |
| 提示「模型服务地址不能是内网或本机」 | 地址指向了私网/回环，或域名解析到了内网 | 用公网 HTTPS 地址；确实要本地模型就设 `LLM_ALLOW_PRIVATE=1` |
| 提示「今天后台 AI 调用额度用完」 | 触及 `DAILY_ADMIN_AI_LIMIT`（默认 400） | 等第二天或调高该值 |
| 换机器后聊天提示没配置 Key | 加密文件与机器绑定，解不开 | 设置页重新填一次 Key |
| 页面能开但主题不切换 / 控制台报 CSP | 内联脚本被 CSP 拦 | 确认 `web/dist/theme-boot.js` 存在；重新 build |
| 对话返回 429「额度用完了」 | 触达每日上限 | 调 `DAILY_CHAT_LIMIT` 或等第二天（内存计数，重启清零） |
| 上传资料后一直「正在整理词条」 | 模型调用慢 / 失败 | 看服务日志；点「重新整理词条」重试 |
| 上传提示不支持的格式 | 扩展名不在白名单 | 见 `server/lib/content-kinds.js` |
| 上传提示超过大小上限 | 超过 `MAX_UPLOAD_MB` | 改 `.env` 后重启 |
| 端口 8787 被占用 | 已有服务在跑 | 关掉旧进程或改 `PORT` |
| 封面不显示 | 文件被手工删除 | 重新上传封面；`db.json` 里仍有旧路径 |
| 数据想重置 | — | 停服务，删 `data/`，重启自动重建（会连 Key 一起丢） |

### 13.7 数据位置与迁移

- `data/db.json`：内容、设置、人设、蒸馏
- `data/uploads/`：封面、附件、资料
- `data/backups/`：自动备份
- `data/secrets/`：加密后的模型 Key（换机器失效）
- `data/logs/`：安全审计日志

**整个 `data/` 必须随项目一起迁移**；`.env` 也要带走，否则密码与密钥会变。

⚠️ 注意：`data/secrets/llm-key.enc` 与机器绑定，迁移到新机器后需要在设置页重填 Key；备份与快照都不包含 `data/`，所以 Key 不会随备份跑出去。

---

## 14. 下一步

### 14.1 已完成（v1.0.0 / v1.1.0）

1. ~~`/?q=问题` 分享链接自动发送~~ ✅
2. ~~对话历史存 `localStorage`（刷新不丢）~~ ✅
3. ~~回答溯源（依据 N 条）~~ ✅
4. ~~模型 Key 加密 + 防外流 + CSP + 每日额度~~ ✅
5. ~~问答转词条 / 题目批量 / 补维度 / 异步词条整理~~ ✅
6. ~~词条独立成页 + AI 分类体系 + 分类管理~~ ✅

### 14.2 上线前还需要（用户暂缓）

1. 域名 + 反向代理 + HTTPS（`Secure` Cookie 与 HSTS 依赖它）
2. 每日备份自动清理与一键还原界面
3. 首屏体积优化（当前 418KB JS，可再拆包）
4. 真机移动端回归（iOS 输入框缩放、长按选择）

### 14.3 继续打磨的候选

1. OCR（扫描版 PDF 与图片），可先用本地 `tesseract.js`
2. 词条批量整理（按分类筛选、合并重复项、从问答批量回填）
3. 对话导出 / 多端同步
4. 自动化测试（至少覆盖接口鉴权与检索打分）

M2 打磨完成后停下来，汇报「改了什么、怎么验证、已知问题」，等确认后再继续。

---

## 15. 版本与快照

| 版本 | 里程碑 | 快照文件 | 说明 |
|---|---|---|---|
| v0.1.0-m0 | M0 | `snapshots/v0.1.0-m0-20261110-1413.zip` | 静态门面 + 假对话（48 文件） |
| v0.2.0-m1 | M1 | `snapshots/v0.2.0-m1-20261110-1427.zip` | 数据层 + 登录 + 内容上传/管理/下载 + 一键启动（86 文件） |
| v0.2.1 | M1 修订 | `snapshots/v0.2.1-20261110-1533.zip` | 启动脚本合并为单个 `start.bat`（`dev` 参数切模式）+ 自动重建检测 |
| v0.2.2 | M1 修订 | `snapshots/v0.2.2-20261110-1704.zip` | 设置页可填 API Key（写 `.env`）+ 默认模型改为 deepseek-flash |
| v0.3.0-m3 | M3 核心 | ——（已被 v0.3.1 取代并删除） | 真实模型对话 + 关键词检索 + 内容卡片 + 下载/外链 |
| v0.3.1 | M3 修订 | `snapshots/v0.3.1-20261110-1742.zip` | 同一份代码 + 话题策略：三类问题分流，寒暄/常识不再扯项目 |
| v0.3.2 | M1 打磨 | `snapshots/v0.3.2-20261111-0922.zip` | 正确性 5 项 + 后台体验（预览/进度/批量/回收站/排序/备份）+ 详情页 + 拖拽 |
| v0.4.0-m2 | M2 | `snapshots/v0.4.0-m2-20261111-1002.zip` | 蒸馏后台：资料解析、知识分块、问题蒸馏、人设卡；蒸馏成果接入对话（110 文件） |
| v0.4.1-m2-facts | M2 词条层 | `snapshots/v0.4.1-m2-facts-20261111-1202.zip` | 事实词条层（可查看/编辑/删除）+ 同义词检索修复 + 12 维度出题（0.35MB） |
| v0.9.9 | 基线 | `蒸馏博客v0.9.9.zip` + `snapshots/v0.9.9-*.zip` | v1.0.0 开工前的完整基线（0.35MB） |
| v1.0.0 | 正式 | `蒸馏博客v1.0.0.zip` + `snapshots/v1.0.0-*.zip` | 对话收尾 + 蒸馏增强 + 安全加固（加密 Key / 二次确认 / CSP / 每日额度 / 审计） |
| v1.1.0 | 词条体系 | `蒸馏博客v1.1.0.zip` + `snapshots/v1.1.0-*.zip` | 词条独立成页（搜索/筛选/批量/重复提示）+ AI 分类表（自动起名、可改名合并、重新归类） |
| v1.2.0 | 回答策略 | `蒸馏博客v1.2.0.zip` + `snapshots/v1.2.0-*.zip` | 客观常识可答（不再把常识锁在材料里）+ 回答下方标注「AI 常识回答」+ 依据只显示标题（隐私） |
| v1.2.1 | 配置整理 | `蒸馏博客v1.2.1.zip` + `snapshots/v1.2.1-*.zip` | `.env.example` 去掉真实密码、补齐额度与 `MACHINE_SECRET`、标注 `LLM_API_KEY` 已废弃 |
| v1.2.2 | 密码体验 | `蒸馏博客v1.2.2.zip` + `snapshots/v1.2.2-*.zip` | 改 `.env` 里的后台密码保存即生效（不用重启），旧登录自动失效 |
| v1.2.3 | 文件体检 | `蒸馏博客v1.2.3.zip` + `snapshots/v1.2.3-*.zip` | 上传目录孤儿文件检测（启动提示 + 设置页一键清理） |
| v1.2.4 | 打磨 | `蒸馏博客v1.2.4.zip` + `snapshots/v1.2.4-*.zip` | 复制/重新生成、401 跳登录、分享预览注入、出题跨维度且题型交替、路由懒加载（主包 −29%） |
| v1.2.5 | 内容库 | `蒸馏博客v1.2.5.zip` + `snapshots/v1.2.5-*.zip` | 公开内容库页 `/contents`（搜索 + 类型筛选）+ 侧栏「内容」变真入口，删掉两个占位按钮 |
| v1.2.6 | 安全加固 | `蒸馏博客v1.2.6.zip` + `snapshots/v1.2.6-*.zip` | 修复对抗审查的 9 条：密码强度闸门、随机初始密码、登录退避与审计、私网/HTTP 地址拦截、默认只听本机、后台 AI 额度、status 脱敏、会话可撤销 |
| v1.2.7 | 密码阈值 | `蒸馏博客v1.2.7.zip` + `snapshots/v1.2.7-*.zip` | 密码最短长度改为 `MIN_ADMIN_PASSWORD_LENGTH`（下限 6、默认 12）；本机按用户要求设为 6 位阈值 + 指定密码（抗爆破强度下降，其余防护保留） |
| v1.2.8 | 登录页改密码 | `蒸馏博客v1.2.8.zip` + `snapshots/v1.2.8-*.zip` | 登录页可直接改密码（当前密码 + 新密码两遍），写 `.env` 后回读校验并换发新会话，旧登录全部失效 |
| v1.2.9 | 安全修复 | `蒸馏博客v1.2.9.zip` + `snapshots/v1.2.9-*.zip` | 修复 HTTPS 判据：伪造 `X-Forwarded-Proto` 不再能绕过"非本机必须 HTTPS" |
| v1.3.0 | 交接文档 | `蒸馏博客v1.3.0.zip` + `snapshots/v1.3.0-*.zip` | 新增 `HANDOFF.md`：需求真相、代码地图、安全模型、服务器部署与迁移步骤、改代码硬规则 |
| v1.3.1 | 修复 | `蒸馏博客v1.3.1.zip` + `snapshots/v1.3.1-*.zip` | 修复 `.map(导出函数)` 把索引当参数导致的 500（问答转词条、资料重新整理）；导出函数可选参数改对象解构 |
| v1.3.2 | HTTPS | `蒸馏博客v1.3.2.zip` + `snapshots/v1.3.2-*.zip` | Node 自带 HTTPS（`data/certs/` 放两个文件即启用）+ 启动自检证书配对与到期 + 隧道只需 TCP 透传 |
| v1.3.3 | 首屏与清理 | `版本/蒸馏博客v1.3.3.zip`（**含 data/**，181 文件 / 0.62MB） | 站点信息随 HTML 内联（刷新不再闪旧文案、省掉 `/api/profile`）+ 按路由注入标题；清理 M0 残留与界面运维细节；`start.bat` 重写；打包脚本新增 `-IncludeData` |
| v1.3.4 | 全流程审计修复 + 上线整包 | `111/蒸馏博客v1.3.4.zip`（153 文件 / 0.62MB，**含线上数据**，不含 `.env`/`node_modules`/`data/logs`/`data/backups`） | ① 退出登录不再卡登录页；② 「最近在做什么」能弹卡片（新增 `pickMentionedContents` + 「不带你的近况问句」识别）；③ 下载文件格式提示按类型给；④ 常识标注改「含 AI 常识补充」；⑤ 维度与资料计数文案；⑥ 打出可直接上线的整包（源码 + `web/dist` + 线上数据 + 证书） |
| v1.3.5 | GitHub 源码包 | `版本/蒸馏博客v1.3.5.zip`（121 文件 / 0.35MB，**不含数据**） | 不含 `data/`、`.env`、`node_modules`、`web/dist`；全新 clone 首次启动自动生成 24 位随机后台密码（ADR D55，修掉了没有 `.env` 时退回默认口令的洞） |

生成快照（**只在用户明确说「打包」时执行**）：

```powershell
cd C:\Users\pnds\Desktop\聊天
# 只打源码（默认）
powershell -ExecutionPolicy Bypass -File scripts/snapshot.ps1 -Version "v1.3.3"

# 连 data/ 一起打（整体迁移到服务器时用）
powershell -ExecutionPolicy Bypass -File scripts/snapshot.ps1 -Version "v1.3.3" -IncludeData
```

两种模式的差别：

| | 默认（源码包） | `-IncludeData`（整包） |
|---|---|---|
| 源码、`web/dist`、文档、`start.bat` | ✅ | ✅ |
| `data/db.json`、`data/uploads/` | ❌ | ✅ |
| `data/certs/`、`data/secrets/`、`data/.session-secret` | ❌ | ✅ |
| `data/backups/` | ❌ | ✅ |
| `data/logs/` | ❌ | ❌（运行痕迹，不是业务数据） |
| `.env` | ❌ | ❌（含后台密码，需单独拷贝或按 `.env.example` 重建） |
| `node_modules`、历史 zip | ❌ | ❌ |

> ⚠️ 含数据的包里有 TLS 私钥和加密后的模型 Key，只用于自己迁移，**不要外发**。

回滚方式：停掉服务 → 解压对应 zip 覆盖项目目录 → 放回自己的 `.env` → 重新 `start.bat`。

---

*本文档由项目维护者与 AI 助手共同维护。每次改动请先读 §0.2，再更新 §10 和受影响章节。*
