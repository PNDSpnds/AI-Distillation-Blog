/** 内容类型：与前端 web/src/types/chat.ts 保持一致 */
export const CONTENT_KINDS = ['article', 'program', 'video', 'music', 'image', 'other']

export const KIND_LABELS = {
  article: '文章',
  program: '程序',
  video: '视频',
  music: '音乐',
  image: '图片',
  other: '其他',
}

/** 每种类型必须填写的字段，用于服务端校验；前端用同一份规则标必填 */
export const KIND_REQUIRED_FIELDS = {
  article: ['title', 'summary'],
  program: ['title', 'summary'],
  video: ['title', 'summary'],
  music: ['title', 'summary'],
  image: ['title', 'summary'],
  other: ['title', 'summary'],
}

/** 上传白名单：避免把可执行脚本或 SVG（可携带脚本）当封面直出 */
export const COVER_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']

/** 封面单独限大小：它只在页面上展示，5MB 足够，不该跟附件共用 100MB */
export const COVER_MAX_MB = 5

/**
 * 图片文件头签名。
 * 只靠扩展名拦不住「改名成 .png 的可执行文件」，所以落盘后还要验真实类型。
 */
export const IMAGE_SIGNATURES = [
  { name: 'PNG', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { name: 'JPEG', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { name: 'GIF', offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  { name: 'WEBP', offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  { name: 'AVIF', offset: 4, bytes: [0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66] },
]

/** 判断一段文件头是否匹配任一图片格式 */
export function isImageBuffer(buffer) {
  return IMAGE_SIGNATURES.some((signature) =>
    signature.bytes.every((byte, index) => buffer[signature.offset + index] === byte),
  )
}

export const FILE_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.md', '.csv', '.json',
  '.zip', '.rar', '.7z', '.tar', '.gz',
  '.exe', '.msi', '.apk', '.dmg',
  '.mp3', '.wav', '.flac', '.m4a',
  '.mp4', '.mov', '.webm', '.mkv',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.psd', '.ai', '.sketch', '.fig',
]

export const MATERIAL_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.md', '.png', '.jpg', '.jpeg', '.webp']
