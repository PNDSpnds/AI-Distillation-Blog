import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from '../config.js'

/**
 * 本地文件存储适配器。
 * 对外只暴露相对 data 目录的路径，未来换对象存储时替换这一层即可。
 */

/** 把 multer 写入的文件转成可持久化的相对路径 */
export function toStoredPath(absolutePath) {
  return path.relative(DATA_DIR, absolutePath).split(path.sep).join('/')
}

/** 相对路径 → 绝对路径，并阻止 ../ 越界读取 */
export function toAbsolutePath(storedPath) {
  const normalized = path.normalize(storedPath).replace(/^([/\\])+/, '')
  const absolute = path.resolve(DATA_DIR, normalized)
  if (!absolute.startsWith(DATA_DIR + path.sep)) {
    throw new Error('非法文件路径')
  }
  return absolute
}

/** 删除文件；文件不存在也不算错误 */
export async function removeStoredFile(storedPath) {
  if (!storedPath) return
  try {
    await fs.promises.rm(toAbsolutePath(storedPath), { force: true })
  } catch (error) {
    console.warn(`[storage] 删除文件失败 ${storedPath}：${error.message}`)
  }
}

/** 删除 multer 刚落盘的临时文件（校验失败时清理，避免产生孤儿文件） */
export async function cleanupUploadedFiles(files = []) {
  for (const file of files) {
    await removeStoredFile(toStoredPath(file.path))
  }
}

/** 封面在浏览器里的访问地址 */
export function toCoverUrl(storedPath) {
  if (!storedPath) return ''
  return `/media/covers/${path.basename(storedPath)}`
}

export function humanFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}
