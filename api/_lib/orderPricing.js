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

/**
 * @param {{ orderType?: string, vinylPermanent?: boolean, quantity?: number }} config
 */
export function calculateOrderTotal(config = {}) {
  const quantity = clampQuantity(config.quantity);
  return roundMoney(unitPriceForConfig(config) * quantity + SHIPPING_COST);
}

/** Short production label for Stripe line items and the jobs board. */
export function jobSummary(orderConfig = {}) {
  const orderType = orderConfig.orderType === 'product' ? 'product' : 'vinyl';
  const qty = clampQuantity(orderConfig.quantity);
  if (orderType === 'product') {
    const parts = [
      orderConfig.productId || 'apparel',
      orderConfig.productSize,
      orderConfig.productColor,
    ].filter(Boolean);
    return `${parts.join(' · ')} ×${qty}`;
  }
  const w = orderConfig.vinylWidthCm || 10;
  const h = orderConfig.vinylHeightCm || 10;
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
