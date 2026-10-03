/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_GA4_MEASUREMENT_ID?: string
    readonly VITE_GOOGLE_ADS_ID?: string
    readonly VITE_GOOGLE_ADS_CONVERSION_LABEL?: string
    readonly VITE_META_PIXEL_ID?: string
  }
}

declare module 'virtual:pwa-register' {
  export function registerSW(options?: { immediate?: boolean; onNeedRefresh?: () => void; onOfflineReady?: () => void }): void
}
