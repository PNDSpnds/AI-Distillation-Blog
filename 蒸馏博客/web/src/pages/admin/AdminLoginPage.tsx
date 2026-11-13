import { ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BrandMark } from '@/components/ui/BrandMark'
import { InlineNotice } from '@/components/ui/InlineNotice'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { ApiError, changePassword, fetchSession, login } from '@/lib/api'

/** 两种模式：正常登录 / 就地改密码 */
type Mode = 'login' | 'password'

/**
 * 后台登录页：单密码，登录成功回到来源页。
 * 也可以在这里直接改密码（当前密码 + 新密码两遍），改完自动保持登录。
 */
export function AdminLoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [password, setPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [minLength, setMinLength] = useState(0)
  // 已登录却还停在登录页时给个入口，避免用户以为自己被踢了
  const [alreadySignedIn, setAlreadySignedIn] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // 最短长度由后端决定（.env 可配），前端只用来提前提示，不自己写死数字
  useEffect(() => {
    let cancelled = false
    fetchSession()
      .then((state) => {
        if (cancelled) return
        setMinLength(state.minPasswordLength ?? 0)
        setAlreadySignedIn(state.authenticated === true)
      })
      .catch(() => {
        if (!cancelled) setMinLength(0)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const goAdmin = () => {
    const next = searchParams.get('next')
    // 只接受站内后台地址，防止被构造成跳转到外部站点；
    // 登录页自己也不能当目标，否则登录成功后又被送回登录页
    const usable = next !== null && next.startsWith('/admin') && !next.startsWith('/admin/login')
    navigate(usable ? next : '/admin/contents', { replace: true })
  }

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    if (!password.trim() || busy) return

    setBusy(true)
    setError('')

    try {
      await login(password)
      goAdmin()
    } catch (requestError) {
      if (requestError instanceof ApiError) setError(requestError.message)
      else setError('连不上服务，确认后端已启动后重试')
    } finally {
      setBusy(false)
    }
  }

  const handleChangePassword = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return

    setError('')
    setNotice('')

    // 本地先挡掉最明显的错误，省一次请求
    if (!currentPassword) {
      setError('请输入当前密码')
      return
    }
    if (minLength > 0 && newPassword.length < minLength) {
      setError(`新密码至少要 ${minLength} 位（当前 ${newPassword.length} 位）`)
      return
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一样')
      return
    }

    setBusy(true)
    try {
      await changePassword(currentPassword, newPassword)
      setNotice('密码已更新，其他设备上的登录已全部退出。')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      // 后端已经下发新 Cookie，直接进后台
      window.setTimeout(goAdmin, 700)
    } catch (requestError) {
      if (requestError instanceof ApiError) setError(requestError.message)
      else setError('连不上服务，确认后端已启动后重试')
    } finally {
      setBusy(false)
    }
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setError('')
    setNotice('')
    setPassword('')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  const isPasswordMode = mode === 'password'

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink">
      <header className="flex h-16 items-center justify-between px-5 md:px-8">
        <Link to="/" className="flex items-center gap-2.5 text-sm text-dim transition-colors hover:text-ink">
          <BrandMark size="sm" />
          返回主页
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="w-full max-w-[360px] animate-fade-up">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-dim">
            <LockKeyhole size={13} strokeWidth={2} />
            Admin
          </div>
          <h1 className="mt-3 font-serif text-[26px] font-medium">
            {isPasswordMode ? '修改后台密码' : '登录后台'}
          </h1>
          <p className="mt-2 text-[13px] leading-[1.8] text-dim">
            {isPasswordMode
              ? '输入当前密码，再填两遍新密码。改完，其他设备上的登录会全部退出。'
              : '这里只有你自己能进。'}
          </p>

          {/* 已经是登录状态还停在登录页，多半是从收藏的地址进来的，直接给个入口 */}
          {alreadySignedIn && (
            <p className="mt-4 rounded-xl border border-line bg-surface-2/50 px-3 py-2 text-[12px] leading-[1.7] text-dim">
              当前已经是登录状态，可以
              <Link to="/admin/contents" className="mx-1 text-accent underline-offset-2 hover:underline">
                直接进入后台
              </Link>
              。
            </p>
          )}

          {isPasswordMode ? (
            <form onSubmit={handleChangePassword} className="mt-6 space-y-3">
              <PasswordField
                value={currentPassword}
                onChange={setCurrentPassword}
                placeholder="当前密码"
                label="当前密码"
                autoComplete="current-password"
                visible={visible}
                onToggleVisible={() => setVisible((current) => !current)}
                autoFocus
              />
              <PasswordField
                value={newPassword}
                onChange={setNewPassword}
                placeholder={minLength > 0 ? `新密码（至少 ${minLength} 位）` : '新密码'}
                label="新密码"
                autoComplete="new-password"
                visible={visible}
                onToggleVisible={() => setVisible((current) => !current)}
              />
              <PasswordField
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="再输一遍新密码"
                label="确认新密码"
                autoComplete="new-password"
                visible={visible}
                onToggleVisible={() => setVisible((current) => !current)}
                submitOnEnter
              />

              {error && <InlineNotice tone="error">{error}</InlineNotice>}
              {notice && <InlineNotice tone="success">{notice}</InlineNotice>}

              <button
                type="submit"
                disabled={busy || !currentPassword || !newPassword || !confirmPassword}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-[13.5px] font-medium text-accent-contrast transition-all hover:brightness-105 disabled:opacity-50"
              >
                {busy ? '正在修改…' : '保存新密码'}
                {!busy && <KeyRound size={15} />}
              </button>

              <button
                type="button"
                onClick={() => switchMode('login')}
                className="w-full text-center text-[12px] text-dim transition-colors hover:text-ink"
              >
                返回登录
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="mt-6 space-y-3">
              <PasswordField
                value={password}
                onChange={setPassword}
                placeholder="后台密码"
                label="后台密码"
                autoComplete="current-password"
                visible={visible}
                onToggleVisible={() => setVisible((current) => !current)}
                autoFocus
              />

              {error && <InlineNotice tone="error">{error}</InlineNotice>}

              <button
                type="submit"
                disabled={!password.trim() || busy}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-[13.5px] font-medium text-accent-contrast transition-all hover:brightness-105 disabled:opacity-50"
              >
                {busy ? '正在登录…' : '进入后台'}
                {!busy && <ArrowRight size={15} />}
              </button>

              <button
                type="button"
                onClick={() => switchMode('password')}
                className="w-full text-center text-[12px] text-dim transition-colors hover:text-ink"
              >
                修改密码
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}

/** 带显示/隐藏开关的密码输入框；登录与改密码共用一套样式 */
function PasswordField({
  value,
  onChange,
  placeholder,
  label,
  autoComplete,
  visible,
  autoFocus = false,
  submitOnEnter = false,
  onToggleVisible,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  autoComplete: string
  visible: boolean
  autoFocus?: boolean
  /** 最后一个输入框按回车直接提交表单 */
  submitOnEnter?: boolean
  onToggleVisible: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 transition-colors focus-within:border-accent/50">
      <LockKeyhole size={16} strokeWidth={1.8} className="shrink-0 text-dim" />
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        onKeyDown={(event) => {
          if (submitOnEnter && event.key === 'Enter') {
            event.currentTarget.form?.requestSubmit()
          }
        }}
        className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-dim/80"
      />
      <button
        type="button"
        onClick={onToggleVisible}
        aria-label={visible ? '隐藏密码' : '显示密码'}
        className="shrink-0 text-dim transition-colors hover:text-ink"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}
