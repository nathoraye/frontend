---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: []
---

# Studio order path

Visitor mode: Operate

## Job and audience

A customer lands on an empty cutting mat and needs to design a sticker or iron-on, then find checkout without hunting. The shop operator's jobs board stays out of this surface.

## Outcome and proof

They can add type or a photo, open Product Preview, and see Buy Sticker and Buy Apparel with the real AUD totals (vinyl A$18.98 and apparel A$30.98, shipping included). Checkout itself stays the existing OrderModal and Stripe session.

## Direction contract

THESIS: The mat tells you the next step, and the purchase sits on its own row. This refuses a blank canvas with the buy buttons buried in a wrapping toolbar.
OWN-WORLD: Night cutting mat. Void `#0f111a`, panel `#181a25`, mat `#2a2e3c`, registration pink for vinyl, emerald for apparel.
STORY: Design the cut, preview it on a product, then pay the price already printed on the policies page.
FIRST VIEWPORT: Empty mat centers "Design the cut." with Add text, Import image, and Preview & order. Header mode reads Design / Product Preview. Product Preview pins Buy Sticker and Buy Apparel to a footer that does not scroll away.
FORM: Extension of the incumbent studio. No new visual world. Seed was not rolled because this is a local path inside an established surface.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Scope

In: empty mat, the hint once the mat has objects, the product-preview order row, focus and selection colour.
Out: OrderModal fields, Stripe, webhooks, `/api/orders`, admin token, jobs board, env, and Vercel settings.

## Assumptions

Inferred because this run could not wait on Nathan. Primary job is a first-time customer finding checkout. Prices shown are the standard totals already in `orderPricing.ts` and the policies page, not a new offer.
