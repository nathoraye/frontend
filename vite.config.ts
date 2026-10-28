import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    // Studio is route-lazy; warn about growth without forcing eager vendor dependencies.
    chunkSizeWarningLimit: 900,
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
    // Order writes must not reload the studio while checkout and phone tests run together.
    watch: {
      ignored: ['**/data/orders.json'],
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
        // Do not eagerly download lazy-route JavaScript during service-worker install.
        globPatterns: ['**/*.{css,html,ico,png,svg,jpg,jpeg,woff2}'],
        globIgnores: ['**/*.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/sitemap\.xml$/, /^\/robots\.txt$/],
        runtimeCaching: [
          {
            // Fingerprinted route chunks are cached only after they are requested.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /^\/assets\/.*\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'route-chunks',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
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
