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

interface MockupColorAssets {
  front: string;
  back: string;
  printZones: {
    front: MockupPrintZone;
    back: MockupPrintZone;
  };
}

const HOODIE_ZONES = {
  front: { centerX: 50, centerY: 44, widthPct: 30, heightPct: 24 },
  back: { centerX: 50, centerY: 46, widthPct: 32, heightPct: 26 },
} as const;

const SLOPPY_JOE_ZONES = {
  front: { centerX: 50, centerY: 42, widthPct: 28, heightPct: 22 },
  back: { centerX: 50, centerY: 44, widthPct: 30, heightPct: 24 },
} as const;

const TSHIRT_ZONES = {
  front: { centerX: 50, centerY: 40, widthPct: 34, heightPct: 28 },
  back: { centerX: 50, centerY: 42, widthPct: 36, heightPct: 30 },
} as const;

/** Photo mockups keyed by product and garment colour hex. */
const MOCKUP_ASSETS: Partial<Record<ProductId, Record<string, MockupColorAssets>>> = {
  hoodie: {
    '#ffffff': {
      front: '/mockups/hoodie/white-front.jpg',
      back: '/mockups/hoodie/white-back.jpg',
      printZones: HOODIE_ZONES,
    },
    '#111111': {
      front: '/mockups/hoodie/black-front.jpg',
      back: '/mockups/hoodie/black-back.jpg',
      printZones: HOODIE_ZONES,
    },
  },
  sloppyJoe: {
    '#ffffff': {
      front: '/mockups/sloppy-joe/white-front.jpg',
      back: '/mockups/sloppy-joe/white-back.jpg',
      printZones: SLOPPY_JOE_ZONES,
    },
    '#111111': {
      front: '/mockups/sloppy-joe/black-front.jpg',
      back: '/mockups/sloppy-joe/black-back.jpg',
      printZones: SLOPPY_JOE_ZONES,
    },
  },
  tshirt: {
    '#ffffff': {
      front: '/mockups/tshirt/white-front.jpg',
      back: '/mockups/tshirt/white-back.jpg',
      printZones: TSHIRT_ZONES,
    },
    '#111111': {
      front: '/mockups/tshirt/black-front.jpg',
      back: '/mockups/tshirt/black-back.jpg',
      printZones: TSHIRT_ZONES,
    },
  },
  babyClothes: {
    '#ffffff': {
      front: '/mockups/tshirt/white-front.jpg',
      back: '/mockups/tshirt/white-back.jpg',
      printZones: TSHIRT_ZONES,
    },
    '#111111': {
      front: '/mockups/tshirt/black-front.jpg',
      back: '/mockups/tshirt/black-back.jpg',
      printZones: TSHIRT_ZONES,
    },
  },
};

function resolveColorKey(productId: ProductId, color: string): string | null {
  const palette = MOCKUP_ASSETS[productId];
  if (!palette) return null;
  if (palette[color]) return color;

  const normalized = color.toLowerCase();
  const isLight = normalized === '#ffffff' || normalized === '#f5f5f5' || normalized === '#e0e0e0';
  const fallback = isLight ? '#ffffff' : '#111111';
  return palette[fallback] ? fallback : Object.keys(palette)[0] ?? null;
}

export function getMockupViews(productId: ProductId, color: string): MockupViewConfig[] | null {
  const palette = MOCKUP_ASSETS[productId];
  const colorKey = resolveColorKey(productId, color);
  if (!palette || !colorKey) return null;

  const assets = palette[colorKey];
  return [
    {
      id: 'front',
      label: 'Front',
      imageSrc: assets.front,
      printZone: assets.printZones.front,
    },
    {
      id: 'back',
      label: 'Back',
      imageSrc: assets.back,
      printZone: assets.printZones.back,
    },
  ];
}

export function getMockupView(productId: ProductId, viewId: string, color: string): MockupViewConfig | null {
  const views = getMockupViews(productId, color);
  if (!views) return null;
  return views.find((view) => view.id === viewId) ?? views[0];
}
