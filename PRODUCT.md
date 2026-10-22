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

The customer studio is `/`. Tools cover select, magic wand, brush, track line, paint bucket, eraser, text, basic shapes, image import, trace, offset, weld, node edit, and a weeding box. Vinyl orders set a cut size in centimetres and an optional permanent finish. Apparel and hard-goods orders pick a catalog product, colour, view, garment size where it applies, and placement on a flat mockup.

Checkout is a two-step modal: product review, then shipping. It creates a Stripe Checkout Session and redirects. Without Stripe keys, local development saves an unverified job instead. Paid and cancelled checkouts return to `/order/success` and `/order/cancel`.

Public pages for the offer, privacy, terms, and contact are `/policies`, `/privacy`, `/terms`, and `/contact`. Orders are made in Wentworth, NSW, Australia. Checkout collects an address in Australia, the United States, the United Kingdom, Canada, New Zealand, or another country, and adds flat shipping. Currency is AUD. Delivery time is not promised.

## Capabilities and Constraints

- All pricing is calculated server-side in AUD via `src/lib/pricing.ts` (no GST; West Vinyl Studio is not GST registered). The browser cannot set the charged amount.
- Single-colour decal vinyl starts at A$4.00 (`DECAL_VINYL_MIN`) and scales with the longest side (`longest * 0.7 + 2`) and aspect-ratio fill (`0.55 + 0.45 * (shortest / longest)`).
- Product base prices (including standard print area up to 900 cm² for tee/hoodie/clock, 225 cm² for baby clothes, and 75 cm² for drink bottle; extra print above threshold is A$0.02/cm²):
  - T-Shirt (`tee`): A$32.00
  - Jumper / Hoodie & Sloppy Joe (`hoodie`): A$52.00
  - Baby Clothes (`baby`): A$24.00
  - Wall Clock (`clock`): A$28.00
  - Drink Bottle (`bottle`): A$32.00
- Design & weeding labour tiers: Standard Text (+A$0.00), Dense Text or Graphic (+A$5.00), Intricate (+A$12.00).
- Shipping: Decals ship via Untracked Rigid Post (A$4.00) or Tracked Parcel Mailer (A$10.00). Apparel and hard goods ship via Standard AusPost Parcel (A$12.00).
- Size limits (minimum 2×2 cm on all products):
  - Decals, T-Shirts, Hoodies / Sloppy Joes: Max 30×60 cm (short side ≤ 30 cm, long side ≤ 60 cm)
  - Wall Clock: Max 30×30 cm
  - Baby Clothes: Max 25×25 cm
  - Drink Bottle: Max 15×5 cm
- Quantity is 1–100 (multiplies item subtotal; shipping is charged once per order).
- Sized garments (`tshirt`, `hoodie`, `sloppyJoe`, `babyClothes`) use XS–2XL.

## Brand Commitments

The name is West Vinyl Studio. The short name is West Vinyl. Product copy states prices in AUD, names Wentworth as the place of making, and treats every sticker and garment as custom work made from the submitted artwork. The privacy contact is westvinylco@gmail.com. Identity in the interface is the wordmark plus the PWA icons. No separate logo lockup or tag line was found.

## Evidence on Hand

- Offer, shipping, and returns copy: `src/components/StudioInfoPage.tsx`
- Prices: `src/lib/pricing.ts` and the policies page
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
- Decal shipping options are A$4.00 untracked or A$10.00 tracked; apparel and hard goods ship via A$12.00 standard parcel. No free-shipping threshold or local pickup was found.
