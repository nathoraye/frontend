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
  /**
   * CSS-mask the silhouette with the swatch colour. Only for SVG stand-ins.
   * Photographic JPGs already include garment colour — never tint those.
   */
  tintWithColor?: boolean;
}

interface PhotoColorAssets {
  front: string;
  back: string;
  printZones: {
    front: MockupPrintZone;
    back: MockupPrintZone;
  };
}

interface SilhouetteMockup {
  views: MockupViewConfig[];
}

/** Print zones calibrated against the photographic hoodie mockups (PR #5). */
const HOODIE_ZONES = {
  front: { centerX: 50, centerY: 44, widthPct: 30, heightPct: 24 },
  back: { centerX: 50, centerY: 46, widthPct: 32, heightPct: 26 },
} as const;

/** Print zones calibrated against the photographic sloppy-joe mockups (PR #5). */
const SLOPPY_JOE_ZONES = {
  front: { centerX: 50, centerY: 42, widthPct: 28, heightPct: 22 },
  back: { centerX: 50, centerY: 44, widthPct: 30, heightPct: 24 },
} as const;

/** Print zones calibrated against the photographic t-shirt mockups (PR #5). */
const TSHIRT_ZONES = {
  front: { centerX: 50, centerY: 40, widthPct: 34, heightPct: 28 },
  back: { centerX: 50, centerY: 42, widthPct: 36, heightPct: 30 },
} as const;

const ONESIE_ZONES = {
  front: { centerX: 50, centerY: 36, widthPct: 26, heightPct: 20 },
  back: { centerX: 50, centerY: 38, widthPct: 28, heightPct: 22 },
} as const;

/**
 * Per-colour photo mockups. White/black JPGs already show the garment colour,
 * so the viewer must not CSS-mask or tint them.
 */
const PHOTO_ASSETS: Partial<Record<ProductId, Record<string, PhotoColorAssets>>> = {
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
};

/**
 * SVG silhouettes for products that have no photographic mockups.
 * Colour is applied in the viewer via CSS mask + background.
 */
const SILHOUETTE_MOCKUPS: Partial<Record<ProductId, SilhouetteMockup>> = {
  babyClothes: {
    views: [
      { id: 'front', label: 'Front', imageSrc: '/mockups/onesie-front.svg', printZone: ONESIE_ZONES.front, tintWithColor: true },
      { id: 'back', label: 'Back', imageSrc: '/mockups/onesie-back.svg', printZone: ONESIE_ZONES.back, tintWithColor: true },
    ],
  },
  clock: {
    views: [
      { id: 'front', label: 'Face', imageSrc: '/mockups/clock.svg', printZone: { centerX: 50, centerY: 50, widthPct: 42, heightPct: 42 }, tintWithColor: true },
    ],
  },
  drinkBottle: {
    views: [
      { id: 'front', label: 'Wrap', imageSrc: '/mockups/bottle.svg', printZone: { centerX: 50, centerY: 56, widthPct: 36, heightPct: 40 }, tintWithColor: true },
    ],
  },
};

function resolvePhotoColorKey(
  palette: Record<string, PhotoColorAssets>,
  color: string,
): string | null {
  if (palette[color]) return color;

  const normalized = color.toLowerCase();
  const isLight = normalized === '#ffffff' || normalized === '#f5f5f5' || normalized === '#e0e0e0';
  const fallback = isLight ? '#ffffff' : '#111111';
  return palette[fallback] ? fallback : Object.keys(palette)[0] ?? null;
}

export function getMockupViews(productId: ProductId, color: string): MockupViewConfig[] | null {
  const photos = PHOTO_ASSETS[productId];
  if (photos) {
    const colorKey = resolvePhotoColorKey(photos, color);
    if (!colorKey) return null;
    const assets = photos[colorKey];
    return [
      { id: 'front', label: 'Front', imageSrc: assets.front, printZone: assets.printZones.front },
      { id: 'back', label: 'Back', imageSrc: assets.back, printZone: assets.printZones.back },
    ];
  }

  return SILHOUETTE_MOCKUPS[productId]?.views ?? null;
}

export function getMockupView(productId: ProductId, viewId: string, color: string): MockupViewConfig | null {
  const views = getMockupViews(productId, color);
  if (!views) return null;
  return views.find((view) => view.id === viewId) ?? views[0];
}
