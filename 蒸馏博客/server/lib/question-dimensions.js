/**
 * 出题维度。
 * 只蒸馏「作品/代码」会让分身只会聊项目，所以出题按维度轮流出，
 * 保证经历、家庭、情绪、健康、金钱这些「人味」也会被问到。
 */
export const QUESTION_DIMENSIONS = [
  {
    key: 'growth',
    label: '成长与家庭',
    brief: '老家在哪、小时候什么样、家里几口人、父母是做什么的、成长里印象最深的一件事',
  },
  {
    key: 'education',
    label: '教育与求学',
    brief: '读的什么学校什么专业、为什么选它、上学时最投入的事、成绩好坏、有没有转专业或退学的念头',
  },
  {
    key: 'work',
    label: '工作与项目',
    brief: '做过的工作与项目、具体负责什么、最难的一段、为什么离开或坚持、现在每天在忙什么',
  },
  {
    key: 'skill',
    label: '技能与工具',
    brief: '会什么、怎么学会的、用的什么工具、哪项最拿手、哪项一直没学会',
  },
  {
    key: 'interest',
    label: '兴趣与审美',
    brief: '平时玩什么看什么听什么、喜欢的原因、审美偏好、最近沉迷的东西',
  },
  {
    key: 'value',
    label: '价值观与判断',
    brief: '怎么看努力与运气、怎么看钱与自由、什么事绝不妥协、对行业或社会的看法',
  },
  {
    key: 'emotion',
    label: '情绪与性格',
    brief: '生气时什么样、难过时怎么处理、内向还是外向、别人怎么评价你、什么时候最放松',
  },
  {
    key: 'health',
    label: '健康与生活习惯',
    brief: '作息、运动、饮食、身体状况、熬夜与咖啡、有没有想改的习惯',
  },
  {
    key: 'relation',
    label: '人际与感情',
    brief: '怎么交朋友、和谁最亲近、恋爱或婚姻观、怎么处理和人有分歧',
  },
  {
    key: 'failure',
    label: '失败与遗憾',
    brief: '做过最失败的决定、后悔的事、放弃过什么、被否定的经历',
  },
  {
    key: 'goal',
    label: '目标与计划',
    brief: '今年想完成什么、五年后想在哪、有没有特别想试但还没做的事',
  },
  {
    key: 'money',
    label: '金钱与选择',
    brief: '第一笔收入怎么花的、消费观、为钱做过什么取舍、怎么看待稳定与冒险',
  },
]

export const QUESTION_DIMENSION_KEYS = QUESTION_DIMENSIONS.map((item) => item.key)

export function dimensionLabel(key) {
  return QUESTION_DIMENSIONS.find((item) => item.key === key)?.label ?? ''
}

/**
 * 选这一批要覆盖哪些维度：优先最久没被问到的那些。
 * 每次都换维度，1000 题才可能覆盖到「整个的人」而不只是作品。
 */
export function pickDimensions({ counts = {}, batchSize = 10 } = {}) {
  const sorted = [...QUESTION_DIMENSIONS].sort((left, right) => {
    const diff = (counts[left.key] ?? 0) - (counts[right.key] ?? 0)
    if (diff !== 0) return diff
    // 数量相同就按固定顺序，避免每次顺序都变、看起来乱跳
    return QUESTION_DIMENSIONS.indexOf(left) - QUESTION_DIMENSIONS.indexOf(right)
  })

  // 一批至少跨 4 个维度、最多 6 个：题越多跨度越大，避免整批都在问同一类事
  const wanted = Math.min(6, Math.max(4, Math.ceil(batchSize / 3)), sorted.length)
  return sorted.slice(0, wanted)
}
