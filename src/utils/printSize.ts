import { getMockupView } from '../three/mockupCatalog.ts';
import {
  isSizedProduct,
  type ApparelSize,
  type ProductId,
} from '../three/productCatalog.ts';

/**
 * Physical size of the print on the product screen.
 *
 * The mockup frame is treated as the garment's flat body. A scale of 1 fills
 * the calibrated print zone (`widthPct` / `heightPct` of that frame). The
 * slider multiplies both sides. These body sizes are assumptions: the studio
 * has print zones and pricing caps, and no measured blank table.
 *
 * Adult widths are typical AU unisex flat measurements. Size M is the photo
 * reference. Hoodies and sloppy joes share a heavier blank. Baby is an infant
 * onesie. The clock frame is the 30cm pricing cap. The bottle frame is 15cm
 * wide by 12.5cm tall, so the wrap zone at scale 1 is about 5.4 × 5.0 cm.
 */
const TEE_WIDTH_CM: Record<ApparelSize, number> = {
  XS: 46,
  S: 49,
  M: 52,
  L: 56,
  XL: 60,
  '2XL': 64,
};
const TEE_LENGTH_CM: Record<ApparelSize, number> = {
  XS: 68,
  S: 71,
  M: 74,
  L: 77,
  XL: 80,
  '2XL': 83,
};
const HOODIE_WIDTH_CM: Record<ApparelSize, number> = {
  XS: 52,
  S: 56,
  M: 60,
  L: 64,
  XL: 68,
  '2XL': 72,
};
const HOODIE_LENGTH_CM: Record<ApparelSize, number> = {
  XS: 64,
  S: 67,
  M: 70,
  L: 73,
  XL: 76,
  '2XL': 79,
};
const BABY_WIDTH_CM: Record<ApparelSize, number> = {
  XS: 22,
  S: 24,
  M: 26,
  L: 28,
  XL: 30,
  '2XL': 32,
};
const BABY_LENGTH_CM: Record<ApparelSize, number> = {
  XS: 36,
  S: 40,
  M: 44,
  L: 48,
  XL: 52,
  '2XL': 56,
};

const FIXED_FRAME_CM: Partial<Record<ProductId, { widthCm: number; heightCm: number }>> = {
  clock: { widthCm: 30, heightCm: 30 },
  drinkBottle: { widthCm: 15, heightCm: 12.5 },
};

export function roundPrintCm(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatPrintCm(value: number): string {
  const rounded = roundPrintCm(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function garmentFrameCm(productId: ProductId, garmentSize: string): { widthCm: number; heightCm: number } {
  const fixed = FIXED_FRAME_CM[productId];
  if (fixed) return fixed;
  const size = (isSizedProduct(productId) ? garmentSize : 'M') as ApparelSize;
  if (productId === 'babyClothes') {
    return { widthCm: BABY_WIDTH_CM[size] ?? BABY_WIDTH_CM.M, heightCm: BABY_LENGTH_CM[size] ?? BABY_LENGTH_CM.M };
  }
  if (productId === 'hoodie' || productId === 'sloppyJoe') {
    return { widthCm: HOODIE_WIDTH_CM[size] ?? HOODIE_WIDTH_CM.M, heightCm: HOODIE_LENGTH_CM[size] ?? HOODIE_LENGTH_CM.M };
  }
  return { widthCm: TEE_WIDTH_CM[size] ?? TEE_WIDTH_CM.M, heightCm: TEE_LENGTH_CM[size] ?? TEE_LENGTH_CM.M };
}

/** Centimetre print box for the current product, view, garment size, and scale. */
export function printSizeCm(input: {
  productId: ProductId;
  viewId: string;
  color: string;
  garmentSize: string;
  scale: number;
}): { widthCm: number; heightCm: number } | null {
  const mockup = getMockupView(input.productId, input.viewId, input.color);
  if (!mockup) return null;
  const frame = garmentFrameCm(input.productId, input.garmentSize);
  const scale = Number.isFinite(input.scale) ? input.scale : 1;
  return {
    widthCm: roundPrintCm(frame.widthCm * (mockup.printZone.widthPct / 100) * scale),
    heightCm: roundPrintCm(frame.heightCm * (mockup.printZone.heightPct / 100) * scale),
  };
}
