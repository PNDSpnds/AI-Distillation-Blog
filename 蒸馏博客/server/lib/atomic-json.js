import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

/** 读 JSON；文件不存在时返回 fallback，损坏时记录日志后返回 fallback */
export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`[json] 读取 ${file} 失败：${error.message}`)
    }
    return fallback
  }
}

// 同一个进程内的写入串行排队，避免并发请求互相覆盖
let queue = Promise.resolve()

/**
 * 原子写入：先写临时文件再改名，避免断电/崩溃时留下半个 JSON。
 * 有 backupDir 时先把旧文件复制一份，保留最近 keepBackups 份。
 */
export function writeJson(file, data, { backupDir, keepBackups = 20 } = {}) {
  const task = async () => {
    await fsp.mkdir(path.dirname(file), { recursive: true })

    if (backupDir && fs.existsSync(file)) {
      await backupFile(file, backupDir, keepBackups)
    }

    const tempFile = `${file}.tmp`
    await fsp.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf8')
    await fsp.rename(tempFile, file)
  }

  queue = queue.then(task, task)
  return queue
}

async function backupFile(file, backupDir, keepBackups) {
  await fsp.mkdir(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const target = path.join(backupDir, `db-${stamp}.json`)
  await fsp.copyFile(file, target)

  const entries = (await fsp.readdir(backupDir))
    .filter((name) => name.startsWith('db-') && name.endsWith('.json'))
    .sort()

  const overflow = entries.length - keepBackups
  for (let index = 0; index < overflow; index += 1) {
    await fsp.rm(path.join(backupDir, entries[index]), { force: true })
  }
}
