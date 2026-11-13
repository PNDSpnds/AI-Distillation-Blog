import { useEffect } from 'react'

/**
 * 设置浏览器标签页标题。
 * 单独成一个 hook：页面各自声明标题，避免多个 Provider 互相覆盖。
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    if (title) document.title = title
  }, [title])
}
