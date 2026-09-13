/** Shared AUD pricing for the checkout UI and Stripe PaymentIntent create. */

export const UNIT_PRICES = Object.freeze({
  vinyl: 12.99,
  product: 24.99,
});

export const PERMANENT_SURCHARGE = 6;
export const SHIPPING_COST = 5.99;
export const ORDER_CURRENCY = 'AUD';

/**
 * @param {{ orderType?: string, vinylPermanent?: boolean, quantity?: number }} config
 */
export function calculateOrderTotal(config = {}) {
  const orderType = config.orderType === 'product' ? 'product' : 'vinyl';
  const quantity = clampQuantity(config.quantity);
  const unit =
    UNIT_PRICES[orderType] + (orderType === 'vinyl' && config.vinylPermanent ? PERMANENT_SURCHARGE : 0);
  return roundMoney(unit * quantity + SHIPPING_COST);
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
