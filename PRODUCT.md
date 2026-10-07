# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A customer opens West Vinyl Studio in a browser to design a one-off vinyl sticker or iron-on and have it made and posted. They may arrive with a photo, a few words, or an empty mat. They work on desktop or a phone, including as an installed PWA. There is no customer account.

The shop operator fulfills paid jobs on `/admin/orders` (alias `/jobs`). That board is not linked from the customer studio. The privacy page names Nathan as the contact for order records.

## Product Purpose

West Vinyl Studio is a design tool and a made-to-order shop in the same page. The customer builds cut-ready artwork on a cutting mat, can preview it as a sized sticker or on a garment and a few hard goods, then pays. After Stripe marks the checkout paid, the job is cut or pressed in Wentworth, NSW, and shipped to the address they entered.

Success for the customer is a paid order whose artwork, size, finish, colour, and address are specific enough to make. Success for the shop is that same job on the board, with the design SVG and a product preview.

## Positioning

The artwork is designed where it is ordered. The studio traces a photo to vectors, checks whether the file is cut-ready, and sends that file with the order. A print form that only accepts an upload cannot claim the in-browser cutting mat, weeding box, or cut-ready check.

## Operating Context

The customer studio is `/`. Tools cover select, magic wand, brush, track line, paint bucket, eraser, text, basic shapes, image import, trace, offset, weld, node edit, and a weeding box. Vinyl orders set a cut size in centimetres and an optional permanent finish. Apparel and hard-good orders pick a catalog product, colour, view, garment size where it applies, and placement on a flat mockup.

Checkout is a two-step modal: product review, then shipping. It creates a Stripe Checkout Session and redirects. Without Stripe keys, local development saves an unverified job instead. Paid and cancelled checkouts return to `/order/success` and `/order/cancel`.

Public pages for the offer, privacy, terms, and contact are `/policies`, `/privacy`, `/terms`, and `/contact`. Orders are made in Wentworth, NSW, Australia. Checkout collects an address in Australia, the United States, the United Kingdom, Canada, New Zealand, or another country, and adds flat shipping. Currency is AUD. Delivery time is not promised.

## Capabilities and Constraints

- Vinyl sticker base price A$12.99. Permanent adhesive adds A$6.00. Shipping is a flat A$5.99. A standard vinyl sticker totals A$18.98.
- Iron-on apparel base price A$24.99, plus the same shipping line (A$30.98 before quantity).
- Quantity is 1–100. The server prices the order. The browser cannot set the charged amount.
- Catalog: T-shirt, jumper/hoodie, sloppy joe, baby clothes, wall clock, drink bottle. Sized garments use XS–2XL.
- Vinyl cut size in the checkout UI is 2–30 cm on each side.
- Checkout is Stripe Checkout Sessions (`mode: payment`), completed by webhook and the success-page session check. Card numbers stay on Stripe.
- AI image generation calls `/api/generate` (the older `/api/generate-sticker` path uses the same handler). The browser does not call the image host. Local `server.mjs` implements the route. Each IP gets 5 free generations per UTC day.
- Customer-facing design work must leave Stripe checkout, webhooks, `/api/orders`, and admin-token behaviour unchanged.
- Canonical origin recorded in the repo is `https://westvinylstudio.com`. This frontend also deploys as Vercel project `frontendwvs`.

## Brand Commitments

The name is West Vinyl Studio. The short name is West Vinyl. Product copy states prices in AUD, names Wentworth as the place of making, and treats every sticker and garment as custom work made from the submitted artwork. The privacy contact is westvinylco@gmail.com. Identity in the interface is the wordmark plus the PWA icons. No separate logo lockup or tagline was found.

## Evidence on Hand

- Offer, shipping, and returns copy: `src/components/StudioInfoPage.tsx`
- Prices: `src/utils/orderPricing.ts` and the policies page
- Studio shell: `src/App.tsx`, `src/components/LeftDock.tsx`, `src/components/RightInspector.tsx`, `src/components/CutReadyPanel.tsx`
- Checkout UI: `src/components/OrderModal.tsx`
- Catalog: `src/three/productCatalog.ts`
- PWA name, colours, and icons: `public/manifest.json`, `public/icons/`, `index.html`
- No testimonials, press quotes, reviews, or case studies are in the repo. Do not invent them.

## Product Principles

1. The customer designs the thing they are buying before they pay.
2. Prices, shipping, and place of making stay explicit and match the server.
3. Cut-readiness is part of ordering, not a hidden export detail.
4. The shop's fulfillment tools stay separate from the customer studio.
5. Custom goods are described as custom: they are made from the submitted artwork.

## Accessibility & Inclusion

The studio is built for mouse, touch, and keyboard (undo, redo, copy, paste, delete, node edit). Below 1024px the docks become overlays, and the shell respects safe areas. Policy and checkout copy is English only. No separate conformance target was stated in the repo.

## Assumptions to confirm

- The primary customer is a person ordering a one-off sticker or iron-on for themselves. The repo never names a trade shop, a designer handoff, or a wholesale role.
- "Sloppy joe" is the shop's name for that garment and should stay on the label.
- westvinylstudio.com is the public brand home. The Vercel hostname is a deploy target, not a second name.
- The PWA `theme_color` `#863bff` is unused by the studio chrome. The implemented accent is hot pink `#FF1493`. Confirm whether the violet value is leftover.
- AI generation is a real customer action on Vercel and should remain in the header even though local `server.mjs` cannot run it.
- Nathan is the operator and the privacy contact. No other staff role was found.
- Baby clothes, wall clocks, and drink bottles are live catalog items, not placeholders.
- Flat A$5.99 shipping and the country list are the current offer. No free-shipping threshold or local pickup was found.
