import { PLACEMENT_SCALE_MAX, PLACEMENT_SCALE_MIN } from './apparelPlacement.ts';
import {
  isSizedProduct,
  type ApparelSize,
  type ProductId,
} from '../three/productCatalog.ts';

/**
 * Maximum print box for a garment size.
 *
 * Adult tee, hoodie, and sloppy joe use JenniferMaker's adult maxima converted
 * at 2.54 cm per inch, then capped at the 30×40 cm front from the NPG guide.
 * The chart starts at Adult Small, so XS is one inch under that. Front and back
 * share one box: the inch charts match full front to full back. NPG's 30×50 cm
 * back is larger than any size sold here.
 *
 * Baby steps up to the NPG kids guide of 23×25 cm. The references do not give
 * a smaller baby chart, so the younger sizes are stepped down from that.
 * Clock and bottle stay on their existing pricing caps.
 */
const INCH_CM = 2.54;
const ADULT_CAP = { widthCm: 30, heightCm: 40 };

export interface PrintBox {
  widthCm: number;
  heightCm: number;
}

export const CHEST_LOGO_CM = 10;
export const MEDIUM_PRINT_CM = 20;

/** Sticker shop. Each side is at least 3 cm. Neither side exceeds 60 cm, and the shorter side is at most 30 cm. */
export const STICKER_SIDE_MIN_CM = 3;
export const STICKER_SHORT_MAX_CM = 30;
export const STICKER_LONG_MAX_CM = 60;

const ADULT_INCHES: Record<ApparelSize, { widthIn: number; heightIn: number }> = {
  XS: { widthIn: 9, heightIn: 11 },
  S: { widthIn: 10, heightIn: 12 },
  M: { widthIn: 10, heightIn: 12 },
  L: { widthIn: 10.5, heightIn: 12.5 },
  XL: { widthIn: 11, heightIn: 13 },
  '2XL': { widthIn: 12, heightIn: 14 },
};

const BABY_PRINT_CM: Record<ApparelSize, PrintBox> = {
  XS: { widthCm: 12, heightCm: 14 },
  S: { widthCm: 14, heightCm: 16 },
  M: { widthCm: 16, heightCm: 18 },
  L: { widthCm: 18, heightCm: 20 },
  XL: { widthCm: 20, heightCm: 22 },
  '2XL': { widthCm: 23, heightCm: 25 },
};

const FIXED_PRINT_CM: Partial<Record<ProductId, PrintBox>> = {
  clock: { widthCm: 30, heightCm: 30 },
  drinkBottle: { widthCm: 15, heightCm: 5 },
};

export function roundPrintCm(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampStickerSide(value: number): number {
  if (!Number.isFinite(value)) return STICKER_SIDE_MIN_CM;
  const rounded = Math.round(value * 10) / 10;
  return Math.min(STICKER_LONG_MAX_CM, Math.max(STICKER_SIDE_MIN_CM, rounded));
}

/** Keep a sticker inside 3 cm and 30×60 cm. The side not being edited shrinks when both would exceed 30. */
export function clampStickerSize(
  widthCm: number,
  heightCm: number,
  edited: 'width' | 'height',
): { widthCm: number; heightCm: number } {
  let width = clampStickerSide(widthCm);
  let height = clampStickerSide(heightCm);
  if (Math.min(width, height) > STICKER_SHORT_MAX_CM) {
    if (edited === 'width') height = STICKER_SHORT_MAX_CM;
    else width = STICKER_SHORT_MAX_CM;
  }
  return { widthCm: width, heightCm: height };
}

export function formatPrintCm(value: number): string {
  const rounded = roundPrintCm(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function fromInches(widthIn: number, heightIn: number): PrintBox {
  return {
    widthCm: Math.min(ADULT_CAP.widthCm, roundPrintCm(widthIn * INCH_CM)),
    heightCm: Math.min(ADULT_CAP.heightCm, roundPrintCm(heightIn * INCH_CM)),
  };
}

function adultPrint(size: ApparelSize): PrintBox {
  const inches = ADULT_INCHES[size] ?? ADULT_INCHES.M;
  return fromInches(inches.widthIn, inches.heightIn);
}

/** Full print box for this product, view, and garment size. Scale 1 fills it. */
export function maxPrintCm(input: {
  productId: ProductId;
  viewId?: string;
  garmentSize: string;
}): PrintBox | null {
  const fixed = FIXED_PRINT_CM[input.productId];
  if (fixed) return fixed;
  const size = (isSizedProduct(input.productId) ? input.garmentSize : 'M') as ApparelSize;
  if (input.productId === 'babyClothes') return BABY_PRINT_CM[size] ?? BABY_PRINT_CM.M;
  if (input.productId === 'tshirt' || input.productId === 'hoodie' || input.productId === 'sloppyJoe') {
    return adultPrint(size);
  }
  return null;
}

/** Centimetre print box. Scale 1 is the max print for that garment and size. */
export function printSizeCm(input: {
  productId: ProductId;
  viewId: string;
  color?: string;
  garmentSize: string;
  scale: number;
}): PrintBox | null {
  const max = maxPrintCm(input);
  if (!max) return null;
  const scale = Number.isFinite(input.scale) ? input.scale : 1;
  return {
    widthCm: roundPrintCm(max.widthCm * scale),
    heightCm: roundPrintCm(max.heightCm * scale),
  };
}

/** Uniform scale whose longest side is the target, clamped to the slider. */
export function scaleForLongestSide(max: PrintBox, targetLongestCm: number): number {
  const longest = Math.max(max.widthCm, max.heightCm);
  if (!(longest > 0)) return PLACEMENT_SCALE_MAX;
  const scale = targetLongestCm / longest;
  return Math.max(PLACEMENT_SCALE_MIN, Math.min(PLACEMENT_SCALE_MAX, scale));
}
