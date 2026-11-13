import { useCallback, useEffect, useState } from 'react'
import { fetchSession, logout as logoutRequest } from '@/lib/api'

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous'

/** 后台会话状态：进页面先问一次服务端，避免把未登录用户放进管理界面 */
export function useAdminSession() {
  const [status, setStatus] = useState<SessionStatus>('loading')
  const [passwordNeedsChange, setPasswordNeedsChange] = useState(false)
  const [passwordWarning, setPasswordWarning] = useState('')

  useEffect(() => {
    let cancelled = false

    fetchSession()
      .then((state) => {
        if (cancelled) return
        setStatus(state.authenticated ? 'authenticated' : 'anonymous')
        setPasswordNeedsChange(state.passwordNeedsChange)
        setPasswordWarning(state.passwordWarning)
      })
      .catch(() => {
        // 后端没起来时也当作未登录，让用户先看到登录页与错误提示
        if (!cancelled) setStatus('anonymous')
      })

    return () => {
      cancelled = true
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutRequest()
    } catch {
      // 退出失败也让前端回到登录页，避免卡在后台
    }
    setStatus('anonymous')
  }, [])

  return { status, passwordNeedsChange, passwordWarning, logout }
}
