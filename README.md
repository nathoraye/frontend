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
- After payment: open **`/admin/orders`** (alias `/jobs`) and sign in with the shop username and password (`JOBS_ADMIN_USERNAME` / `JOBS_ADMIN_PASSWORD` on the server). The customer-facing studio does not link here. Stripe Dashboard shows the payment only. There is no Appwrite collection. Production orders live in Vercel Blob `west-vinyl-orders.json` (`BLOB_STORE_ID` / OIDC). Local `server.mjs` uses `data/orders.json`.
- Public pages for ads and checkout: `/policies`, `/privacy`, `/terms`, `/contact`. Canonical site origin is `https://westvinylstudio.com` (`PUBLIC_APP_URL`).

---

## Stripe Checkout and fulfillment

Checkout is a **Stripe Checkout Session** (`mode: payment`) for one-time custom merchandise. The server prices the order, stores the customer + `designSvg` as a `pending` job, then redirects to Stripe. `checkout.session.completed` (and the success-page session retrieve) mark the job `paid`.

### Where to look after a payment

| Place | What you see |
| --- | --- |
| **`/admin/orders` (primary; alias `/jobs`)** | What to make: vinyl size/finish or apparel product/colour/size, customer address, **product preview** + **design SVG** (open/download). Artwork is served via authenticated `GET /api/orders?id=&asset=preview` and `asset=design` (private Blob `get()` in production, inline fallback locally). Path URLs `/api/orders/:id/design` return the studio HTML page on Vercel, which the board cannot parse as JSON. Default view is **To make**. Sign in with `JOBS_ADMIN_USERNAME` / `JOBS_ADMIN_PASSWORD`. |
| **Stripe Dashboard → Payments / Checkout Sessions** | Money movement, receipt email, `metadata.orderId`. Not the cut file. |
| **Vercel Blob `west-vinyl-orders.json`** | Durable store when `BLOB_READ_WRITE_TOKEN` is set on project `frontendwvs`. |
| **`data/orders.json`** | Local/dev store used by `server.mjs`. |
| **Email** | Stripe can send the customer a receipt if enabled in the Dashboard. There is no separate “cut this job” email yet. |
| **Appwrite** | Not used. |

### Vercel / test-mode env (project `frontendwvs`, team `westvinylstudio`)

Set on the Vercel project (Preview + Production). Do not commit secrets.

- `STRIPE_SECRET_KEY` — test-mode `sk_test_…` or a restricted key until go-live
- `STRIPE_WEBHOOK_SECRET` — endpoint `https://<deployment>/api/stripe/webhook` listening for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `checkout.session.async_payment_failed`
- `ORDERS_ADMIN_TOKEN` — server secret that signs jobs-board sessions. Do not paste it into the page
- `JOBS_ADMIN_USERNAME` / `JOBS_ADMIN_PASSWORD` — shop sign-in for `/admin/orders`
- `BLOB_READ_WRITE_TOKEN` — recommended so serverless instances share one order file
- `PUBLIC_APP_URL` — optional canonical origin for success/cancel URLs
- Leave `ALLOW_UNVERIFIED_ORDERS` and `ALLOW_PUBLIC_ORDER_LIST` unset in production
- `SMOKE_CHECKOUT_AMOUNT_CENTS` — **temporary live smoke test only**. Set to `100` on Production to charge **A$1.00** for new Checkout Sessions (single line item). Unset, Checkout uses the shared size-and-design quote (item and shipping as separate lines). **Remove/unset the variable and redeploy** to charge that quote. Client `amount` / `unitAmount` fields are ignored. `GET /api/health` reports `checkout.smokeAmountCents`.

### Ads and analytics (optional)

Tracking is off until these are set. Unset variables do not load tags and do not call Google or Meta. `/admin/orders` and `/jobs` never load tags.

The browser reads `VITE_` values at build time. The webhook reads the server values at runtime. Set both groups on Vercel project `frontendwvs` when you are ready, then redeploy so the browser bundle picks up the `VITE_` ids.

| Variable | Where it runs | Where to copy it from |
| --- | --- | --- |
| `VITE_GA4_MEASUREMENT_ID` | Browser. Sends page and ecommerce events to that GA4 stream. | GA4 Admin → Data streams → your web stream → Measurement ID (`G-…`) |
| `VITE_GOOGLE_ADS_ID` | Browser, optional. Loads the Google tag for Ads. Use `AW-…` or the full `AW-…/label`. | Google Ads → Goals → Conversions → your purchase conversion → Tag setup |
| `VITE_GOOGLE_ADS_CONVERSION_LABEL` | Browser, optional. Only if `VITE_GOOGLE_ADS_ID` is the `AW-` id without a slash. | The label after `AW-#########/` in that conversion’s event snippet |
| `VITE_META_PIXEL_ID` | Browser. Loads the Meta Pixel. | Meta Events Manager → Data sources → your pixel → Pixel ID |
| `GA4_MEASUREMENT_ID` | Server. Same `G-` id as above. | GA4 Admin → Data streams |
| `GA4_API_SECRET` | Server. Measurement Protocol secret. | GA4 Admin → Data streams → your stream → Measurement Protocol API secrets → Create |
| `META_PIXEL_ID` | Server. Same pixel id as `VITE_META_PIXEL_ID`. | Events Manager → Data sources |
| `META_CAPI_ACCESS_TOKEN` | Server. Conversions API token. | Events Manager → pixel → Settings → Conversions API → Generate access token |
| `META_TEST_EVENT_CODE` | Server, optional. Marks purchases as test events. Leave unset in production. | Events Manager → Test events |
| `GA4_DEBUG` | Server, optional. Set to `1` for DebugView. | — |

What gets recorded when the ids are set:

- Page views on customer pages (not the jobs board).
- A product view when Product Preview is open, and again for the decal or garment when checkout opens.
- Add to cart when the checkout modal opens.
- Begin checkout, with the AUD total, immediately before the redirect to Stripe.
- A purchase when Stripe reports the Checkout Session paid. The browser success page sends the same purchase with the same event id. GA4 dedupes on the order id (`transaction_id`). Meta dedupes on that event id. The first time the job is marked paid sends the server event; a replayed webhook does not send it again. A reporting failure is logged and still returns HTTP 200 so the order is saved.

Landing URLs keep `utm_*`, `gclid`, `fbclid`, and the Meta `fbc` / `fbp` cookies in first-party storage and copy them onto the Checkout Session metadata for the server purchase.

Google Ads: either import the GA4 `purchase` event, or set the Ads conversion id/label so the success page fires an Ads conversion. Doing both counts the sale twice.

### Manual test (test mode)

1. Start `node server.mjs` and `npm run dev -- --host 0.0.0.0 --port 5173`.
2. Without Stripe keys: Product Preview → Buy Sticker → shipping → **Complete order (local)** → `/order/success` → **Open Jobs board**. Confirm the design and `unverified` status.
3. With test keys: `stripe listen --forward-to localhost:3001/api/stripe/webhook`, set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, pay with `4242 4242 4242 4242`. You land on `/order/success`, then `/admin/orders` shows `paid` plus the SVG.
4. Cancel from Stripe Checkout and confirm `/order/cancel` (pending job is not paid).
5. On Vercel, open `/admin/orders`, sign in, and confirm the same job. Cross-check Stripe Dashboard using `metadata.orderId`.

### Exact access steps (Nathan)

1. **URL:** `https://westvinylstudio.com/admin/orders` (also `/jobs`). The studio header does not link here. Bookmark this URL.
2. **Sign in:** username and password are `JOBS_ADMIN_USERNAME` and `JOBS_ADMIN_PASSWORD` on Vercel project `frontendwvs` (server only). The page does not ask for `ORDERS_ADMIN_TOKEN`. Local `server.mjs` without Stripe leaves the list open.
3. **Where the rows live:** Vercel Blob `west-vinyl-orders.json` when `BLOB_READ_WRITE_TOKEN` is set; otherwise local `data/orders.json`. The board prints the active store at the top.
4. **How a paid row gets there:** checkout `POST /api/stripe/create-checkout-session` writes the job + SVG on the server first; Stripe `POST /api/stripe/webhook` (`checkout.session.completed`) marks it `paid`. Not a browser-only POST after pay.

## Department shop / Shopify

The shop's visual direction follows the owner's supplied storefront reference: a purple
brush-style typographic wordmark, the supplied ute sunset hero, and three photographic
cyan/magenta/gold department panels. Optimized source photos and provenance are under
`public/shop/`; the self-hosted Road Rage font includes its license under `public/fonts/`.
Department imagery is illustrative, not an inventory claim. No newsletter, cart or social
controls are shown without a working integration. The original logo asset was not supplied;
the wordmark is live text, not a low-resolution crop of the reference.

`/` (also available at `/shop`) shows West Vinyl (Custom), West Made (Crafts), and West Finds (Collectables).
The design editor is now at `/studio`; its Stripe checkout is unchanged. Desktop navigation
and the phone studio menu link to the shop. Department branding, collection handles,
feature lists, and badge tags live in `src/config/departments.ts`.

The same-origin `GET /api/departments?handle=<collection-handle>` endpoint queries the
first 12 products from the selected Shopify collection. It runs as a Vercel API function
and is also registered in both local servers. Credentials are never sent to the browser.
Product links use Shopify's `onlineStoreUrl`; they open the Shopify product page, not
the studio's custom-design Stripe checkout. The featured West Vinyl product below uses a separate Shopify Buy Button cart.

Configure these **server-only** environment variables in your deployment environments
(and your gitignored local `.env`):

- `SHOPIFY_STORE_DOMAIN`: the store's bare `*.myshopify.com` hostname, without protocol or path.
- `SHOPIFY_STOREFRONT_ACCESS_TOKEN`: a Storefront API access token (not an Admin API token)
  with collection/product read access. Enter credentials yourself; never commit them.
- `SHOPIFY_STOREFRONT_API_VERSION`: an active stable Shopify API version in `YYYY-MM` form.
  It is explicit rather than silently pinning an API version that can expire.

Publish collections/products to the Storefront API's sales channel. The expected handles
are `west-vinyl-custom`, `west-made-crafts`, and `west-finds-collectables`, with department
tags `dept:custom`, `dept:crafts`, and `dept:finds` respectively. Collection creation,
smart-collection rules, product tagging, and channel publication remain Shopify-side tasks;
this repository does not change Shopify data. West Finds may return no collection until
it is created and published. The shop displays an honest empty state in that case, and a
separate connection message when configuration is missing. Shopify failures offer retry
and contact actions without leaking upstream errors.

Focused endpoint/config checks: `node --experimental-strip-types --test scripts/departments.test.ts`.

### Featured West Vinyl Buy Button

The West Vinyl department also embeds product `15289649725681` from
`stdgmt-5m.myshopify.com`, using the Shopify Buy Button SDK and the supplied olive
Add to cart / Checkout styling. Shopify supplies the product title, variants, image,
price, availability and checkout. It is independent of the collection API and Stripe studio.

Set `VITE_SHOPIFY_BUY_BUTTON_STOREFRONT_TOKEN` yourself in Preview and Production,
then create a new deployment. Use only the **public Storefront token from the Buy Button
embed**, not an Admin API token or private Storefront token: Vite embeds this value in
browser code. Never commit the token. The featured product stays mounted across department
switches to preserve the cart; it is shown only in West Vinyl. Missing configuration or
a failed SDK request shows a product enquiry link rather than a nonfunctional buy button.
The collection API's server-only credentials are not reused or exposed.

Focused Buy Button browser tests: `npx playwright test e2e/westVinylProduct.spec.ts`.
For SDK lifecycle tests, run the dev server and tests with a dummy public token via
`VITE_SHOPIFY_BUY_BUTTON_STOREFRONT_TOKEN=fixture-token`; the tests mock Shopify,
so they do not create real carts or orders.
