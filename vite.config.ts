import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    // Fabric + studio stay in one client chunk (853.69 kB minified on the
    // 2026-09-23 production build). Warn if that chunk grows past this.
    chunkSizeWarningLimit: 900,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Service worker is injected at build time only — dev server is unaffected.
      devOptions: { enabled: false },
      manifest: false, // We maintain our own public/manifest.json
      includeAssets: ['favicon.svg', 'icons/*.png', 'icons.svg', 'mockups/**/*.{svg,jpg,jpeg}', 'tshirt-front.svg', 'tshirt-back.svg'],
      workbox: {
        // Static assets: serve from cache, refresh in background
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Fonts and any external assets: cache-first with 30-day expiry
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
})
