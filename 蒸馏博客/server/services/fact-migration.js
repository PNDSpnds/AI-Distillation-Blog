import { getDb, mutateDb } from '../repositories/db.js'
import { LEGACY_CATEGORY_LABELS } from '../lib/fact-categories.js'
import { createId } from '../lib/ids.js'

/**
 * v1.1 迁移：词条分类从「代码里写死的 key」改成「数据库里的分类表」。
 *
 * 为什么要迁移：老数据里 `fact.category` 是 `award` / `experience` 这样的 key，
 * 新结构用 `categoryId` 指向 `factCategories`。不迁移的话词条会变成「未分类」。
 *
 * 迁移是幂等的：只处理还没有 categoryId 的词条，跑多次也安全。
 */
export async function migrateFactCategories() {
  const db = getDb()
  const legacy = db.factEntries.filter((item) => !item.categoryId)
  if (legacy.length === 0) return { migrated: 0 }

  const now = new Date().toISOString()
  let migrated = 0

  await mutateDb((state) => {
    // 按旧 key 出现的顺序建分类，保持一个稳定顺序
    const byLabel = new Map(state.factCategories.map((item) => [item.label, item]))

    for (const fact of state.factEntries) {
      if (fact.categoryId) continue

      const label = LEGACY_CATEGORY_LABELS[fact.category] ?? '其他'
      let category = byLabel.get(label)

      if (!category) {
        category = {
          id: createId('cat'),
          label,
          order: (state.factCategories.at(-1)?.order ?? 0) + 10,
          origin: 'seed',
          createdAt: now,
          updatedAt: now,
        }
        state.factCategories.push(category)
        byLabel.set(label, category)
      }

      fact.categoryId = category.id
      migrated += 1
    }
  })

  return { migrated }
}

/** 供外部在启动时调用 */
export async function runFactMigration() {
  const result = await migrateFactCategories()
  if (result.migrated > 0) {
    console.log(`[migrate] 已把 ${result.migrated} 条词条迁到新的分类结构`)
  }
  return result
}
