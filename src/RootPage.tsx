import { lazy, Suspense, useEffect } from 'react'
import { useRouteMeta } from './utils/useRouteMeta'
import type { InfoPageId } from './components/StudioInfoPage.tsx'
import { trackPageView } from './analytics/track'
import { isTrackerBlockedPath } from './analytics/config'
const App = lazy(() => import('./App.tsx'))
const JobsBoard = lazy(() => import('./components/JobsBoard.tsx').then(module => ({ default: module.JobsBoard })))
const OrderCancelPage = lazy(() => import('./components/OrderCancelPage.tsx').then(module => ({ default: module.OrderCancelPage })))
const OrderSuccessPage = lazy(() => import('./components/OrderSuccessPage.tsx').then(module => ({ default: module.OrderSuccessPage })))
const StudioInfoPage = lazy(() => import('./components/StudioInfoPage.tsx'))

function currentPath() {
  return window.location.pathname.replace(/\/$/, '') || '/'
}

/** Studio keeps html/body overflow locked; other routes need page scroll. */
function isDocumentScrollPath(path: string) {
  return path !== '/'
}

function RoutePage() {
  const path = currentPath()
  useRouteMeta(path)
  const documentScroll = isDocumentScrollPath(path)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('wvs-document-scroll', documentScroll)
    return () => {
      root.classList.remove('wvs-document-scroll')
    }
  }, [documentScroll])

  useEffect(() => {
    if (isTrackerBlockedPath(path)) return
    trackPageView()
  }, [path])

  useEffect(() => {
    const admin = path === '/admin/orders' || path === '/jobs'
    if (!admin) return
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => {
      meta.remove()
    }
  }, [path])

  if (path === '/admin/orders' || path === '/jobs') return <JobsBoard />
  if (path === '/order/success') return <OrderSuccessPage />
  if (path === '/order/cancel') return <OrderCancelPage />
  if (path === '/policies' || path === '/privacy' || path === '/terms' || path === '/contact') {
    return <StudioInfoPage page={path.slice(1) as InfoPageId} />
  }
  return <App />
}

export function RootPage() {
  return (
    <Suspense fallback={<div role="status" className="min-h-[100dvh] bg-[#0f111a] p-8 text-slate-200">Loading West Vinyl Studio…</div>}>
      <RoutePage />
    </Suspense>
  )
}
