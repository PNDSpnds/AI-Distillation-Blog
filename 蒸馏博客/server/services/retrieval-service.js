import { getDb } from '../repositories/db.js'
import { categoryLabelOf } from './fact-service.js'

/**
 * 中文检索用的同义词组。
 * 为什么需要：中文两字切词有盲区——问「你得什么奖」切出「你得/得什/什么/么奖」，
 * 而资料里写的是「一等奖」「获奖」，两边没有共享片段就会 0 命中。
 * 这里把常见问法归到同一组，命中任意一个就等于命中整组。
 */
const SYNONYM_GROUPS = [
  ['奖', '获奖', '奖项', '荣誉', '奖励', '表彰', '证书', '一等奖', '二等奖', '三等奖', '奖学金', '比赛', '竞赛', '大赛', '冠军', '名次'],
  ['经历', '履历', '做过', '参加', '参与', '担任', '负责', '曾', '经历过的'],
  ['教育', '学校', '大学', '学院', '专业', '学历', '本科', '硕士', '博士', '毕业', '就读', '在校'],
  ['工作', '公司', '岗位', '职位', '实习', '上班', '职业', '单位'],
  ['技能', '会', '熟悉', '掌握', '擅长', '工具', '技术', '语言', '框架'],
  ['兴趣', '爱好', '喜欢', '爱', '常玩', '收藏', '看', '听', '玩'],
  ['观点', '看法', '觉得', '认为', '态度', '主张', '想法'],
  ['生活', '日常', '作息', '习惯', '住', '吃', '睡', '周末'],
  ['家人', '家庭', '父母', '爸爸', '妈妈', '兄弟', '姐妹', '孩子', '亲人'],
  ['朋友', '伙伴', '同学', '同事', '恋爱', '对象', '伴侣', '女朋友', '男朋友'],
  ['健康', '身体', '运动', '健身', '跑步', '体检', '生病', '饮食'],
  ['献血', '公益', '志愿', '义工', '捐赠', '慈善'],
  ['目标', '计划', '打算', '想做', '未来', '梦想', '目标'],
  ['钱', '收入', '工资', '赚', '预算', '消费', '买'],
  ['失败', '遗憾', '后悔', '挫折', '没做成', '放弃'],
]

/** 预建 词 → 整组 的反查表，避免每次检索都遍历所有组 */
const SYNONYM_INDEX = new Map()
for (const group of SYNONYM_GROUPS) {
  for (const word of group) {
    if (!SYNONYM_INDEX.has(word)) SYNONYM_INDEX.set(word, new Set())
    for (const other of group) SYNONYM_INDEX.get(word).add(other)
  }
}

/**
 * 单字无意义词（虚词、代词、语气词）。
 * 单字 token 是为了命中「奖」这类关键词，但「的/了/是」到处都是，
 * 留着会把所有候选的分数一起抬高、反而失去区分度，所以直接丢掉。
 */
const SINGLE_STOPWORDS = new Set([
  '的', '了', '是', '我', '你', '他', '她', '它', '们', '在', '有', '和', '与', '就', '也',
  '都', '还', '又', '很', '太', '更', '最', '吗', '呢', '吧', '啊', '呀', '哦', '嘛', '哈',
  '这', '那', '个', '些', '什', '么', '怎', '哪', '为', '会', '能', '要', '不', '没', '过',
  '上', '下', '里', '中', '对', '把', '被', '给', '让', '到', '去', '来', '做', '说', '想',
])

/**
 * 极简中文检索：按字 bigram + 英文词切分，对标题/分类/标签/简介/正文加权计分。
 * 不依赖分词库，也不依赖 embedding；数据量在千级内容内足够用。
 */
function tokenize(text) {
  const normalized = String(text ?? '')
    .toLowerCase()
    // 中文标点、符号当分隔符处理
    .replace(/[^\p{Script=Han}a-z0-9]+/gu, ' ')
    .trim()
  if (!normalized) return []

  const tokens = []
  for (const word of normalized.split(/\s+/)) {
    if (!word) continue
    if (/^[a-z0-9]+$/.test(word)) {
      tokens.push(word)
      continue
    }
    const chars = [...word]
    if (chars.length === 1) {
      if (!SINGLE_STOPWORDS.has(word)) tokens.push(word)
      continue
    }
    // 中文两字组合，既有区分度又不需要词典
    for (let index = 0; index < chars.length - 1; index += 1) {
      tokens.push(chars[index] + chars[index + 1])
    }
    // 单字也留着：问「奖」只有一个字，不带单字就永远命不中
    for (const char of chars) {
      if (!SINGLE_STOPWORDS.has(char)) tokens.push(char)
    }
  }
  return tokens
}

/** 把 token 扩展成同义词：命中组里任意一个词，就把整组词都带上 */
function expandTokens(tokens) {
  const expanded = new Set(tokens)
  for (const token of tokens) {
    const group = SYNONYM_INDEX.get(token)
    if (!group) continue
    for (const word of group) expanded.add(word)
  }
  return [...expanded]
}

/** 单个字段里某个词出现几次 */
function countOccurrences(haystack, needle) {
  if (!haystack || !needle) return 0
  let count = 0
  let from = 0
  while (true) {
    const index = haystack.indexOf(needle, from)
    if (index === -1) return count
    count += 1
    from = index + needle.length
  }
}

const FIELD_WEIGHTS = [
  { key: 'title', weight: 4 },
  { key: 'tags', weight: 3 },
  { key: 'category', weight: 3 },
  { key: 'summary', weight: 2 },
  { key: 'body', weight: 1 },
]

/** 把一条内容压成可比较的文本字段 */
function toFields(record) {
  return {
    title: `${record.title ?? ''} ${record.kindLabel ?? ''}`.toLowerCase(),
    tags: (record.tags ?? []).join(' ').toLowerCase(),
    category: (record.category ?? '').toLowerCase(),
    summary: (record.summary ?? '').toLowerCase(),
    body: (record.body ?? '').toLowerCase(),
  }
}

/**
 * 检索已上架内容。
 * includeLatest=false 时只返回关键词命中的内容（寒暄、常识类问题不需要把项目塞进上下文）。
 */
export function retrieveContents(query, { limit = 6, latestCount = 3, includeLatest = true } = {}) {
  const { contents } = getDb()
  const published = contents.filter((item) => item.published)

  const tokens = expandTokens([...new Set(tokenize(query))])
  const scored = []

  if (tokens.length > 0) {
    for (const record of published) {
      const fields = toFields(record)
      let score = 0
      for (const token of tokens) {
        for (const field of FIELD_WEIGHTS) {
          score += countOccurrences(fields[field.key], token) * field.weight
        }
      }
      if (score > 0) {
        // 长文天然更容易命中，做个轻微的长度惩罚
        const lengthPenalty = 1 + Math.log1p((fields.body.length + fields.summary.length) / 400)
        scored.push({ record, score: score / lengthPenalty })
      }
    }
  }

  scored.sort((left, right) => right.score - left.score)
  const matched = scored.slice(0, limit).map((item) => item.record)

  // 需要“最近在做什么”这类问题时，才追加最新内容
  const latest = includeLatest
    ? [...published]
        .sort((left, right) => {
          const leftTime = Date.parse(left.publishedAt || left.createdAt || 0)
          const rightTime = Date.parse(right.publishedAt || right.createdAt || 0)
          return rightTime - leftTime
        })
        .slice(0, latestCount)
    : []

  const merged = []
  const seen = new Set()
  for (const record of [...matched, ...latest]) {
    if (seen.has(record.id)) continue
    seen.add(record.id)
    merged.push(record)
  }

  return {
    /** 关键词命中的内容，用来判断“有没有相关材料” */
    matched,
    /** 合并后的上下文（含最新内容），数字编号即提示词里的 cN */
    items: merged.slice(0, limit + latestCount),
    hasMatch: matched.length > 0,
  }
}

/**
 * 检索蒸馏知识（资料原文块 + 问答）。
 * 与内容检索分开：知识块没有卡片，只作为事实与语气依据。
 */
export function retrieveKnowledge(query, { limit = 4 } = {}) {
  const { knowledgeEntries } = getDb()
  const tokens = expandTokens([...new Set(tokenize(query))])
  if (tokens.length === 0) return []

  const scored = []
  for (const entry of knowledgeEntries) {
    const text = String(entry.text ?? '').toLowerCase()
    const title = String(entry.title ?? '').toLowerCase()
    let score = 0
    for (const token of tokens) {
      score += countOccurrences(text, token) * (entry.weight ?? 2)
      score += countOccurrences(title, token) * 2
    }
    if (score > 0) {
      const lengthPenalty = 1 + Math.log1p(text.length / 500)
      scored.push({ entry, score: score / lengthPenalty })
    }
  }

  scored.sort((left, right) => right.score - left.score)

  // 同一份资料只取最相关的两段，避免一段资料占满上下文
  const perSource = new Map()
  const picked = []
  for (const { entry } of scored) {
    const key = entry.sourceId ?? entry.id
    const count = perSource.get(key) ?? 0
    if (count >= 2) continue
    perSource.set(key, count + 1)
    picked.push(entry)
    if (picked.length >= limit) break
  }

  return picked
}

/**
 * 检索事实词条（获奖、经历、教育等）。
 * 词条短、信息密度高，比原文段落好命中，所以对话里优先用它。
 * 标题权重最高：问「你得什么奖」应该先命中标题写着「一等奖」的那条。
 */
export function retrieveFacts(query, { limit = 8 } = {}) {
  const { factEntries } = getDb()
  const tokens = expandTokens([...new Set(tokenize(query))])
  if (tokens.length === 0 || factEntries.length === 0) return []

  const scored = []
  for (const entry of factEntries) {
    const title = String(entry.title ?? '').toLowerCase()
    const content = String(entry.content ?? '').toLowerCase()
    const label = categoryLabelOf(entry.categoryId)
    const time = String(entry.time ?? '').toLowerCase()

    let score = 0
    for (const token of tokens) {
      score += countOccurrences(title, token) * 6
      score += countOccurrences(content, token) * 2
      score += countOccurrences(label, token) * 4
      score += countOccurrences(time, token) * 1
    }

    if (score > 0) scored.push({ entry, score })
  }

  scored.sort((left, right) => right.score - left.score)

  // 同一份资料最多取 4 条，避免一份简历霸占全部上下文
  const perSource = new Map()
  const picked = []
  for (const { entry } of scored) {
    const key = entry.sourceId || entry.id
    const count = perSource.get(key) ?? 0
    if (count >= 4) continue
    perSource.set(key, count + 1)
    picked.push(entry)
    if (picked.length >= limit) break
  }

  return picked
}

/**
 * 最长公共子串：只有连续原样重合才算「在说同一样东西」。
 * 用词元重合会误判——「关于夏天的记忆」和「一首关于夏天的歌」能凑出好几个相同的词，
 * 但它们说的不是一回事。返回重合长度以及在 title 里的起始位置，用来判断重合贴在标题头还是尾。
 */
function longestCommonSubstring(a, b) {
  if (!a || !b) return { length: 0, startInB: 0 }
  let best = { length: 0, startInB: 0 }
  let previous = new Array(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array(b.length + 1).fill(0)
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] !== b[j - 1]) continue
      current[j] = previous[j - 1] + 1
      if (current[j] > best.length) {
        best = { length: current[j], startInB: j - current[j] }
      }
    }
    previous = current
  }
  return best
}

/**
 * 从一段回答里判断它到底在说哪几条内容。
 *
 * 只做「标题整串匹配」是不够的：模型更常说「那个批量文件重命名的小工具」，
 * 而不是原样抄标题「批量文件重命名工具」，于是卡片永远弹不出来。
 *
 * 判定条件（三个都要满足，宁可漏挂也不要挂错）：
 * 1. 和标题连续重合的部分至少 4 个字；
 * 2. 占标题 60% 以上；
 * 3. 重合部分贴在标题开头或结尾——半截相同的通用说法（「关于夏天的…」）不算。
 */
export function pickMentionedContents(text, records, { max = 2 } = {}) {
  const answer = String(text ?? '')
  if (!answer.trim()) return []

  const scored = []
  for (const record of records ?? []) {
    const title = String(record?.title ?? '').trim()
    if (!title) continue

    // 整串出现是最可靠的信号
    if (answer.includes(title)) {
      scored.push({ record, exact: 1, ratio: 1 })
      continue
    }

    // 标题太短时无从判断「说的是不是它」，只认整串出现
    const titleLength = [...title].length
    if (titleLength < 4) continue

    const { length: overlap, startInB } = longestCommonSubstring(answer, title)
    const ratio = overlap / titleLength
    const anchored = startInB === 0 || startInB + overlap === title.length
    if (overlap >= 4 && ratio >= 0.6 && anchored) {
      scored.push({ record, exact: 0, ratio })
    }
  }

  scored.sort((left, right) => right.exact - left.exact || right.ratio - left.ratio)

  // 有整串命中的时候，模糊命中基本都是"被包含"的错觉（「关于夏天的记忆」里的「关于夏天的」），丢掉
  const exactMatches = scored.filter((item) => item.exact === 1)
  const picked = exactMatches.length > 0 ? exactMatches : scored
  return picked.slice(0, max).map((item) => item.record)
}
