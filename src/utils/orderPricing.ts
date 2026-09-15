export const UNIT_PRICES = {
  vinyl: 12.99,
  product: 24.99,
} as const;

export const PERMANENT_SURCHARGE = 6;
export const SHIPPING_COST = 5.99;
export const ORDER_CURRENCY = 'AUD';

export type OrderPricingConfig = {
  orderType?: 'vinyl' | 'product' | string;
  vinylPermanent?: boolean;
  quantity?: number;
};

export function clampQuantity(quantity?: number): number {
  const n = Number(quantity);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(100, Math.floor(n)));
}

export function roundMoney(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function calculateOrderTotal(config: OrderPricingConfig = {}): number {
  const orderType = config.orderType === 'product' ? 'product' : 'vinyl';
  const quantity = clampQuantity(config.quantity);
  const unit =
    UNIT_PRICES[orderType] + (orderType === 'vinyl' && config.vinylPermanent ? PERMANENT_SURCHARGE : 0);
  return roundMoney(unit * quantity + SHIPPING_COST);
}

export function moneyString(value: number): string {
  return roundMoney(value).toFixed(2);
}

/** Short production label for the jobs board and checkout UI. */
export function describeOrderJob(config: Record<string, unknown> | null | undefined): string {
  if (!config) return 'Custom job';
  const orderType = config.orderType === 'product' ? 'product' : 'vinyl';
  const qty = clampQuantity(typeof config.quantity === 'number' ? config.quantity : Number(config.quantity));
  if (orderType === 'product') {
    const parts = [config.productId, config.productSize, config.productColor].filter(
      (part) => typeof part === 'string' && part,
    );
    return `${parts.join(' · ') || 'apparel'} ×${qty}`;
  }
  const w = typeof config.vinylWidthCm === 'number' ? config.vinylWidthCm : 10;
  const h = typeof config.vinylHeightCm === 'number' ? config.vinylHeightCm : 10;
  const finish = config.vinylPermanent
    ? `permanent ${typeof config.vinylFinish === 'string' ? config.vinylFinish : 'matte'}`
    : 'removable';
  return `vinyl ${w}×${h}cm ${finish} ×${qty}`;
}
