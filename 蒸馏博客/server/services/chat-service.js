import { getDb } from '../repositories/db.js'
import { categoryLabelOf } from './fact-service.js'
import { retrieveContents, retrieveFacts, retrieveKnowledge, pickMentionedContents } from './retrieval-service.js'
import { streamChatCompletion } from './llm-service.js'
import { toPublicContent } from './content-service.js'
import { getPersonaPromptText } from './persona-service.js'

/** 正文与结构化数据的分隔标记，与前端约定一致 */
const META_MARKER = '⟦META⟧'

/** 纯问候短句：整句只有招呼语，没有别的内容 */
const GREETING_PATTERN =
  /^(你好|您好|哈喽|哈啰|嗨|hi|hello|hey|在吗|在不在|早上好|上午好|中午好|下午好|晚上好|早安|晚安)[\s!！。.~～,，?？]*$/i

/**
 * 问本人近况的句子经常不带「你」：「最近在做什么」「最近在忙什么」。
 * 这类问题问的仍然是本人，必须带上最新内容，否则问「最近在做什么」答不出作品。
 * 但「最近有什么新闻」不能算进来，所以只认这几种固定说法。
 */
const LATEST_ACTIVITY_PATTERN =
  /最近.{0,4}(做|忙|搞|写|弄|干|玩)|最近怎么样|最近如何|在做什么|在忙什么|有何新作|最新(的)?(作品|内容|项目|动态)/

/**
 * 粗判问题类型：
 * - greeting：纯打招呼，不塞任何项目材料
 * - self：在问“你”的事（经历、作品、看法），需要带上材料
 * - general：和本人无关（算术、常识、通用问题），不主动塞最新项目
 *
 * 这里故意用简单规则：判断错了也不会编造，最多是多带/少带一点上下文。
 */
export function detectIntent(query) {
  const text = String(query ?? '').trim()
  if (!text) return 'general'
  if (GREETING_PATTERN.test(text)) return 'greeting'
  if (LATEST_ACTIVITY_PATTERN.test(text)) return 'self'
  if (/你|您/.test(text)) return 'self'
  return 'general'
}

/** 单条内容正文在提示词里最多带多少字，避免撑爆上下文 */
const BODY_EXCERPT = 600

function formatDate(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

/** 把检索结果编号成 c1、c2…，提示词与 META 都用这个编号 */
function buildContextBlocks(items, startIndex = 0) {
  return items.map((record, index) => {
    const id = `c${startIndex + index + 1}`
    const body = (record.body ?? '').trim()
    const excerpt = body.length > BODY_EXCERPT ? `${body.slice(0, BODY_EXCERPT)}…` : body

    return {
      id,
      kind: 'content',
      record,
      text: [
        `[${id}]《${record.title}》`,
        `类型：${record.kindLabel ?? record.kind}`,
        record.category ? `分类：${record.category}` : '',
        record.tags?.length ? `标签：${record.tags.join('、')}` : '',
        `日期：${formatDate(record.publishedAt || record.createdAt)}`,
        `简介：${record.summary ?? ''}`,
        excerpt ? `正文：${excerpt}` : '',
        record.jumpUrl ? `外链：${record.jumpUrl}` : '',
        record.filePath ? `附件：${record.fileName || '有可下载文件'}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    }
  })
}

/** 蒸馏知识块：没有卡片，只作为事实与语气依据 */
function buildKnowledgeBlocks(items, startIndex) {
  return items.map((entry, index) => {
    const id = `c${startIndex + index + 1}`
    return {
      id,
      kind: 'knowledge',
      record: entry,
      text: [
        `[${id}] 关于${entry.sourceType === 'qa' ? '我自己的问答记录' : '我的资料'}（${entry.title ?? ''}）`,
        entry.text,
      ]
        .filter(Boolean)
        .join('\n'),
    }
  })
}

/**
 * 事实词条块：一条一行，最像「本人记得的事实」。
 * 词条是后台可见可改的，所以它比原文段落更值得优先注入。
 */
function buildFactBlocks(items, startIndex) {
  return items.map((entry, index) => {
    const id = `c${startIndex + index + 1}`
    const time = entry.time ? `（${entry.time}）` : ''
    return {
      id,
      kind: 'fact',
      record: entry,
      text: `[${id}] ${categoryLabelOf(entry.categoryId)} · ${entry.title}${time}：${entry.content}`,
    }
  })
}

/** 系统提示词：人设 + 可用材料 + 分类规则 + 输出协议 */
function buildSystemPrompt({ settings, blocks, intent, personaText }) {
  const name = settings.ownerName || settings.siteName || '作者'

  const contextText =
    blocks.length > 0
      ? blocks.map((block) => block.text).join('\n\n')
      : '（这次没有找到和你本人相关的材料）'

  const personaSection = personaText
    ? `\n【你说话的样子】\n下面是从你自己写过的东西里总结出来的特征，回答时照着它说话：\n${personaText}\n`
    : ''

  return `你是${name}本人。这里是${name}的个人主页，你正在和一位访客说话。

【你的自我介绍】
${settings.greeting || ''}
${settings.intro || ''}
${personaSection}
【你手上真实的材料】
下面是${name}真实上传过的内容与资料，编号 c1、c2…。这些是「关于你的证据」，不是必须每句都提的东西。
标着分类名（例如「荣誉」「经历」「技能」）的行是整理好的事实词条，可以直接当作你记得的事来回答。

${contextText}

【怎么回答问题】
判断标准不是句子里有没有「你」，而是**问的这件事是「你身上的事」还是「外面的世界」**。

一、问的是你身上的事（你的经历、去过哪、做过什么、得过什么、你的作品、你的看法、你的喜好、你的关系、身体、花销、打算）
- 以材料为准，照词条里的具体信息说（名称、时间、地点、数字尽量带上），不要含糊成"有过一些"。
- 词条里没写的细节一律不加：例如只写了「参加过无偿献血」，就别说「证书还在」「献过三次」。
- 材料里确实没有的，就说「这个我没写过」「不记得了」「没印象」。
- 只沾一点边的，说「大概沾点边，但我不确定」。

二、问的是外面的世界（某个地方有什么、某个东西是什么、某个概念/原理/历史、别人的作品、通用经验）
- 即使问句里带着「你的家乡」「你的学校」「你的专业」，只要问的是那个地方/东西本身，就用你自己知道的知识正常回答。
  例：「你家乡有啥好东西」→ 说那个地方出名的事物就行，不用因为"我没写过"而拒绝。
- 不确定的就说记不清，别编精确数字（年份、排名、价格、政策、统计数据）。
- 这一部分不要标编号引用。

三、两种混在一起时（很常见）
- 拆开答：常识部分正常说，涉及你自己的部分按材料说。
  例：「潍坊风筝挺有名的……我自己倒没怎么写过这些，小时候印象最深的就是上学。」
- 不要为了区分而解释机制。

四、与你和常识都无关的问题
- 正常回答，像平时聊天一样。

【不要做的事】
- 不要说「这属于常识不是我的经历」「这不是我记录过的」「不敢给你列」这类解释自己怎么工作的话。
- 不要用常识补你的个人经历、成绩、作品细节、观点、关系、身体、钱、承诺。
- 不要对访客说「材料」「上下文」「检索」「词条」这些词。

【说话的规矩】
- 第一句就给答案或态度，不要铺垫，不要说「这是个好问题」。
- 一般不超过 150 字；对方说「展开讲讲」才写长。
- 问「有哪些奖 / 做过什么 / 会什么」这类列清单的问题，最多举 3–4 个最有代表性的，其余用「还有几个」带过；对方明确说「都说」才全列。
- 结尾不要总结，不要反问「还有什么想了解的」。
- 用第一人称。
- 不要主动把话题往你的项目、作品上引。只有对方问起，或者材料正好能回答他的问题时，才提。
${intent === 'greeting' ? '- 对方现在只是打招呼，就自然回应一两句，不要罗列最近的项目。\n' : ''}- 对方直接问你是不是 AI、是不是本人，就坦白说自己是基于${name}写过的东西做的对话版本，一句话带过；不要否认，也不要长篇解释。

【输出格式】
先写回答正文。然后另起一行，必须输出下面这一行，不允许省略、不允许改写标记：
${META_MARKER}{"general":false,"citations":["c1"],"followups":["...","..."]}
general（第一个字段，必须写）：这次回答里只要用到了「你自己知道、但材料里没有写」的知识，就填 true。
  典型会被判 true 的情况：介绍某个地方的特产/景点、解释某个概念或原理、讲别人的作品和历史、给通用建议。
  例：「你家乡有啥好东西」→ 说了潍坊风筝、杨家烧年画，这就是 true。
  完全靠材料和个人寒暄（例如打招呼、说自己拿过什么奖）→ false。
citations 只填你真正用到的编号（没用到就 []）。
followups 是两个自然的、对方可能接着问的问题，要紧跟着刚才的话题；如果这个问题本来就不适合追问，就给空数组 []。`
}

/** 把历史消息裁剪成模型可接受的形状：只留 user/assistant，最近 10 轮，单条 1000 字 */
export function normalizeMessages(rawMessages) {
  if (!Array.isArray(rawMessages)) return []

  const cleaned = rawMessages
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
    .map((item) => ({
      role: item.role,
      content: String(item.content ?? '').slice(0, 1000).trim(),
    }))
    .filter((item) => item.content)

  // 保留最近 10 轮（user + assistant 各算一条）
  return cleaned.slice(-20)
}

/** 从模型输出里解析 META；失败时降级为空，不影响正文 */
function parseMeta(metaText) {
  const fallback = { general: false, citations: [], followups: [] }
  if (!metaText) return fallback

  const trimmed = metaText.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end <= start) return fallback

  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1))
    return {
      general: parsed.general === true,
      citations: Array.isArray(parsed.citations)
        ? parsed.citations.filter((item) => typeof item === 'string').slice(0, 6)
        : [],
      followups: Array.isArray(parsed.followups)
        ? parsed.followups.filter((item) => typeof item === 'string' && item.trim()).slice(0, 3)
        : [],
    }
  } catch {
    return fallback
  }
}

/**
 * 边收边解析：把 ⟦META⟧ 前后的内容分开。
 * 需要保留末尾若干个字符，避免标记被切在两个分片之间。
 */
function createMetaSplitter(onText) {
  let buffer = ''
  let collectingMeta = false
  let metaText = ''
  const keepLength = META_MARKER.length - 1

  return {
    push(chunk) {
      if (collectingMeta) {
        metaText += chunk
        return
      }

      buffer += chunk
      const markerIndex = buffer.indexOf(META_MARKER)

      if (markerIndex !== -1) {
        const visible = buffer.slice(0, markerIndex)
        if (visible) onText(visible)
        metaText = buffer.slice(markerIndex + META_MARKER.length)
        buffer = ''
        collectingMeta = true
        return
      }

      if (buffer.length <= keepLength) return
      const visible = buffer.slice(0, buffer.length - keepLength)
      buffer = buffer.slice(buffer.length - keepLength)
      if (visible) onText(visible)
    },
    finish() {
      if (!collectingMeta && buffer) {
        onText(buffer)
        buffer = ''
      }
      return metaText
    },
  }
}

/**
 * 把被引用的编号翻译成「回答依据」，给访客看。
 * 只输出真正存在的编号，避免模型编出 c99 这种假引用。
 *
 * 注意：这里**只给标题/问题，不给内容摘要**。
 * 依据里的内容可能是资料原文或问答答案，属于隐私，不该在页面上展示给任何访客。
 */
function buildSources(codes, blocks) {
  const byCode = new Map(blocks.map((block) => [block.id, block]))
  const sources = []

  for (const code of codes) {
    const block = byCode.get(code)
    if (!block) continue

    if (block.kind === 'fact') {
      const record = block.record
      sources.push({
        code,
        kind: 'fact',
        title: record.title ?? '',
        label: categoryLabelOf(record.categoryId),
      })
      continue
    }

    if (block.kind === 'knowledge') {
      const record = block.record
      sources.push({
        code,
        kind: 'knowledge',
        title: record.title ?? '资料片段',
        label: record.sourceType === 'qa' ? '问答' : '资料',
      })
      continue
    }

    const record = block.record
    sources.push({
      code,
      kind: 'content',
      title: record.title ?? '',
      label: record.kindLabel ?? '内容',
      contentId: record.id,
    })
  }

  return sources
}

/**
 * 一次完整问答：检索 → 拼提示词 → 流式调用 → 切分正文与 META → 回传卡片。
 * 通过 send 回调把 SSE 事件交给路由层。
 */
export async function runChat({ messages, send, signal }) {
  const lastUser = [...messages].reverse().find((item) => item.role === 'user')
  const query = lastUser?.content ?? ''
  const intent = detectIntent(query)

  const { settings } = getDb()
  // 寒暄与常识类问题不注入最新项目，避免“三句不离我的作品”
  const retrieval = retrieveContents(query, { includeLatest: intent === 'self' })

  // 蒸馏出来的词条与知识只在真的问到本人时才带，寒暄不带，免得答「你好」也念资料
  const facts = intent === 'greeting' ? [] : retrieveFacts(query, { limit: 8 })
  // 词条已经命中时，原文块只补 2 段兜底；词条没命中才多取一些
  const knowledge =
    intent === 'greeting' ? [] : retrieveKnowledge(query, { limit: facts.length > 0 ? 2 : 4 })

  // 编号顺序：事实词条 → 内容卡片 → 原文兜底，越靠前越可信
  const factBlocks = buildFactBlocks(facts, 0)
  const contentBlocks = buildContextBlocks(retrieval.items, factBlocks.length)
  const knowledgeBlocks = buildKnowledgeBlocks(knowledge, factBlocks.length + contentBlocks.length)
  const blocks = [...factBlocks, ...contentBlocks, ...knowledgeBlocks]

  // 编号 → 内容记录，只有内容块能挂卡片，词条与原文只做事实依据
  const blockByCode = new Map(contentBlocks.map((block) => [block.id, block.record]))

  const systemPrompt = buildSystemPrompt({
    settings,
    blocks,
    intent,
    personaText: getPersonaPromptText(),
  })
  const llmMessages = [{ role: 'system', content: systemPrompt }, ...messages]

  // 累积正文，用于在模型漏写 citations 时做兜底匹配
  let answerText = ''
  const splitter = createMetaSplitter((text) => {
    answerText += text
    send({ type: 'delta', text })
  })

  await streamChatCompletion({
    messages: llmMessages,
    signal,
    onDelta: (chunk) => splitter.push(chunk),
  })

  const metaText = splitter.finish()
  const meta = parseMeta(metaText)

  // 兜底一：模型漏标编号时，从正文反推它在说哪条内容
  // 不能只比对完整标题——模型常说「那个批量重命名的小工具」而不是原样抄标题，
  // 所以交给 pickMentionedContents 按词元重合度判断，宁可不挂也不挂错
  let citationCodes = meta.citations
  if (citationCodes.length === 0 && answerText) {
    const mentioned = pickMentionedContents(
      answerText,
      contentBlocks.map((block) => block.record),
      { max: 2 },
    )
    const codeByRecordId = new Map(contentBlocks.map((block) => [block.record.id, block.id]))
    citationCodes = mentioned.map((record) => codeByRecordId.get(record.id)).filter(Boolean)
  }

  const cards = []
  const seen = new Set()
  for (const code of citationCodes) {
    const record = blockByCode.get(code)
    if (!record || seen.has(record.id)) continue
    seen.add(record.id)
    const dto = toPublicContent(record)
    cards.push({
      // code 用于把正文里的 [[c1]] 映射到这张卡片
      code,
      id: dto.id,
      kind: dto.kind,
      kindLabel: dto.kindLabel,
      title: dto.title,
      summary: dto.summary,
      coverUrl: dto.coverUrl,
      jumpUrl: dto.jumpUrl,
      downloadUrl: dto.downloadUrl,
      body: dto.body,
    })
  }

  // 兜底：只有问到本人、且确实有卡片时，才补项目相关的追问；其余情况宁可不显示
  const followups = [...meta.followups]
  if (intent === 'self' && cards.length > 0) {
    const fallbackFollowups = [`《${cards[0].title}》具体是做什么的？`, '你最近还在做什么？']
    for (const item of fallbackFollowups) {
      if (followups.length >= 2) break
      if (!followups.includes(item)) followups.push(item)
    }
  }

  send({
    type: 'meta',
    citations: citationCodes,
    cards,
    followups: followups.slice(0, 2),
    sources: buildSources(citationCodes, blocks),
    /** 这次回答用到了模型自己的常识（前端在回答下面显示一行小字） */
    general: meta.general,
  })
  send({ type: 'done' })
}