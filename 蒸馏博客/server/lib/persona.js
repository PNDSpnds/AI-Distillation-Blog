/**
 * 人设卡的字段结构。
 * 后端用它校验/补全，前端用它渲染表单，保持同一份定义。
 */

/** 口头禅的使用频率选项 */
export const FREQUENCY_OPTIONS = ['高', '中', '低']

/** 空白人设：所有字段都有默认值，前端不用处理 undefined */
export function createEmptyPersona() {
  return {
    identity: '',
    addressing: '',
    speaking: {
      sentenceLength: '',
      commonWords: [],
      punctuation: '',
      emoji: '',
      neverSay: [],
    },
    emotion: {
      caring: '',
      upset: '',
      joking: '',
    },
    boundaries: {
      knows: '',
      unknown: '',
      deflect: '',
    },
    catchphrases: [],
    updatedAt: '',
  }
}

/** 把任意输入收敛成合法人设结构，缺字段用默认值补齐 */
export function normalizePersona(input) {
  const base = createEmptyPersona()
  if (!input || typeof input !== 'object') return base

  const text = (value, limit = 400) =>
    typeof value === 'string' ? value.trim().slice(0, limit) : ''

  const list = (value, limit = 12, itemLimit = 30) =>
    Array.isArray(value)
      ? value
          .filter((item) => typeof item === 'string' && item.trim())
          .map((item) => item.trim().slice(0, itemLimit))
          .slice(0, limit)
      : []

  return {
    identity: text(input.identity),
    addressing: text(input.addressing, 200),
    speaking: {
      sentenceLength: text(input.speaking?.sentenceLength, 120),
      commonWords: list(input.speaking?.commonWords, 10, 12),
      punctuation: text(input.speaking?.punctuation, 200),
      emoji: text(input.speaking?.emoji, 120),
      neverSay: list(input.speaking?.neverSay, 10, 30),
    },
    emotion: {
      caring: text(input.emotion?.caring, 200),
      upset: text(input.emotion?.upset, 200),
      joking: text(input.emotion?.joking, 200),
    },
    boundaries: {
      knows: text(input.boundaries?.knows, 500),
      unknown: text(input.boundaries?.unknown, 500),
      deflect: text(input.boundaries?.deflect, 300),
    },
    catchphrases: Array.isArray(input.catchphrases)
      ? input.catchphrases
          .filter((item) => item && typeof item.text === 'string' && item.text.trim())
          .slice(0, 8)
          .map((item) => ({
            text: item.text.trim().slice(0, 40),
            frequency: FREQUENCY_OPTIONS.includes(item.frequency) ? item.frequency : '中',
          }))
      : [],
    updatedAt: text(input.updatedAt, 40) || base.updatedAt,
  }
}

/** 人设卡是否「有内容」：用来判断要不要注入系统提示词 */
export function hasPersonaContent(persona) {
  if (!persona) return false
  return Boolean(
    persona.identity ||
      persona.addressing ||
      persona.speaking?.sentenceLength ||
      persona.speaking?.punctuation ||
      persona.emotion?.caring ||
      persona.boundaries?.knows ||
      (persona.catchphrases?.length ?? 0) > 0,
  )
}

/** 把结构化成一段可读文本，直接塞进系统提示词 */
export function formatPersonaForPrompt(persona) {
  if (!hasPersonaContent(persona)) return ''

  const lines = []
  const add = (label, value) => {
    if (value) lines.push(`- ${label}：${value}`)
  }

  add('身份', persona.identity)
  add('怎么称呼访客', persona.addressing)

  const speaking = persona.speaking ?? {}
  add('句子长度', speaking.sentenceLength)
  if (speaking.commonWords?.length) add('常用词', speaking.commonWords.join('、'))
  add('标点习惯', speaking.punctuation)
  add('表情符号', speaking.emoji)
  if (speaking.neverSay?.length) add('绝不会说的词', speaking.neverSay.join('、'))

  const emotion = persona.emotion ?? {}
  add('关心时', emotion.caring)
  add('不满时', emotion.upset)
  add('开玩笑时', emotion.joking)

  const boundaries = persona.boundaries ?? {}
  add('懂的', boundaries.knows)
  add('不懂的', boundaries.unknown)
  add('会被敷衍的话题', boundaries.deflect)

  if (persona.catchphrases?.length) {
    add(
      '口头禅',
      persona.catchphrases.map((item) => `「${item.text}」（${item.frequency}）`).join('、'),
    )
  }

  return lines.join('\n')
}
