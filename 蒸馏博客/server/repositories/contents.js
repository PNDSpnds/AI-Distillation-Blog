import { getDb, mutateDb } from './db.js'

/** 发布时间与创建时间取其一，避免老数据没有 publishedAt 时排序异常 */
function timeOf(record) {
  return Date.parse(record.publishedAt || record.createdAt || 0)
}

/**
 * 排序规则：置顶永远优先（回收站里没有置顶概念），其次按传入方式排序。
 * sort: latest（默认，新→旧）| oldest（旧→新）| title（按标题）
 */
function sortContents(items, sort = 'latest') {
  return items.sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1
    if (sort === 'oldest') return timeOf(left) - timeOf(right)
    if (sort === 'title') return String(left.title).localeCompare(String(right.title), 'zh-Hans-CN')
    return timeOf(right) - timeOf(left)
  })
}

/**
 * 查询内容列表。
 * - includeUnpublished：只有后台用；公开接口一律只看已上架
 * - onlyDeleted：回收站视图（只看已软删除的）
 */
export function listContents({
  kind,
  query,
  includeUnpublished = false,
  category,
  onlyDeleted = false,
  sort = 'latest',
} = {}) {
  let items = [...getDb().contents]

  items = onlyDeleted
    ? items.filter((item) => Boolean(item.deletedAt))
    : items.filter((item) => !item.deletedAt)

  if (!includeUnpublished) {
    items = items.filter((item) => item.published)
  }
  if (kind) {
    items = items.filter((item) => item.kind === kind)
  }
  if (category) {
    items = items.filter((item) => item.category === category)
  }
  if (query) {
    const keyword = query.trim().toLowerCase()
    if (keyword) {
      items = items.filter((item) =>
        [item.title, item.summary, item.category, item.body, ...(item.tags ?? [])]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(keyword)),
      )
    }
  }

  return sortContents(items, sort)
}

export function findContent(id) {
  return getDb().contents.find((item) => item.id === id) ?? null
}

export async function insertContent(record) {
  await mutateDb((db) => {
    db.contents.push(record)
  })
  return record
}

export async function updateContent(id, patch) {
  return mutateDb((db) => {
    const index = db.contents.findIndex((item) => item.id === id)
    if (index === -1) return null
    db.contents[index] = { ...db.contents[index], ...patch, updatedAt: new Date().toISOString() }
    return db.contents[index]
  })
}

/** 软删除：只打标记，文件和记录都留着，方便恢复 */
export async function markContentDeleted(id) {
  return mutateDb((db) => {
    const index = db.contents.findIndex((item) => item.id === id)
    if (index === -1) return null
    const now = new Date().toISOString()
    db.contents[index] = {
      ...db.contents[index],
      deletedAt: now,
      published: false,
      updatedAt: now,
    }
    return db.contents[index]
  })
}

export async function restoreContent(id) {
  return mutateDb((db) => {
    const index = db.contents.findIndex((item) => item.id === id)
    if (index === -1) return null
    const next = { ...db.contents[index], updatedAt: new Date().toISOString() }
    delete next.deletedAt
    // 恢复后保持下架状态，由用户决定要不要重新上架
    db.contents[index] = next
    return next
  })
}

/** 彻底删除：从库里移出，调用方负责删文件 */
export async function removeContent(id) {
  return mutateDb((db) => {
    const index = db.contents.findIndex((item) => item.id === id)
    if (index === -1) return null
    const [removed] = db.contents.splice(index, 1)
    return removed
  })
}

/** 统计分类使用情况，给后台筛选和表单提示用（不含回收站） */
export function listCategories() {
  const counter = new Map()
  for (const item of getDb().contents) {
    if (item.deletedAt) continue
    const key = item.category?.trim()
    if (!key) continue
    counter.set(key, (counter.get(key) ?? 0) + 1)
  }
  return [...counter.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count)
}
