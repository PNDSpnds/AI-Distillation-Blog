import { badRequest } from '../lib/http-error.js'
import {
  FREQUENCY_OPTIONS,
  createEmptyPersona,
  formatPersonaForPrompt,
  hasPersonaContent,
  normalizePersona,
} from '../lib/persona.js'
import { getDb, mutateDb } from '../repositories/db.js'
import { requestJsonCompletion } from './llm-service.js'
import { readExtractedText } from './distill-sources-service.js'

/** 生成草稿时最多喂给模型多少字，避免超长资料拖慢甚至失败 */
const PROMPT_BUDGET = 7000

/** 人设卡内容 + 是否有未确认草稿 */
export function getPersona() {
  const db = getDb()
  return {
    persona: db.persona,
    hasContent: hasPersonaContent(db.persona),
    draft: db.personaDraft,
  }
}

/** 手动保存人设卡 */
export async function savePersona(input) {
  const next = normalizePersona({ ...input, updatedAt: new Date().toISOString() })
  await mutateDb((db) => {
    db.persona = next
  })
  return getPersona()
}

/** 丢弃草稿 */
export async function discardDraft() {
  await mutateDb((db) => {
    db.personaDraft = null
  })
  return getPersona()
}

/** 把草稿应用为正式人设（用户确认后才走这一步） */
export async function applyDraft() {
  const db = getDb()
  if (!db.personaDraft) throw badRequest('没有待确认的草稿')

  const next = normalizePersona({ ...db.personaDraft, updatedAt: new Date().toISOString() })
  await mutateDb((state) => {
    state.persona = next
    state.personaDraft = null
  })
  return getPersona()
}

/** 组装分析素材：优先资料正文，其次已发布内容的标题+简介+正文片段 */
function buildAnalysisBrief() {
  const db = getDb()
  const parts = []
  let budget = PROMPT_BUDGET

  for (const source of db.distillSources.filter((item) => item.status === 'parsed')) {
    if (budget <= 0) break
    const text = readExtractedText(source.id).slice(0, Math.min(budget, 3000))
    if (!text) continue
    budget -= text.length
    parts.push(`【资料：${source.fileName}】\n${text}`)
  }

  for (const item of db.contents.filter((content) => content.published && !content.deletedAt)) {
    if (budget <= 0) break
    const body = (item.body ?? '').slice(0, 600)
    const block = `【内容：${item.title}】\n类型：${item.kindLabel || item.kind}\n简介：${item.summary}\n${body ? `正文：${body}` : ''}`
    budget -= block.length
    parts.push(block)
  }

  return parts.join('\n\n')
}

const PERSONA_SYSTEM_PROMPT = `你要从作者自己的文字里，归纳出「他说话的样子」，供一个数字分身模仿。

铁律：
1. 只根据给出的文字判断，不要凭空想象。看不出来的字段留空字符串或空数组。
2. 不要写评价式的话（例如"善于思考""很有深度"），只写可观察的特征。
3. 语言风格、标点习惯、常用词要具体到能在写作时照做，例如「习惯用短句，一句一断」而不是「简洁」。
4. 输出必须是 JSON，不要解释。

字段说明：
- identity：一句话，他是谁、在做什么（从文字里能看到的）
- addressing：他通常在怎么称呼读者
- speaking.sentenceLength：句子长度特征
- speaking.commonWords：他反复使用的 3–5 个词
- speaking.punctuation：标点习惯（例如爱用破折号、少用感叹号）
- speaking.emoji：表情符号使用情况，没有就写「不用」
- speaking.neverSay：从文风判断他大概不会用的词或腔调
- emotion.caring：他会怎么表达关心
- emotion.upset：他会怎么表达不满
- emotion.joking：他开玩笑时的样子
- boundaries.knows：他明显熟悉的话题
- boundaries.unknown：文字里没涉及、他大概不了解的
- boundaries.deflect：他可能不愿意展开的话题
- catchphrases：口头禅数组，每项 { text, frequency }，frequency 只能是 高/中/低

输出 JSON：
{"identity":"","addressing":"","speaking":{"sentenceLength":"","commonWords":[],"punctuation":"","emoji":"","neverSay":[]},"emotion":{"caring":"","upset":"","joking":""},"boundaries":{"knows":"","unknown":"","deflect":""},"catchphrases":[{"text":"","frequency":"中"}]}`

/**
 * 生成人设草稿。
 * 只写入 personaDraft，不动正式人设——用户确认后才生效。
 */
export async function generateDraft() {
  const brief = buildAnalysisBrief()
  if (!brief) {
    throw badRequest('还没有可分析的素材：先上传资料，或先发布几条内容')
  }

  const parsed = await requestJsonCompletion({
    messages: [
      { role: 'system', content: PERSONA_SYSTEM_PROMPT },
      { role: 'user', content: `以下是作者自己的文字：\n\n${brief}` },
    ],
    maxTokens: 3000,
    temperature: 0.3,
  })
  if (!parsed) throw new Error('模型返回的内容无法解析，稍后再试')

  const draft = normalizePersona({
    ...parsed,
    catchphrases: Array.isArray(parsed.catchphrases)
      ? parsed.catchphrases.filter((item) =>
          FREQUENCY_OPTIONS.includes(item?.frequency ?? ''),
        )
      : [],
    updatedAt: new Date().toISOString(),
  })

  if (!hasPersonaContent(draft)) {
    throw new Error('这次没有提炼出可用的人设信息，试试多上传一些文字资料')
  }

  await mutateDb((db) => {
    db.personaDraft = draft
  })

  return getPersona()
}

/** 供对话系统提示词使用：已确认的人设文本 */
export function getPersonaPromptText() {
  return formatPersonaForPrompt(getDb().persona)
}

/** 供前端展示空表单 */
export function getEmptyPersona() {
  return createEmptyPersona()
}
