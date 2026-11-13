import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ProfileProvider } from '@/lib/ProfileProvider'
import { ThemeProvider } from '@/lib/theme'
import { PublicChatPage } from '@/pages/PublicChatPage'

/**
 * 路由级懒加载：访客只打开首页时，不需要把整个后台（编辑页、蒸馏面板）一起下载。
 * 首页保持同步引入，避免对话界面出现"先空一下再出来"的闪烁。
 */
const AdminLayout = lazy(() =>
  import('@/components/admin/AdminLayout').then((module) => ({ default: module.AdminLayout })),
)
const AdminLoginPage = lazy(() =>
  import('@/pages/admin/AdminLoginPage').then((module) => ({ default: module.AdminLoginPage })),
)
const AdminOverviewPage = lazy(() =>
  import('@/pages/admin/AdminOverviewPage').then((module) => ({ default: module.AdminOverviewPage })),
)
const AdminContentsPage = lazy(() =>
  import('@/pages/admin/AdminContentsPage').then((module) => ({ default: module.AdminContentsPage })),
)
const AdminContentEditorPage = lazy(() =>
  import('@/pages/admin/AdminContentEditorPage').then((module) => ({
    default: module.AdminContentEditorPage,
  })),
)
const AdminDistillPage = lazy(() =>
  import('@/pages/admin/AdminDistillPage').then((module) => ({ default: module.AdminDistillPage })),
)
const AdminSettingsPage = lazy(() =>
  import('@/pages/admin/AdminSettingsPage').then((module) => ({
    default: module.AdminSettingsPage,
  })),
)
const PublicContentPage = lazy(() =>
  import('@/pages/PublicContentPage').then((module) => ({ default: module.PublicContentPage })),
)
const PublicContentsPage = lazy(() =>
  import('@/pages/PublicContentsPage').then((module) => ({ default: module.PublicContentsPage })),
)
const NotFoundPage = lazy(() =>
  import('@/pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })),
)

/** 懒加载分包的空白只有一瞬间，用一行灰字占位，避免整页闪白 */
function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-[13px] text-dim">
      正在加载…
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <ProfileProvider>
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<PublicChatPage />} />
              <Route path="/contents" element={<PublicContentsPage />} />
              <Route path="/p/:id" element={<PublicContentPage />} />

              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminOverviewPage />} />
                <Route path="contents" element={<AdminContentsPage />} />
                <Route path="contents/new" element={<AdminContentEditorPage />} />
                <Route path="contents/:id/edit" element={<AdminContentEditorPage />} />
                <Route path="distill" element={<AdminDistillPage />} />
                <Route path="settings" element={<AdminSettingsPage />} />
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ProfileProvider>
    </ThemeProvider>
  )
}
