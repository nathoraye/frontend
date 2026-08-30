import type { ProductId } from './productCatalog';

export interface MockupPrintZone {
  /** Horizontal anchor as a percentage of the mockup image width. */
  centerX: number;
  /** Vertical anchor as a percentage of the mockup image height. */
  centerY: number;
  /** Maximum design width as a percentage of the mockup image width. */
  widthPct: number;
  /** Maximum design height as a percentage of the mockup image height. */
  heightPct: number;
}

export interface MockupViewConfig {
  id: string;
  label: string;
  imageSrc: string;
  printZone: MockupPrintZone;
}

const HOODIE_MOCKUPS: MockupViewConfig[] = [
  {
    id: 'front',
    label: 'Front',
    imageSrc: '/mockups/hoodie-front.jpg',
    printZone: { centerX: 50, centerY: 44, widthPct: 30, heightPct: 24 },
  },
  {
    id: 'back',
    label: 'Back',
    imageSrc: '/mockups/hoodie-back.jpg',
    printZone: { centerX: 50, centerY: 46, widthPct: 32, heightPct: 26 },
  },
];

const TSHIRT_MOCKUPS: MockupViewConfig[] = [
  {
    id: 'front',
    label: 'Front',
    imageSrc: '/tshirt-front.svg',
    printZone: { centerX: 50, centerY: 38, widthPct: 34, heightPct: 28 },
  },
  {
    id: 'back',
    label: 'Back',
    imageSrc: '/tshirt-back.svg',
    printZone: { centerX: 50, centerY: 40, widthPct: 36, heightPct: 30 },
  },
];

/** Flat mockup images and print zones for front/back apparel previews. */
export const MOCKUP_CATALOG: Partial<Record<ProductId, MockupViewConfig[]>> = {
  tshirt: TSHIRT_MOCKUPS,
  hoodie: HOODIE_MOCKUPS,
  sloppyJoe: HOODIE_MOCKUPS,
  babyClothes: TSHIRT_MOCKUPS,
};

export function getMockupViews(productId: ProductId): MockupViewConfig[] | null {
  return MOCKUP_CATALOG[productId] ?? null;
}

export function getMockupView(productId: ProductId, viewId: string): MockupViewConfig | null {
  const views = getMockupViews(productId);
  if (!views || views.length === 0) return null;
  return views.find((view) => view.id === viewId) ?? views[0];
}
