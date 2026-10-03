import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import { RootPage } from './RootPage.tsx'
import { bootCustomerAnalytics } from './analytics/track'
import { registerCanvasCustomProperties } from './utils/canvasSerialize'

registerCanvasCustomProperties()
bootCustomerAnalytics(window.location.pathname)
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootPage />
  </StrictMode>,
)
