import type { ProductId } from './productCatalog';

export interface MockupPrintZone {
  centerX: number;
  centerY: number;
  widthPct: number;
  heightPct: number;
}

export interface MockupViewConfig {
  id: string;
  label: string;
  imageSrc: string;
  printZone: MockupPrintZone;
}

interface ProductMockup {
  views: MockupViewConfig[];
}

const TSHIRT_ZONES = {
  front: { centerX: 50, centerY: 42, widthPct: 32, heightPct: 26 },
  back: { centerX: 50, centerY: 44, widthPct: 34, heightPct: 28 },
} as const;

const HOODIE_ZONES = {
  front: { centerX: 50, centerY: 36, widthPct: 26, heightPct: 18 },
  back: { centerX: 50, centerY: 40, widthPct: 28, heightPct: 22 },
} as const;

const SLOPPY_JOE_ZONES = {
  front: { centerX: 50, centerY: 40, widthPct: 28, heightPct: 22 },
  back: { centerX: 50, centerY: 42, widthPct: 30, heightPct: 24 },
} as const;

const ONESIE_ZONES = {
  front: { centerX: 50, centerY: 36, widthPct: 26, heightPct: 20 },
  back: { centerX: 50, centerY: 38, widthPct: 28, heightPct: 22 },
} as const;

/**
 * Flat silhouettes in public/mockups. Garment colour is applied in the viewer
 * via CSS mask + background, so one SVG serves every swatch.
 */
const MOCKUPS: Partial<Record<ProductId, ProductMockup>> = {
  tshirt: {
    views: [
      { id: 'front', label: 'Front', imageSrc: '/mockups/tshirt-front.svg', printZone: TSHIRT_ZONES.front },
      { id: 'back', label: 'Back', imageSrc: '/mockups/tshirt-back.svg', printZone: TSHIRT_ZONES.back },
    ],
  },
  hoodie: {
    views: [
      { id: 'front', label: 'Front', imageSrc: '/mockups/hoodie-front.svg', printZone: HOODIE_ZONES.front },
      { id: 'back', label: 'Back', imageSrc: '/mockups/hoodie-back.svg', printZone: HOODIE_ZONES.back },
    ],
  },
  sloppyJoe: {
    views: [
      { id: 'front', label: 'Front', imageSrc: '/mockups/crew-front.svg', printZone: SLOPPY_JOE_ZONES.front },
      { id: 'back', label: 'Back', imageSrc: '/mockups/crew-back.svg', printZone: SLOPPY_JOE_ZONES.back },
    ],
  },
  babyClothes: {
    views: [
      { id: 'front', label: 'Front', imageSrc: '/mockups/onesie-front.svg', printZone: ONESIE_ZONES.front },
      { id: 'back', label: 'Back', imageSrc: '/mockups/onesie-back.svg', printZone: ONESIE_ZONES.back },
    ],
  },
  clock: {
    views: [
      { id: 'front', label: 'Face', imageSrc: '/mockups/clock.svg', printZone: { centerX: 50, centerY: 50, widthPct: 42, heightPct: 42 } },
    ],
  },
  drinkBottle: {
    views: [
      { id: 'front', label: 'Wrap', imageSrc: '/mockups/bottle.svg', printZone: { centerX: 50, centerY: 56, widthPct: 36, heightPct: 40 } },
    ],
  },
};

export function getMockupViews(productId: ProductId): MockupViewConfig[] | null {
  return MOCKUPS[productId]?.views ?? null;
}

export function getMockupView(productId: ProductId, viewId: string): MockupViewConfig | null {
  const views = getMockupViews(productId);
  if (!views) return null;
  return views.find((view) => view.id === viewId) ?? views[0];
}
