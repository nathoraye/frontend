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
# edit .env and set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET for paid Checkout
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
- Checkout: `src/components/OrderModal.tsx` — 2-step flow (product review → shipping) that creates a Stripe Checkout Session and redirects. Local unverified jobs are saved when `STRIPE_SECRET_KEY` is unset.
- After payment: open **`/jobs`** to see the paid vinyl/apparel job (design SVG, size/finish or garment, customer, download). Stripe Dashboard shows the payment only. There is no Appwrite collection. Production orders live in Vercel Blob `west-vinyl-orders.json` when `BLOB_READ_WRITE_TOKEN` is set; local `server.mjs` uses `data/orders.json`.

---

## Stripe Checkout and fulfillment

Checkout is a **Stripe Checkout Session** (`mode: payment`) for one-time custom merchandise. The server prices the order, stores the customer + `designSvg` as a `pending` job, then redirects to Stripe. `checkout.session.completed` (and the success-page session retrieve) mark the job `paid`.

### Where to look after a payment

| Place | What you see |
| --- | --- |
| **`/jobs` (primary)** | What to make: vinyl size/finish or apparel product/colour/size, customer address, design preview, SVG download. Gate with `ORDERS_ADMIN_TOKEN` on Vercel. |
| **Stripe Dashboard → Payments / Checkout Sessions** | Money movement, receipt email, `metadata.orderId`. Not the cut file. |
| **Vercel Blob `west-vinyl-orders.json`** | Durable store when `BLOB_READ_WRITE_TOKEN` is set on project `frontendwvs`. |
| **`data/orders.json`** | Local/dev store used by `server.mjs`. |
| **Email** | Stripe can send the customer a receipt if enabled in the Dashboard. There is no separate “cut this job” email yet. |
| **Appwrite** | Not used. |

### Vercel / test-mode env (project `frontendwvs`, team `westvinylstudio`)

Set on the Vercel project (Preview + Production). Do not commit secrets.

- `STRIPE_SECRET_KEY` — test-mode `sk_test_…` or a restricted key until go-live
- `STRIPE_WEBHOOK_SECRET` — endpoint `https://<deployment>/api/stripe/webhook` listening for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `checkout.session.async_payment_failed`
- `ORDERS_ADMIN_TOKEN` — paste this on `/jobs` to load production jobs
- `BLOB_READ_WRITE_TOKEN` — recommended so serverless instances share one order file
- `PUBLIC_APP_URL` — optional canonical origin for success/cancel URLs
- Leave `ALLOW_UNVERIFIED_ORDERS` and `ALLOW_PUBLIC_ORDER_LIST` unset in production

### Manual test (test mode)

1. Start `node server.mjs` and `npm run dev -- --host 0.0.0.0 --port 5173`.
2. Without Stripe keys: Product Preview → Buy Sticker → shipping → **Complete order (local)** → `/order/success` → **Open Jobs board**. Confirm the design and `unverified` status.
3. With test keys: `stripe listen --forward-to localhost:3001/api/stripe/webhook`, set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, pay with `4242 4242 4242 4242`. You land on `/order/success`, then `/jobs` shows `paid` plus the SVG.
4. Cancel from Stripe Checkout and confirm `/order/cancel` (pending job is not paid).
5. On Vercel, open `/jobs`, enter `ORDERS_ADMIN_TOKEN`, and confirm the same job. Cross-check Stripe Dashboard using `metadata.orderId`.

