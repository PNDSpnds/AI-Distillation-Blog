import fs from 'node:fs'
import path from 'node:path'
import { COVER_DIR, DISTILL_DIR, FILE_DIR } from '../config.js'
import { getDb } from '../repositories/db.js'
import { removeStoredFile, toAbsolutePath, toStoredPath } from '../storage/local-storage.js'

/**
 * 上传文件体检。
 *
 * 背景：曾经出现过「内容彻底删除了、附件还留在 data/uploads/files 里」的漏清，
 * 这类文件没人引用，既占空间，又会在备份/迁移时被一起带走。
 * 所以启动时主动查一遍，后台也提供手动清理。
 */

/** 蒸馏资料的正文文本固定叫 <sourceId>.txt，命名规则与 distill-sources-service 一致 */
function distillTextPath(sourceId) {
  return path.join(DISTILL_DIR, `${sourceId}.txt`)
}

/** 数据库里所有被引用的绝对路径（回收站里的内容也算，恢复还要用它的文件） */
function collectReferencedPaths() {
  const { contents = [], distillSources = [] } = getDb()
  const referenced = new Set()

  const remember = (storedPath) => {
    if (!storedPath) return
    try {
      referenced.add(toAbsolutePath(storedPath))
    } catch {
      // 记录里的路径不合法时跳过，不让一条坏数据挡掉整个体检
    }
  }

  for (const record of contents) {
    remember(record.coverPath)
    remember(record.filePath)
  }

  for (const source of distillSources) {
    remember(source.storedPath)
    referenced.add(distillTextPath(source.id))
  }

  return referenced
}

function listFilesOf(dir) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dir, entry.name))
}

/** 列出没人引用的上传文件 */
export function listOrphanFiles() {
  const referenced = collectReferencedPaths()
  const orphans = []

  for (const dir of [COVER_DIR, FILE_DIR, DISTILL_DIR]) {
    for (const filePath of listFilesOf(dir)) {
      if (referenced.has(filePath)) continue
      const stat = fs.statSync(filePath)
      orphans.push({
        storedPath: toStoredPath(filePath),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      })
    }
  }

  return orphans
}

/** 删除检出来的孤儿文件 */
export async function cleanOrphanFiles() {
  const orphans = listOrphanFiles()
  for (const orphan of orphans) {
    await removeStoredFile(orphan.storedPath)
  }
  return orphans
}

/** 启动自检：只提示不自动删，避免把刚好手放进去的东西清掉 */
export function reportOrphanFiles() {
  const orphans = listOrphanFiles()
  if (orphans.length === 0) return 0

  console.warn(
    `[storage] 发现 ${orphans.length} 个没人引用的上传文件，可在后台「设置 → 文件体检」清理：`,
  )
  for (const orphan of orphans.slice(0, 5)) {
    console.warn(`  - ${orphan.storedPath}（${orphan.size} 字节）`)
  }
  return orphans.length
}
