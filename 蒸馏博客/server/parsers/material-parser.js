import fs from 'node:fs'
import path from 'node:path'
import mammoth from 'mammoth'

/** 解析结果统一形状：文本 + 提示信息 */
function ok(text, note = '') {
  return { text: normalize(text), note }
}

/** 统一换行、去掉不可见控制字符、压缩过多空行 */
function normalize(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    // 去掉除换行/制表外的控制字符
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** PDF：用 pdf-parse v2 的 PDFParse 类提取文字 */
async function parsePdf(filePath) {
  const { PDFParse } = await import('pdf-parse')
  const data = new Uint8Array(fs.readFileSync(filePath))
  const parser = new PDFParse({ data })

  try {
    // pageJoiner 用空串：默认的「-- 1 of 1 --」会混进正文，污染检索与提示词
    const result = await parser.getText({ pageJoiner: '' })
    const text = normalize(result?.text ?? '')
    if (!text) {
      return ok('', '这个 PDF 里没有可提取的文字（可能是扫描件，需要 OCR）')
    }
    return ok(text)
  } finally {
    await parser.destroy().catch(() => {})
  }
}

/** Word：mammoth 提取纯文本，保留段落结构 */
async function parseDocx(filePath) {
  const result = await mammoth.extractRawText({ path: filePath })
  const text = normalize(result.value)
  const note =
    Array.isArray(result.messages) && result.messages.length > 0
      ? `解析时有 ${result.messages.length} 条提示（通常不影响正文）`
      : ''
  return ok(text, note)
}

/** 纯文本类：按 UTF-8 读 */
async function parsePlain(filePath) {
  return ok(fs.readFileSync(filePath, 'utf8'))
}

/** 图片：v1 不做 OCR，只记录已上传，正文为空 */
async function parseImage() {
  return ok('', '图片暂不做文字识别（OCR 未实现），已保存文件但不参与检索')
}

const HANDLERS = {
  '.pdf': parsePdf,
  '.docx': parseDocx,
  '.txt': parsePlain,
  '.md': parsePlain,
  '.png': parseImage,
  '.jpg': parseImage,
  '.jpeg': parseImage,
  '.webp': parseImage,
}

/**
 * 把上传的资料文件解析成文本。
 * 失败时抛出带中文原因的 Error，由上层记为 failed 状态。
 */
export async function parseMaterial(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const handler = HANDLERS[ext]

  if (!handler) {
    if (ext === '.doc') {
      throw new Error('旧版 .doc 暂不支持，请另存为 .docx 后再上传')
    }
    throw new Error(`不支持解析 ${ext || '该'} 格式`)
  }

  return handler(filePath)
}

/** 供前端提示支持哪些格式 */
export const PARSEABLE_EXTENSIONS = Object.keys(HANDLERS)
