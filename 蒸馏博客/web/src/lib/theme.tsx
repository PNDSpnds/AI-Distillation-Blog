import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ThemeContext, type Theme } from './theme-context'

const STORAGE_KEY = 'chat-blog-theme'

function readInitialTheme(): Theme {
  if (typeof document === 'undefined') return 'dark'
  const current = document.documentElement.dataset.theme
  if (current === 'light' || current === 'dark') return current
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // 浏览器禁用 localStorage 时忽略，使用默认深色
  }
  return 'dark'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme)

  // 把主题写到 <html data-theme>，CSS 变量会随之切换
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // 存不了只影响下次打开，不影响当前页面
    }
  }, [theme])

  // 首帧之后才开启颜色过渡，避免打开页面时闪一下
  useEffect(() => {
    const timer = window.setTimeout(() => {
      document.documentElement.classList.add('theme-anim')
    }, 80)
    return () => {
      window.clearTimeout(timer)
      document.documentElement.classList.remove('theme-anim')
    }
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  const value = useMemo(
    () => ({ theme, toggleTheme, setTheme }),
    [theme, toggleTheme, setTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
