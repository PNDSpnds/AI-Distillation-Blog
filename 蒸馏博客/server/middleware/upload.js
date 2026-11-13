import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import { COVER_DIR, FILE_DIR, DISTILL_DIR, MAX_UPLOAD_MB } from '../config.js'
import {
  COVER_EXTENSIONS,
  COVER_MAX_MB,
  FILE_EXTENSIONS,
  MATERIAL_EXTENSIONS,
  isImageBuffer,
} from '../lib/content-kinds.js'
import { createStoredName } from '../lib/ids.js'
import { tooLarge, badRequest } from '../lib/http-error.js'
import { cleanupUploadedFiles } from '../storage/local-storage.js'

/** 字段名决定存放目录和允许的扩展名 */
const FIELD_RULES = {
  cover: { dir: COVER_DIR, extensions: COVER_EXTENSIONS, label: '封面' },
  file: { dir: FILE_DIR, extensions: FILE_EXTENSIONS, label: '附件' },
  material: { dir: DISTILL_DIR, extensions: MATERIAL_EXTENSIONS, label: '蒸馏资料' },
}

function buildStorage() {
  return multer.diskStorage({
    destination(request, file, callback) {
      const rule = FIELD_RULES[file.fieldname]
      if (!rule) {
        callback(badRequest(`不支持的字段：${file.fieldname}`))
        return
      }
      callback(null, rule.dir)
    },
    filename(request, file, callback) {
      // 原始文件名不可信，只取扩展名，主体用随机串
      callback(null, createStoredName(file.originalname))
    },
  })
}

/**
 * multipart 里的文件名默认按 latin1 解码，中文会变成乱码。
 * 这里按 UTF-8 还原；如果还原结果出现替换字符，说明原文不是 UTF-8，保持原样。
 */
function decodeOriginalName(name) {
  if (!name) return name
  const decoded = Buffer.from(name, 'latin1').toString('utf8')
  return decoded.includes('\uFFFD') ? name : decoded
}

function buildFilter() {
  return (request, file, callback) => {
    const rule = FIELD_RULES[file.fieldname]
    if (!rule) {
      callback(badRequest(`不支持的字段：${file.fieldname}`))
      return
    }

    // 先纠正文件名编码，后面校验扩展名和落库都用正确的中文名
    file.originalname = decodeOriginalName(file.originalname)

    const ext = path.extname(file.originalname).toLowerCase()
    if (!rule.extensions.includes(ext)) {
      callback(badRequest(`${rule.label}不支持 ${ext || '该'} 格式`))
      return
    }
    callback(null, true)
  }
}

const uploader = multer({
  storage: buildStorage(),
  fileFilter: buildFilter(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 4 },
})

const fields = [
  { name: 'cover', maxCount: 1 },
  { name: 'file', maxCount: 1 },
  { name: 'material', maxCount: 1 },
]

/** 读出文件头，用于判断真实类型 */
function readHeader(filePath, length = 16) {
  const buffer = Buffer.alloc(length)
  const fd = fs.openSync(filePath, 'r')
  try {
    fs.readSync(fd, buffer, 0, length, 0)
  } finally {
    fs.closeSync(fd)
  }
  return buffer
}

/** 封面额外校验：大小 + 真实图片类型。返回错误文案，没问题返回空字符串 */
function checkCover(file) {
  if (file.size > COVER_MAX_MB * 1024 * 1024) {
    return `封面不能超过 ${COVER_MAX_MB}MB`
  }
  if (!isImageBuffer(readHeader(file.path))) {
    return '封面必须是真实的图片文件（PNG / JPG / WebP / GIF / AVIF）'
  }
  return ''
}

/** 包裹 multer，把它的错误翻译成统一的中文提示 */
export function uploadFields() {
  const handler = uploader.fields(fields)
  return (request, response, next) => {
    handler(request, response, (error) => {
      if (!error) {
        const cover = request.files?.cover?.[0]
        const problem = cover ? checkCover(cover) : ''

        if (!problem) {
          next()
          return
        }

        // 校验失败时把这次已落盘的文件全部清掉，避免留下孤儿文件
        const allFiles = Object.values(request.files ?? {}).flat()
        cleanupUploadedFiles(allFiles).finally(() => next(badRequest(problem)))
        return
      }

      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          next(tooLarge(`文件超过 ${MAX_UPLOAD_MB}MB 上限`))
          return
        }
        next(badRequest(`上传失败：${error.message}`))
        return
      }
      next(error)
    })
  }
}
