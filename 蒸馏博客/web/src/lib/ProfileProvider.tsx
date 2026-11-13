import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { mockProfile } from '@/data/mockProfile'
import { fetchProfile } from '@/lib/api'
import { ProfileContext } from '@/lib/profile-context'
import type { ProfileInfo } from '@/types/chat'

/**
 * 读取服务端随 HTML 内联下来的站点信息。
 * 生产环境一定有；开发模式（Vite 5173）下 index.html 不经过后端，取不到，返回 null。
 */
function readBootProfile(): ProfileInfo | null {
  if (typeof document === 'undefined') return null
  const node = document.getElementById('boot-profile')
  const raw = node?.textContent?.trim()
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<ProfileInfo>
    // 占位符没被替换时是 "__SITE_PROFILE__"，JSON.parse 会失败，正好回退
    if (typeof parsed.siteName !== 'string' || !parsed.siteName) return null
    return {
      siteName: parsed.siteName,
      ownerName: typeof parsed.ownerName === 'string' ? parsed.ownerName : '',
      greeting: typeof parsed.greeting === 'string' ? parsed.greeting : '',
      intro: typeof parsed.intro === 'string' ? parsed.intro : '',
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      footer: typeof parsed.footer === 'string' ? parsed.footer : '',
    }
  } catch {
    return null
  }
}

/**
 * 站点信息加载器。
 *
 * 首帧用服务端内联的数据，所以刷新时不会先闪演示文案再替换。
 * 只有在拿不到内联数据时（开发模式、或后端是旧版本）才请求 /api/profile 兜底；
 * 后端不可用时静默回退到本地 mock，保证页面永远能打开。
 */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const [bootProfile] = useState<ProfileInfo | null>(() => readBootProfile())
  const [profile, setProfile] = useState<ProfileInfo>(() => bootProfile ?? mockProfile)

  useEffect(() => {
    // 已经有服务端给的真值，不需要再问一次，也避免了第二帧覆盖
    if (bootProfile) return

    let cancelled = false

    fetchProfile()
      .then((data) => {
        if (cancelled || !data?.siteName) return
        setProfile({
          siteName: data.siteName,
          ownerName: data.ownerName,
          greeting: data.greeting,
          intro: data.intro,
          suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
          footer: data.footer,
        })
      })
      .catch(() => {
        // 无后端时保持 mock，不打扰访客
      })

    return () => {
      cancelled = true
    }
  }, [bootProfile])

  const value = useMemo(() => profile, [profile])

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}
