/** Shared AUD pricing for the checkout UI and Stripe Checkout Sessions. */

export const UNIT_PRICES = Object.freeze({
  vinyl: 12.99,
  product: 24.99,
});

export const PERMANENT_SURCHARGE = 6;
export const SHIPPING_COST = 5.99;
export const ORDER_CURRENCY = 'AUD';

export function unitPriceForConfig(config = {}) {
  const orderType = config.orderType === 'product' ? 'product' : 'vinyl';
  return (
    UNIT_PRICES[orderType] + (orderType === 'vinyl' && config.vinylPermanent ? PERMANENT_SURCHARGE : 0)
  );
}

/** Stripe AUD minimum is 50¢. Cap smoke totals so a typo cannot charge thousands. */
const SMOKE_MIN_CENTS = 50;
const SMOKE_MAX_CENTS = 100_000;

/**
 * Temporary server-only Checkout total override in cents.
 * Unset/empty → retail pricing. `100` → A$1.00. Client amount/unitAmount are ignored.
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

/** Retail total, or the smoke-test override in dollars when SMOKE_CHECKOUT_AMOUNT_CENTS is set. */
export function checkoutChargeAmount(config = {}) {
  const cents = smokeCheckoutAmountCents();
  if (cents != null) return roundMoney(cents / 100);
  return calculateOrderTotal(config);
}

/**
 * @param {{ orderType?: string, vinylPermanent?: boolean, quantity?: number }} config
 */
export function calculateOrderTotal(config = {}) {
  const quantity = clampQuantity(config.quantity);
  return roundMoney(unitPriceForConfig(config) * quantity + SHIPPING_COST);
}

/** Coerce a positive finite number (accepts numeric strings from JSON/forms). */
export function coercePositiveNumber(value, fallback = null) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n * 10) / 10;
}

/** Vinyl cut size in cm, or null when the stored order never recorded one. */
export function vinylSizeCm(orderConfig = {}) {
  const w = coercePositiveNumber(orderConfig.vinylWidthCm, null);
  const h = coercePositiveNumber(orderConfig.vinylHeightCm, null);
  if (w == null || h == null) return null;
  return { widthCm: w, heightCm: h };
}

/** Human size line for jobs board / Stripe (cm + inches for vinyl; S/M/L for apparel). */
export function formatOrderSize(orderConfig = {}) {
  const orderType = orderConfig.orderType === 'product' ? 'product' : 'vinyl';
  if (orderType === 'product') {
    const size =
      typeof orderConfig.productSize === 'string' ? orderConfig.productSize.trim() : '';
    return size || null;
  }
  const dims = vinylSizeCm(orderConfig);
  if (!dims) return null;
  const { widthCm, heightCm } = dims;
  const widthIn = Math.round((widthCm / 2.54) * 10) / 10;
  const heightIn = Math.round((heightCm / 2.54) * 10) / 10;
  return `${widthCm}×${heightCm} cm · ${widthIn}×${heightIn} in`;
}

/** Short production label for Stripe line items and the jobs board. */
export function jobSummary(orderConfig = {}) {
  const orderType = orderConfig.orderType === 'product' ? 'product' : 'vinyl';
  const qty = clampQuantity(orderConfig.quantity);
  if (orderType === 'product') {
    const parts = [
      orderConfig.productId || 'apparel',
      typeof orderConfig.productSize === 'string' ? orderConfig.productSize.trim() : orderConfig.productSize,
      orderConfig.productColor,
    ].filter(Boolean);
    return `${parts.join(' · ')} ×${qty}`;
  }
  const dims = vinylSizeCm(orderConfig);
  const w = dims?.widthCm ?? 10;
  const h = dims?.heightCm ?? 10;
  const finish = orderConfig.vinylPermanent
    ? `permanent ${orderConfig.vinylFinish || 'matte'}`
    : 'removable';
  return `vinyl ${w}×${h}cm ${finish} ×${qty}`;
}

export function clampQuantity(quantity) {
  const n = Number(quantity);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(100, Math.floor(n)));
}

export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function moneyString(value) {
  return roundMoney(value).toFixed(2);
}
