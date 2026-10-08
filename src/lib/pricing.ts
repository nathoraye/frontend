/**
 * West Vinyl Studio quote math (Nathan, 1 Oct 2026).
 * Pure functions: no env, no I/O. The browser and the order API both use this file.
 * There is no GST. Nathan is not GST registered.
 */

export const ORDER_CURRENCY = 'AUD';

export const PRODUCT_TYPES = ['decal', 'tee', 'hoodie', 'baby', 'clock', 'bottle'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const DESIGN_TYPES = ['text', 'graphic', 'intricate'] as const;
export type DesignType = (typeof DESIGN_TYPES)[number];

export const TEXT_DENSITIES = ['standard', 'dense'] as const;
export type TextDensity = (typeof TEXT_DENSITIES)[number];

export const SHIPPING_OPTIONS = ['untracked', 'tracked'] as const;
export type ShippingOption = (typeof SHIPPING_OPTIONS)[number];

export const MIN_DIMENSION_CM = 2;
export const MIN_DIMENSION_ERROR = 'Minimum dimensions are 2cm x 2cm.';

/** Smallest single-colour decal vinyl charge, before labour and postage. */
export const DECAL_VINYL_MIN = 4;

const BASE_PRICE: Record<ProductType, number> = {
  decal: 0,
  tee: 32,
  hoodie: 52,
  baby: 24,
  clock: 28,
  bottle: 32,
};

export const PRODUCT_LABELS: Record<ProductType, string> = {
  decal: 'Decal',
  tee: 'T-Shirt',
  hoodie: 'Hoodie',
  baby: 'Baby',
  clock: 'Clock',
  bottle: 'Drink Bottle',
};

export interface NormalizedQuoteInput {
  product: ProductType;
  widthCm: number;
  heightCm: number;
  designType: DesignType;
  textDensity: TextDensity | null;
  shippingOption: ShippingOption | null;
}

export interface PriceQuote {
  product: ProductType;
  widthCm: number;
  heightCm: number;
  areaCm2: number;
  designType: DesignType;
  textDensity: TextDensity | null;
  shippingOption: ShippingOption | null;
  base: number;
  rawAreaCost: number;
  vinyl: number;
  labour: number;
  subtotal: number;
  shipping: number;
  shippingLabel: string;
  total: number;
}

export type QuoteResult =
  | { ok: true; input: NormalizedQuoteInput; quote: PriceQuote }
  | { ok: false; error: string };

export function round2(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function moneyString(value: number): string {
  return round2(value).toFixed(2);
}

export function clampQuantity(quantity?: unknown): number {
  const n = Number(quantity);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(100, Math.floor(n)));
}

/** Charged AUD total: item subtotal × quantity, shipping once. */
export function chargedTotal(quote: PriceQuote, quantity?: unknown): number {
  return round2(quote.subtotal * clampQuantity(quantity) + quote.shipping);
}

/**
 * Single-colour decal vinyl in AUD, before labour and postage.
 *
 * Replaces the 1 Oct 2026 area schedule (floor A$8.50, about A$33 at 300 cm²).
 * That schedule priced an 18×16.8 cm graphic decal at A$42.05 with untracked post.
 * US single-colour charts are about US$1 per inch after a US$1 base (3 in US$4 through
 * 12 in US$13). At 1.55 AUD per USD and a 15% Australian supply margin, a square is
 * about A$0.70 per centimetre of the longest side plus A$2, and never under A$4.
 * A thinner decal pays for the long side, then a fraction of the square for the short side.
 */
export function decalVinylCost(widthCm: number, heightCm: number): number {
  const longest = Math.max(widthCm, heightCm);
  const shortest = Math.min(widthCm, heightCm);
  const square = round2(Math.max(DECAL_VINYL_MIN, longest * 0.7 + 2));
  if (!(longest > 0)) return square;
  const fill = Math.min(1, Math.max(0, shortest / longest));
  return round2(square * (0.55 + 0.45 * fill));
}

/**
 * Tee, hoodie, clock, and bottle include print up to 900 cm² (bottle's 15×5 cap is 75 cm²,
 * so its extra rate does not come into play). Baby includes print up to 225 cm².
 * Extra print is A$0.02 per cm². Decals use decalVinylCost instead of this area rule.
 */
export function vinylCost(product: ProductType, area: number): number {
  if (product === 'decal') return decalVinylCost(Math.sqrt(area), Math.sqrt(area));
  if (product === 'baby') {
    if (area <= 225) return 0;
    return round2((area - 225) * 0.02);
  }
  if (area <= 900) return 0;
  return round2((area - 900) * 0.02);
}

export function labourCost(designType: DesignType, textDensity: TextDensity | null): number {
  if (designType === 'intricate') return 12;
  if (designType === 'graphic') return 5;
  if (designType === 'text' && textDensity === 'dense') return 5;
  return 0;
}

export function shippingAmount(product: ProductType, shippingOption: ShippingOption | null): number {
  if (product !== 'decal') return 12;
  return shippingOption === 'tracked' ? 10 : 4;
}

export function shippingChoiceLabel(product: ProductType, shippingOption: ShippingOption | null): string {
  if (product !== 'decal') return 'Standard AusPost Parcel ($12.00)';
  if (shippingOption === 'tracked') return 'Tracked Parcel Mailer ($10.00)';
  return 'Untracked Rigid Post ($4.00)';
}

export function shippingLineName(product: ProductType, shippingOption: ShippingOption | null): string {
  if (product !== 'decal') return 'Standard AusPost Parcel';
  if (shippingOption === 'tracked') return 'Tracked Parcel Mailer';
  return 'Untracked Rigid Post';
}

export function productCheckoutName(product: ProductType): string {
  switch (product) {
    case 'decal':
      return 'Custom decal';
    case 'tee':
      return 'Custom t-shirt';
    case 'hoodie':
      return 'Custom hoodie';
    case 'baby':
      return 'Custom baby garment';
    case 'clock':
      return 'Custom wall clock';
    case 'bottle':
      return 'Custom drink bottle';
  }
}

export function productLimitLabel(product: ProductType): string {
  switch (product) {
    case 'baby':
      return 'Max 25×25cm';
    case 'bottle':
      return 'Max 15×5cm';
    case 'clock':
      return 'Max 30×30cm';
    default:
      return 'Max 30×60cm';
  }
}

export function defaultSizeCm(product: ProductType): { widthCm: number; heightCm: number } {
  if (product === 'bottle') return { widthCm: 15, heightCm: 5 };
  return { widthCm: 10, heightCm: 10 };
}

export function productTypeFromCatalog(productId: string): ProductType | null {
  switch (productId) {
    case 'tshirt':
      return 'tee';
    case 'hoodie':
    case 'sloppyJoe':
      return 'hoodie';
    case 'babyClothes':
      return 'baby';
    case 'clock':
      return 'clock';
    case 'drinkBottle':
      return 'bottle';
    case 'decal':
    case 'vinyl':
      return 'decal';
    default:
      return null;
  }
}

/** Catalog id charged for a quote product. Sloppy Joe stays a hoodie-priced jumper. */
export function catalogIdForProduct(product: ProductType, currentProductId?: unknown): string | undefined {
  if (product === 'decal') return undefined;
  if (product === 'hoodie' && currentProductId === 'sloppyJoe') return 'sloppyJoe';
  switch (product) {
    case 'tee':
      return 'tshirt';
    case 'hoodie':
      return 'hoodie';
    case 'baby':
      return 'babyClothes';
    case 'clock':
      return 'clock';
    case 'bottle':
      return 'drinkBottle';
  }
}

export function dimensionError(product: ProductType, widthCm: number, heightCm: number): string | null {
  if (widthCm < MIN_DIMENSION_CM || heightCm < MIN_DIMENSION_CM) return MIN_DIMENSION_ERROR;
  const longSide = Math.max(widthCm, heightCm);
  const shortSide = Math.min(widthCm, heightCm);
  if (product === 'baby' && (widthCm > 25 || heightCm > 25)) {
    return 'Baby clothes max size is 25cm × 25cm.';
  }
  if (product === 'bottle' && (longSide > 15 || shortSide > 5)) {
    return 'Drink bottles max size is 15cm on the long side and 5cm on the short side.';
  }
  if (product === 'clock' && (widthCm > 30 || heightCm > 30)) {
    return 'Clocks max size is 30cm × 30cm.';
  }
  if (
    (product === 'decal' || product === 'tee' || product === 'hoodie') &&
    (shortSide > 30 || longSide > 60)
  ) {
    return `${PRODUCT_LABELS[product]} max size is 30cm on the short side and 60cm on the long side.`;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readField(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value == null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    return value;
  }
  return undefined;
}

function readMeasure(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isProduct(value: unknown): value is ProductType {
  return typeof value === 'string' && (PRODUCT_TYPES as readonly string[]).includes(value);
}

function isDesign(value: unknown): value is DesignType {
  return typeof value === 'string' && (DESIGN_TYPES as readonly string[]).includes(value);
}

function isDensity(value: unknown): value is TextDensity {
  return typeof value === 'string' && (TEXT_DENSITIES as readonly string[]).includes(value);
}

function isShipping(value: unknown): value is ShippingOption {
  return typeof value === 'string' && (SHIPPING_OPTIONS as readonly string[]).includes(value);
}

function resolveProduct(source: Record<string, unknown>): { product: ProductType } | { error: string } {
  const explicit = readField(source, ['productType', 'product']);
  if (explicit != null) {
    if (!isProduct(explicit)) {
      return { error: 'Product must be decal, tee, hoodie, baby, clock, or bottle.' };
    }
    return { product: explicit };
  }
  if (typeof source.productId === 'string' && source.productId.trim()) {
    const mapped = productTypeFromCatalog(source.productId.trim());
    if (mapped) return { product: mapped };
    return { error: 'Product must be decal, tee, hoodie, baby, clock, or bottle.' };
  }
  if (source.orderType === 'product') return { error: 'Choose a product.' };
  return { product: 'decal' };
}

/** Validate quote inputs and price them. Client-sent totals are ignored. */
export function quoteOrder(source: unknown): QuoteResult {
  if (!isRecord(source)) return { ok: false, error: 'Choose a product.' };
  const resolved = resolveProduct(source);
  if ('error' in resolved) return { ok: false, error: resolved.error };
  const product = resolved.product;

  const widthCm = readMeasure(readField(source, ['widthCm', 'width', 'vinylWidthCm']));
  const heightCm = readMeasure(readField(source, ['heightCm', 'height', 'vinylHeightCm']));
  if (widthCm == null || heightCm == null) {
    return { ok: false, error: 'Enter a width and a height in centimetres.' };
  }

  const sizeError = dimensionError(product, widthCm, heightCm);
  if (sizeError) return { ok: false, error: sizeError };

  const designRaw = readField(source, ['designType']);
  if (designRaw == null) return { ok: false, error: 'Choose a design category.' };
  if (!isDesign(designRaw)) {
    return { ok: false, error: 'Design type must be text, graphic, or intricate.' };
  }
  const designType = designRaw;

  let textDensity: TextDensity | null = null;
  if (designType === 'text') {
    const densityRaw = readField(source, ['textDensity']);
    if (densityRaw == null) textDensity = 'standard';
    else if (!isDensity(densityRaw)) return { ok: false, error: 'Text layout must be standard or dense.' };
    else textDensity = densityRaw;
  }

  let shippingOption: ShippingOption | null = null;
  if (product === 'decal') {
    const shippingRaw = readField(source, ['shippingOption']);
    if (!isShipping(shippingRaw)) return { ok: false, error: 'Choose untracked or tracked post for decals.' };
    shippingOption = shippingRaw;
  }

  const areaCm2 = widthCm * heightCm;
  const base = BASE_PRICE[product];
  const vinyl = product === 'decal' ? decalVinylCost(widthCm, heightCm) : vinylCost(product, areaCm2);
  const labour = labourCost(designType, textDensity);
  const subtotal = round2(base + vinyl + labour);
  const shipping = shippingAmount(product, shippingOption);
  const total = round2(subtotal + shipping);

  const input: NormalizedQuoteInput = {
    product,
    widthCm,
    heightCm,
    designType,
    textDensity,
    shippingOption,
  };

  return {
    ok: true,
    input,
    quote: {
      ...input,
      areaCm2: round2(areaCm2),
      base,
      rawAreaCost: vinyl,
      vinyl,
      labour,
      subtotal,
      shipping,
      shippingLabel: shippingChoiceLabel(product, shippingOption),
      total,
    },
  };
}

/** Coerce a positive finite number (accepts numeric strings from JSON/forms). */
export function coercePositiveNumber(value: unknown, fallback: number | null = null): number | null {
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

function formatDim(value: number): string {
  const rounded = round2(value);
  if (Number.isInteger(rounded)) return String(rounded);
  return moneyString(rounded).replace(/0$/, '').replace(/\.0$/, '');
}

function quoteDims(config: Record<string, unknown>): { widthCm: number; heightCm: number } | null {
  const widthCm = readMeasure(readField(config, ['widthCm', 'vinylWidthCm']));
  const heightCm = readMeasure(readField(config, ['heightCm', 'vinylHeightCm']));
  if (widthCm == null || heightCm == null || widthCm <= 0 || heightCm <= 0) return null;
  return { widthCm, heightCm };
}

/**
 * Labeled size for the jobs board.
 * Quoted jobs include area. Legacy vinyl jobs keep centimetres and inches.
 */
export function formatOrderSize(config: Record<string, unknown> | null | undefined): string | null {
  if (!config) return null;
  const orderType = config.orderType === 'product' ? 'product' : 'vinyl';
  const dims = quoteDims(config);
  const quoted = config.productType != null || config.designType != null || isRecord(config.quote);
  if (dims && (quoted || orderType === 'vinyl')) {
    const { widthCm, heightCm } = dims;
    const area = round2(widthCm * heightCm);
    const widthIn = Math.round((widthCm / 2.54) * 10) / 10;
    const heightIn = Math.round((heightCm / 2.54) * 10) / 10;
    if (quoted) {
      const print = `${formatDim(widthCm)}×${formatDim(heightCm)} cm · ${formatDim(area)} cm² · ${widthIn}×${heightIn} in`;
      const garment = typeof config.productSize === 'string' ? config.productSize.trim() : '';
      return orderType === 'product' && garment ? `${garment} · ${print}` : print;
    }
    return `${formatDim(widthCm)}×${formatDim(heightCm)} cm · ${widthIn}×${heightIn} in`;
  }
  if (orderType === 'product') {
    const size = typeof config.productSize === 'string' ? config.productSize.trim() : '';
    return size || null;
  }
  return null;
}

function designWord(input: NormalizedQuoteInput): string {
  if (input.designType === 'text' && input.textDensity === 'dense') return 'dense text';
  return input.designType;
}

/** Short production label for Stripe line items and the jobs board. */
export function jobSummary(config: Record<string, unknown> | null | undefined): string {
  if (!config) return 'Custom job';
  const qty = clampQuantity(config.quantity);
  const quoted = quoteOrder(config);
  if (quoted.ok) {
    const { input } = quoted;
    const extra = [config.productSize, config.productColor].filter(
      (part) => typeof part === 'string' && part.trim(),
    ) as string[];
    const tail = extra.length ? ` · ${extra.join(' · ')}` : '';
    return `${input.product} ${formatDim(input.widthCm)}×${formatDim(input.heightCm)}cm ${designWord(input)}${tail} ×${qty}`;
  }
  const orderType = config.orderType === 'product' ? 'product' : 'vinyl';
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

export function describeOrderJob(config: Record<string, unknown> | null | undefined): string {
  return jobSummary(config);
}
