/**
 * Placeholder 3D product catalog.
 * Geometry is procedural (box/cylinder) until real GLB models are sourced -
 * swap `geometry`/`dimensions` per product once real assets are available.
 */

export type ProductId =
  | 'tshirt'
  | 'hoodie'
  | 'sloppyJoe'
  | 'babyClothes'
  | 'clock'
  | 'drinkBottle';

export type ProductGeometry = 'box' | 'cylinder';

export interface DecalAnchor {
  /** Local-space position on the placeholder mesh surface. */
  position: [number, number, number];
  /** Local-space rotation (radians) so the decal faces outward. */
  rotation: [number, number, number];
  /** Base decal size in local units, before user scale is applied. */
  size: [number, number, number];
}

export interface ProductView {
  id: string;
  label: string;
}

export interface ProductDef {
  id: ProductId;
  label: string;
  geometry: ProductGeometry;
  /** box: [width, height, depth]; cylinder: [radiusTop, radiusBottom, height] */
  dimensions: [number, number, number];
  colorOptions: string[];
  views: ProductView[];
  decalAnchors: Record<string, DecalAnchor>;
}

const APPAREL_VIEWS: ProductView[] = [
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'left-arm', label: 'Left Sleeve' },
  { id: 'right-arm', label: 'Right Sleeve' },
];

const APPAREL_ANCHORS: Record<string, DecalAnchor> = {
  front: { position: [0, 0.1, 0.51], rotation: [0, 0, 0], size: [0.9, 0.9, 1] },
  back: { position: [0, 0.1, -0.51], rotation: [0, Math.PI, 0], size: [0.9, 0.9, 1] },
  'left-arm': { position: [-0.85, 0.3, 0], rotation: [0, -Math.PI / 2, 0], size: [0.35, 0.35, 1] },
  'right-arm': { position: [0.85, 0.3, 0], rotation: [0, Math.PI / 2, 0], size: [0.35, 0.35, 1] },
};

export const PRODUCT_CATALOG: Record<ProductId, ProductDef> = {
  tshirt: {
    id: 'tshirt',
    label: 'T-Shirt',
    geometry: 'box',
    dimensions: [1.6, 2, 1],
    colorOptions: ['#111111', '#ffffff', '#1d3557', '#c62828'],
    views: APPAREL_VIEWS,
    decalAnchors: APPAREL_ANCHORS,
  },
  hoodie: {
    id: 'hoodie',
    label: 'Jumper / Hoodie',
    geometry: 'box',
    dimensions: [1.8, 2.2, 1.1],
    colorOptions: ['#111111', '#607d8b', '#37474f', '#8d6e63'],
    views: APPAREL_VIEWS,
    decalAnchors: APPAREL_ANCHORS,
  },
  sloppyJoe: {
    id: 'sloppyJoe',
    label: 'Sloppy Joe',
    geometry: 'box',
    dimensions: [1.9, 2.1, 1.1],
    colorOptions: ['#e0e0e0', '#455a64', '#6d4c41', '#263238'],
    views: APPAREL_VIEWS,
    decalAnchors: APPAREL_ANCHORS,
  },
  babyClothes: {
    id: 'babyClothes',
    label: 'Baby Clothes',
    geometry: 'box',
    dimensions: [1, 1.3, 0.7],
    colorOptions: ['#ffe0e9', '#dceeff', '#fff6cc', '#ffffff'],
    views: [
      { id: 'front', label: 'Front' },
      { id: 'back', label: 'Back' },
    ],
    decalAnchors: {
      front: { position: [0, 0.05, 0.36], rotation: [0, 0, 0], size: [0.6, 0.6, 1] },
      back: { position: [0, 0.05, -0.36], rotation: [0, Math.PI, 0], size: [0.6, 0.6, 1] },
    },
  },
  clock: {
    id: 'clock',
    label: 'Wall Clock',
    geometry: 'cylinder',
    dimensions: [1, 1, 0.15],
    colorOptions: ['#f5f5f5', '#212121', '#8d6e63'],
    views: [{ id: 'front', label: 'Face' }],
    decalAnchors: {
      front: { position: [0, 0, 0.08], rotation: [0, 0, 0], size: [1.6, 1.6, 1] },
    },
  },
  drinkBottle: {
    id: 'drinkBottle',
    label: 'Drink Bottle',
    geometry: 'cylinder',
    dimensions: [0.55, 0.55, 2],
    colorOptions: ['#90a4ae', '#00bcd4', '#ffffff', '#212121'],
    views: [{ id: 'front', label: 'Wrap' }],
    decalAnchors: {
      front: { position: [0, 0.05, 0.56], rotation: [0, 0, 0], size: [0.85, 1.3, 1] },
    },
  },
};

export const PRODUCT_IDS = Object.keys(PRODUCT_CATALOG) as ProductId[];
