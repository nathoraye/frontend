import App from './App.tsx'
import { JobsBoard } from './components/JobsBoard.tsx'
import { OrderCancelPage } from './components/OrderCancelPage.tsx'
import { OrderSuccessPage } from './components/OrderSuccessPage.tsx'

function currentPath() {
  return window.location.pathname.replace(/\/$/, '') || '/'
}

export function RootPage() {
  const path = currentPath()
  if (path === '/admin/orders' || path === '/jobs') return <JobsBoard />
  if (path === '/order/success') return <OrderSuccessPage />
  if (path === '/order/cancel') return <OrderCancelPage />
  return <App />
}
