import { useEffect } from 'react'
import App from './App.tsx'
import { JobsBoard } from './components/JobsBoard.tsx'
import { OrderCancelPage } from './components/OrderCancelPage.tsx'
import { OrderSuccessPage } from './components/OrderSuccessPage.tsx'
import { StudioInfoPage, type InfoPageId } from './components/StudioInfoPage.tsx'

function currentPath() {
  return window.location.pathname.replace(/\/$/, '') || '/'
}

/** Studio keeps html/body overflow locked; other routes need page scroll. */
function isDocumentScrollPath(path: string) {
  return path !== '/'
}

export function RootPage() {
  const path = currentPath()
  const documentScroll = isDocumentScrollPath(path)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('wvs-document-scroll', documentScroll)
    return () => {
      root.classList.remove('wvs-document-scroll')
    }
  }, [documentScroll])

  if (path === '/admin/orders' || path === '/jobs') return <JobsBoard />
  if (path === '/order/success') return <OrderSuccessPage />
  if (path === '/order/cancel') return <OrderCancelPage />
  if (path === '/policies' || path === '/privacy' || path === '/terms' || path === '/contact') {
    return <StudioInfoPage page={path.slice(1) as InfoPageId} />
  }
  return <App />
}
