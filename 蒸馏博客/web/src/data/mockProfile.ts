import type { ProfileInfo } from '@/types/chat'

/**
 * M0 演示用的人设与站点信息。
 * 后续会由后台「设置 / 蒸馏」生成，这里只负责让首页先跑起来。
 */
export const mockProfile: ProfileInfo = {
  siteName: '一页',
  ownerName: '这里的主人',
  greeting: '你好，我是这里的主人。',
  intro: '我写代码，也写点东西。关于我、我的作品和最近在做的事，都可以直接问我。',
  suggestions: [
    { text: '你最近在做什么？', hint: '看看最新动态' },
    { text: '你写过哪些东西？', hint: '翻翻作品' },
    { text: '你平时怎么创作？', hint: '聊聊方法' },
  ],
  footer: '这是「一页」的 AI 对话主页 · 由本人授权生成',
}
