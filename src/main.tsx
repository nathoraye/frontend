import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { JobsBoard } from './components/JobsBoard.tsx'
import { OrderCancelPage } from './components/OrderCancelPage.tsx'
import { OrderSuccessPage } from './components/OrderSuccessPage.tsx'
import { registerCanvasCustomProperties } from './utils/canvasSerialize'

registerCanvasCustomProperties()
registerSW({ immediate: true })

const path = window.location.pathname.replace(/\/$/, '') || '/'
const Page =
  path === '/admin/orders' || path === '/jobs'
    ? JobsBoard
    : path === '/order/success'
      ? OrderSuccessPage
      : path === '/order/cancel'
        ? OrderCancelPage
        : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)
