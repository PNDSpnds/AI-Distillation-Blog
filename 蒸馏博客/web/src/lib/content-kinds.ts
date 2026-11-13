import type { ContentKind } from '@/types/chat'

/** 表单里可能出现的基础字段 */
export type FieldKey =
  | 'title'
  | 'summary'
  | 'cover'
  | 'category'
  | 'tags'
  | 'body'
  | 'jumpUrl'
  | 'file'

export interface KindFormConfig {
  kind: ContentKind
  label: string
  /** 类型选择器上的一句话说明 */
  hint: string
  fields: FieldKey[]
  jumpLabel: string
  jumpPlaceholder: string
  bodyLabel: string
  bodyPlaceholder: string
  fileLabel: string
  fileHint: string
  /** 附件允许的格式，直接写给人看（由类型决定，不要从 accept 反推） */
  fileFormats: string
}

/**
 * 不同内容类型显示哪些字段。
 * 上传窗口统一，字段随类型变化；新增类型只要在这里加一项。
 */
export const KIND_FORMS: KindFormConfig[] = [
  {
    kind: 'program',
    label: '程序',
    hint: '可下载的工具、脚本、应用',
    fields: ['title', 'summary', 'cover', 'category', 'tags', 'file', 'jumpUrl', 'body'],
    jumpLabel: '项目主页（可选）',
    jumpPlaceholder: 'https://github.com/…',
    bodyLabel: '使用说明（可选）',
    bodyPlaceholder: '怎么安装、怎么用、有什么限制。',
    fileLabel: '下载文件',
    fileHint: '压缩包、安装包或可执行文件，上传后自动生成下载地址。',
    fileFormats: 'ZIP / RAR / 7Z / EXE / MSI / APK',
  },
  {
    kind: 'article',
    label: '文章',
    hint: '长文、随笔、笔记',
    fields: ['title', 'summary', 'cover', 'category', 'tags', 'body', 'jumpUrl'],
    jumpLabel: '原文链接（可选）',
    jumpPlaceholder: 'https://…',
    bodyLabel: '正文',
    bodyPlaceholder: '直接写正文，或用 Markdown。',
    fileLabel: '附件（可选）',
    fileHint: '需要随文章提供的文件。',
    fileFormats: 'PDF / DOCX / TXT / MD / ZIP',
  },
  {
    kind: 'video',
    label: '视频',
    hint: '录像、剪辑、直播回放',
    fields: ['title', 'summary', 'cover', 'category', 'tags', 'jumpUrl', 'body'],
    jumpLabel: '视频地址',
    jumpPlaceholder: 'https://www.bilibili.com/video/…',
    bodyLabel: '视频说明（可选）',
    bodyPlaceholder: '拍了什么、为什么拍。',
    fileLabel: '视频文件（可选）',
    fileHint: '建议优先填外链，大文件上传会更慢。',
    fileFormats: 'MP4 / MOV / WEBM / MKV',
  },
  {
    kind: 'music',
    label: '音乐',
    hint: '歌曲、配乐、demo',
    fields: ['title', 'summary', 'cover', 'category', 'tags', 'jumpUrl', 'file', 'body'],
    jumpLabel: '收听地址（可选）',
    jumpPlaceholder: 'https://…',
    bodyLabel: '创作说明（可选）',
    bodyPlaceholder: '写这首歌时在做什么。',
    fileLabel: '音频文件（可选）',
    fileHint: 'mp3 / wav / flac 等。',
    fileFormats: 'MP3 / WAV / FLAC / M4A',
  },
  {
    kind: 'image',
    label: '图片',
    hint: '照片、插画、截图',
    fields: ['title', 'summary', 'cover', 'category', 'tags', 'file', 'body'],
    jumpLabel: '相关链接（可选）',
    jumpPlaceholder: 'https://…',
    bodyLabel: '说明（可选）',
    bodyPlaceholder: '拍摄背景、创作过程。',
    fileLabel: '原图文件（可选）',
    fileHint: '需要提供高清原图时上传。',
    fileFormats: 'PNG / JPG / WEBP / PSD',
  },
  {
    kind: 'other',
    label: '其他',
    hint: '不属于以上类型的任何内容',
    fields: ['title', 'summary', 'cover', 'category', 'tags', 'body', 'jumpUrl', 'file'],
    jumpLabel: '相关链接（可选）',
    jumpPlaceholder: 'https://…',
    bodyLabel: '说明（可选）',
    bodyPlaceholder: '想写什么都可以。',
    fileLabel: '附件（可选）',
    fileHint: '需要提供的任何文件。',
    fileFormats: '常见文件格式',
  },
]

export function getKindConfig(kind: ContentKind): KindFormConfig {
  return KIND_FORMS.find((item) => item.kind === kind) ?? KIND_FORMS[KIND_FORMS.length - 1]
}
