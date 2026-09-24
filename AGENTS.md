# West Vinyl Studio

A browser-based custom vinyl sticker and iron-on apparel design studio (React 19 + TypeScript + Vite). A small Node.js backend (`server.mjs`) persists orders to a flat JSON file for local development.

## Cursor Cloud specific instructions

### Services

Running the product end-to-end locally requires **two** processes:

1. **Order backend** — `node server.mjs` (listens on port `3001`, persists to `data/orders.json`). There is no npm script for this; it must be started directly. Endpoints: `GET /api/health`, `POST /api/stripe/create-checkout-session`, `GET /api/stripe/session-status`, `POST /api/stripe/webhook`, `POST /api/stripe/create-payment-intent` (legacy), `POST /api/admin/login`, `GET /api/orders`, `GET /api/orders/:id`, `POST /api/orders`. Without `STRIPE_SECRET_KEY`, local server auto-enables `ALLOW_UNVERIFIED_ORDERS` (and public list). Production should set Stripe secrets + `ORDERS_ADMIN_TOKEN` and leave those allow flags unset. The jobs board signs in with `JOBS_ADMIN_USERNAME` / `JOBS_ADMIN_PASSWORD` (server only); the browser stores the returned session, not the password.
2. **Vite dev server (frontend)** — `npm run dev -- --host 0.0.0.0 --port 5173`. The Vite config proxies `/api` → `http://localhost:3001`, so start the backend first for order/health calls to work. Default `npm run dev` can bind IPv6 localhost (`::1`) only, which makes `http://127.0.0.1:5173` fail. Extra SPA routes: `/admin/orders` (fulfillment board; alias `/jobs`), `/order/success`, `/order/cancel`.

Cloud Agents auto-start both via `.cursor/environment.json` terminals (`order-backend`, `vite-dev`).

Standard scripts are in `package.json`: `dev`, `build` (`tsc -b && vite build`), `lint` (`eslint .`), `preview`, `validate-export`.

### Non-obvious notes

- Copy `.env.example` → `.env` before running. Hosted Stripe Checkout needs server `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`. `VITE_STRIPE_PUBLISHABLE_KEY` is optional (Payment Element is no longer the checkout path). The design editor and local unverified order flow work without Stripe keys. `.env` is git-ignored.
- The local `server.mjs` does **not** implement `/api/generate-sticker` (AI generation). That endpoint only exists as a Vercel serverless function under `api/`; run it with `vercel dev` (not wired to an npm script) plus outbound internet to the Pollinations API if you need AI generation. Core design + ordering does not need it.
- The PWA service worker is disabled in dev (`devOptions.enabled: false` in `vite.config.ts`); it is only injected during `npm run build`.
- There is no user authentication/login in the product.
