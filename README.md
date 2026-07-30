# West Vinyl Studio — Frontend

A custom vinyl sticker and iron-on apparel design studio built with React + TypeScript + Vite.

## Development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and fill in your credentials before running:

```bash
cp .env.example .env
# edit .env and set VITE_PAYPAL_CLIENT_ID
```

## Build

```bash
npm run build       # TypeScript compile + Vite bundle + service worker injection
npm run preview     # Preview the production build locally
```

## Deploying as a PC Web App (PWA)

The app is fully PWA-ready. Once deployed to HTTPS:

- **Chrome / Edge on desktop**: an install icon appears in the address bar — users click it to install West Vinyl Studio as a standalone desktop app.
- **iOS Safari**: uses the `apple-mobile-web-app-capable` meta tags in `index.html` so it behaves as a native full-screen app when added to the Home Screen.
- **Android Chrome**: the manifest triggers the native "Add to Home Screen" prompt automatically.

No additional configuration is needed — `vite-plugin-pwa` injects the service worker during `npm run build`. The service worker is **disabled in dev** to avoid caching issues with hot-reload.

---

## Deploying to the Google Play Store (TWA)

West Vinyl Studio can be published to the Play Store as a **Trusted Web Activity (TWA)** — a thin Android shell that loads your hosted PWA. No native Android code is needed.

### Prerequisites

- The app must be hosted on **HTTPS** with a valid SSL certificate.
- Install the `bubblewrap` CLI: `npm install -g @bubblewrap/cli`
- Install Java 8+ (required to sign the APK).

### Steps

**1. Verify your PWA is valid**

Run Google's Lighthouse audit on your deployed URL and confirm the PWA score is green.

**2. Initialise the TWA project**

```bash
mkdir west-vinyl-twa && cd west-vinyl-twa
bubblewrap init --manifest https://your-domain.com/manifest.json
```

Follow the prompts — bubblewrap reads `manifest.json` automatically.

**3. Build the signed APK / AAB**

```bash
bubblewrap build
```

This produces `app-release-signed.apk` and `app-release-bundle.aab`. Use the `.aab` for Play Store submission.

**4. Add Digital Asset Links (required)**

The Play Store requires you to prove ownership of your domain. Create this file on your server:

```
https://your-domain.com/.well-known/assetlinks.json
```

Content (bubblewrap generates the exact fingerprint for you):

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.westvinyl.studio",
    "sha256_cert_fingerprints": ["YOUR_SIGNING_KEY_FINGERPRINT"]
  }
}]
```

**5. Upload to Play Console**

- Go to [play.google.com/console](https://play.google.com/console)
- Create a new app → upload the `.aab`
- Complete the store listing and submit for review.

---

## Architecture notes

- Vector trace worker: `src/workers/tracerWorker.ts` — imported via Vite `?worker` syntax, bundled offline using the `imagetracerjs` npm package (no CDN dependency).
- Export pipeline: `src/utils/exportPipeline.ts` — SVGO optimisation + DOMPurify sanitisation.
- Geometry validation: `src/utils/geometryValidation.ts` — validates cut paths including full Bezier C/Q/S/T/A support.
- Checkout: `src/components/OrderModal.tsx` — 3-step flow with `react-hook-form` validation and PayPal Smart Buttons. Fulfillment Hook stub at `onFulfillment()` is ready to wire to a backend.

