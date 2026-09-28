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

function coercePositiveNumber(value: unknown, fallback: number | null = null): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n * 10) / 10;
}

/** Vinyl cut size in cm, or null when the stored order never recorded one. */
export function vinylSizeCm(
  config: Record<string, unknown> | null | undefined,
): { widthCm: number; heightCm: number } | null {
  if (!config) return null;
  const w = coercePositiveNumber(config.vinylWidthCm, null);
  const h = coercePositiveNumber(config.vinylHeightCm, null);
  if (w == null || h == null) return null;
  return { widthCm: w, heightCm: h };
}

/**
 * Labeled size for the jobs board.
 * Vinyl → cm + inches. Apparel → garment size (S/M/L…). Null when legacy jobs lack size.
 */
export function formatOrderSize(config: Record<string, unknown> | null | undefined): string | null {
  if (!config) return null;
  const orderType = config.orderType === 'product' ? 'product' : 'vinyl';
  if (orderType === 'product') {
    const size = typeof config.productSize === 'string' ? config.productSize.trim() : '';
    return size || null;
  }
  const dims = vinylSizeCm(config);
  if (!dims) return null;
  const { widthCm, heightCm } = dims;
  const widthIn = Math.round((widthCm / 2.54) * 10) / 10;
  const heightIn = Math.round((heightCm / 2.54) * 10) / 10;
  return `${widthCm}×${heightCm} cm · ${widthIn}×${heightIn} in`;
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
  const dims = vinylSizeCm(config);
  const w = dims?.widthCm ?? 10;
  const h = dims?.heightCm ?? 10;
  const finish = config.vinylPermanent
    ? `permanent ${typeof config.vinylFinish === 'string' ? config.vinylFinish : 'matte'}`
    : 'removable';
  return `vinyl ${w}×${h}cm ${finish} ×${qty}`;
}
