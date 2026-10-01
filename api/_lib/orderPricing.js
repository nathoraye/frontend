/**
 * Server entry for the shared quote module in src/lib/pricing.ts.
 * Node's stripTypeScriptTypes loads that one file here so Vercel and `node server.mjs`
 * do not need a TypeScript compile step. The browser imports the .ts module directly.
 */
import { existsSync, readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

function pricingSourceUrl() {
  const candidates = [
    join(process.cwd(), 'src/lib/pricing.ts'),
    new URL('../../src/lib/pricing.ts', import.meta.url),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate instanceof URL ? candidate : pathToFileURL(candidate);
  }
  throw new Error('Shared pricing module src/lib/pricing.ts was not found');
}

const pricingUrl = pricingSourceUrl();
const pricingJs = stripTypeScriptTypes(readFileSync(pricingUrl, 'utf8'), {
  mode: 'strip',
  sourceUrl: pricingUrl.href,
});
const pricing = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(pricingJs)}`);

export const ORDER_CURRENCY = pricing.ORDER_CURRENCY;
export const quoteOrder = pricing.quoteOrder;
export const chargedTotal = pricing.chargedTotal;
export const clampQuantity = pricing.clampQuantity;
export const roundMoney = pricing.round2;
export const moneyString = pricing.moneyString;
export const jobSummary = pricing.jobSummary;
export const formatOrderSize = pricing.formatOrderSize;
export const vinylSizeCm = pricing.vinylSizeCm;
export const coercePositiveNumber = pricing.coercePositiveNumber;
export const catalogIdForProduct = pricing.catalogIdForProduct;
export const productCheckoutName = pricing.productCheckoutName;
export const shippingLineName = pricing.shippingLineName;
export const describeOrderJob = pricing.describeOrderJob;

/** Stripe AUD minimum is 50¢. Cap smoke totals so a typo cannot charge thousands. */
const SMOKE_MIN_CENTS = 50;
const SMOKE_MAX_CENTS = 100_000;

/**
 * Temporary server-only Checkout total override in cents.
 * Unset/empty → the shared quote. `100` → A$1.00. Client amount/unitAmount are ignored.
 * @param {string | undefined} raw
 * @returns {number | null}
 */
export function smokeCheckoutAmountCents(raw = process.env.SMOKE_CHECKOUT_AMOUNT_CENTS) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) {
    throw Object.assign(
      new Error('SMOKE_CHECKOUT_AMOUNT_CENTS must be an integer number of cents (e.g. 100 for A$1.00).'),
      { status: 503 },
    );
  }
  const cents = Number.parseInt(trimmed, 10);
  if (cents < SMOKE_MIN_CENTS || cents > SMOKE_MAX_CENTS) {
    throw Object.assign(
      new Error(
        `SMOKE_CHECKOUT_AMOUNT_CENTS must be between ${SMOKE_MIN_CENTS} and ${SMOKE_MAX_CENTS} (got ${cents}).`,
      ),
      { status: 503 },
    );
  }
  return cents;
}

/** Retail total from the shared quote, or the smoke-test override when set. */
export function checkoutChargeAmount(config = {}) {
  const cents = smokeCheckoutAmountCents();
  if (cents != null) return roundMoney(cents / 100);
  return calculateOrderTotal(config);
}

/** Recompute the AUD charge from product and design inputs. Never reads a client price. */
export function calculateOrderTotal(config = {}) {
  const result = quoteOrder(config);
  if (!result.ok) {
    throw Object.assign(new Error(result.error), { status: 400 });
  }
  return chargedTotal(result.quote, config.quantity);
}
