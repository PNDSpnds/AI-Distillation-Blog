import { createId } from '../lib/ids.js'
import { getDb, mutateDb } from '../repositories/db.js'

/** 分块参数：按 400–600 字切，块间重叠 80 字，避免一句话被切断后两边都读不懂 */
const CHUNK_MIN = 400
const CHUNK_MAX = 600
const CHUNK_OVERLAP = 80

/** 按句末标点切句，保留标点，方便拼回去 */
function splitSentences(text) {
  return text
    .split(/(?<=[。！？；\n])/)
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * 把长文切成知识块。
 * 逻辑：逐句累加，超过 CHUNK_MIN 就收一块；超过 CHUNK_MAX 强制收；
 * 下一块用上一块的尾部 CHUNK_OVERLAP 字做重叠，保证跨句的语义不断裂。
 */
export function chunkText(text) {
  const normalized = String(text ?? '').replace(/\r\n?/g, '\n').trim()
  if (!normalized) return []
  if (normalized.length <= CHUNK_MAX) return [normalized]

  const sentences = splitSentences(normalized)
  const chunks = []
  let buffer = ''

  const flush = () => {
    const piece = buffer.trim()
    if (!piece) return
    chunks.push(piece)
    // 用尾部做下一块的重叠部分
    buffer = piece.length > CHUNK_OVERLAP ? piece.slice(-CHUNK_OVERLAP) : piece
  }

  for (const sentence of sentences) {
    // 单句就超长时按硬切分，避免一块过大
    if (sentence.length > CHUNK_MAX) {
      if (buffer) flush()
      for (let index = 0; index < sentence.length; index += CHUNK_MAX) {
        const piece = sentence.slice(index, index + CHUNK_MAX)
        if (piece.length >= CHUNK_MIN || index + CHUNK_MAX >= sentence.length) {
          chunks.push(piece)
        } else {
          buffer = piece
        }
      }
      buffer = ''
      continue
    }

    buffer += sentence
    if (buffer.length >= CHUNK_MIN) flush()
  }

  const tail = buffer.trim()
  // 末尾剩余太短且与上一块重复时就不单独成块
  if (tail && tail.length > CHUNK_OVERLAP && tail !== chunks[chunks.length - 1]) {
    chunks.push(tail)
  }

  return chunks
}

/** 把一份资料的文本转成知识条目并写入数据库 */
export async function createKnowledgeFromText({ sourceId, sourceName, text, weight = 2 }) {
  const chunks = chunkText(text)
  if (chunks.length === 0) return []

  const now = new Date().toISOString()
  const entries = chunks.map((chunk, index) => ({
    id: createId('kn'),
    sourceType: 'material',
    sourceId,
    title: `${sourceName} · 第 ${index + 1} 段`,
    text: chunk,
    weight,
    createdAt: now,
  }))

  await mutateDb((db) => {
    // 同一份资料重复解析时先清掉旧条目，避免重复内容污染检索
    db.knowledgeEntries = db.knowledgeEntries.filter((item) => item.sourceId !== sourceId)
    db.knowledgeEntries.push(...entries)
  })

  return entries
}

/** 问答蒸馏产生的高权重知识：比资料片段更贴近「怎么说话」 */
export async function createKnowledgeFromAnswer({ questionId, question, answer }) {
  const entry = {
    id: createId('kn'),
    sourceType: 'qa',
    sourceId: questionId,
    title: question.slice(0, 60),
    text: `问：${question}\n答：${answer}`,
    weight: 3,
    createdAt: new Date().toISOString(),
  }

  await mutateDb((db) => {
    db.knowledgeEntries = db.knowledgeEntries.filter((item) => item.sourceId !== questionId)
    db.knowledgeEntries.push(entry)
  })

  return entry
}

/** 删除某份资料产生的全部知识条目 */
export async function removeKnowledgeBySource(sourceId) {
  await mutateDb((db) => {
    db.knowledgeEntries = db.knowledgeEntries.filter((item) => item.sourceId !== sourceId)
  })
}

/** 统计：资料条目 / 问答条目各多少 */
export function countKnowledge() {
  const { knowledgeEntries } = getDb()
  let material = 0
  let qa = 0
  for (const entry of knowledgeEntries) {
    if (entry.sourceType === 'qa') qa += 1
    else material += 1
  }
  return { material, qa, total: knowledgeEntries.length }
}
