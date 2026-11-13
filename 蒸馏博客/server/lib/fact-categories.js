/**
 * 词条分类的辅助工具。
 *
 * 设计变更（v1.1）：分类不再是代码里写死的常量，而是数据库里的一张表（`factCategories`）。
 * AI 提炼词条时自己起分类名，系统负责「归一」（近义的并到一起），用户也能改名/合并。
 * 这里只保留三件事：
 * 1. 旧版本 12 个分类 key → 中文名的映射（迁移用）
 * 2. 分类名归一化（比较用）
 * 3. 近义判断（复用已有分类，避免每份资料都新建一个「荣誉」）
 */

/** 旧版本的固定分类 key → 中文名；只在迁移旧数据时使用 */
export const LEGACY_CATEGORY_LABELS = {
  award: '荣誉',
  experience: '经历',
  education: '教育',
  work: '工作',
  skill: '技能',
  interest: '兴趣',
  opinion: '观点',
  life: '生活',
  relation: '关系',
  health: '健康',
  goal: '目标',
  other: '其他',
}

/** 分类名上限：够表达就行，太长在筛选条里排不下 */
export const CATEGORY_LABEL_MAX = 8
/** 分类总数上限，防脏数据无限增殖 */
export const MAX_CATEGORIES = 80

/** 归一化：去掉空格与标点、统一小写。只用于比较，不改变展示用的名字。 */
export function normalizeLabel(value) {
  return String(value ?? '')
    .replace(/[\s\p{P}]/gu, '')
    .toLowerCase()
}

/** 判断 AI 给的新分类名能不能直接复用已有分类 */
export function isSameCategory(left, right) {
  const a = normalizeLabel(left)
  const b = normalizeLabel(right)
  if (!a || !b) return false
  if (a === b) return true

  // 互相包含且长度接近，视为同一个：「奖励」vs「奖项」合并，「获奖记录」vs「荣誉」不合并
  if (a.includes(b) || b.includes(a)) {
    return Math.abs(a.length - b.length) <= 1
  }
  return false
}

/** 把任意输入收敛成合法的分类名；空值返回空字符串 */
export function sanitizeCategoryLabel(value) {
  return String(value ?? '')
    .replace(/[\s\p{P}]+/gu, '')
    .trim()
    .slice(0, CATEGORY_LABEL_MAX)
}
