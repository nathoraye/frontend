/**
 * Product catalog for apparel ordering and flat mockup previews.
 */

export type ProductId =
  | 'tshirt'
  | 'hoodie'
  | 'sloppyJoe'
  | 'babyClothes'
  | 'clock'
  | 'drinkBottle';

export interface ProductView {
  id: string;
  label: string;
}

export interface ProductDef {
  id: ProductId;
  label: string;
  colorOptions: string[];
  views: ProductView[];
}

const APPAREL_VIEWS: ProductView[] = [
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
];

export const PRODUCT_CATALOG: Record<ProductId, ProductDef> = {
  tshirt: {
    id: 'tshirt',
    label: 'T-Shirt',
    colorOptions: ['#ffffff', '#111111'],
    views: APPAREL_VIEWS,
  },
  hoodie: {
    id: 'hoodie',
    label: 'Jumper / Hoodie',
    colorOptions: ['#ffffff', '#111111'],
    views: APPAREL_VIEWS,
  },
  sloppyJoe: {
    id: 'sloppyJoe',
    label: 'Sloppy Joe',
    colorOptions: ['#ffffff', '#111111'],
    views: APPAREL_VIEWS,
  },
  babyClothes: {
    id: 'babyClothes',
    label: 'Baby Clothes',
    colorOptions: ['#ffe0e9', '#dceeff', '#fff6cc', '#ffffff'],
    views: APPAREL_VIEWS,
  },
  clock: {
    id: 'clock',
    label: 'Wall Clock',
    colorOptions: ['#f5f5f5', '#212121', '#8d6e63'],
    views: [{ id: 'front', label: 'Face' }],
  },
  drinkBottle: {
    id: 'drinkBottle',
    label: 'Drink Bottle',
    colorOptions: ['#90a4ae', '#00bcd4', '#ffffff', '#212121'],
    views: [{ id: 'front', label: 'Wrap' }],
  },
};

export const PRODUCT_IDS = Object.keys(PRODUCT_CATALOG) as ProductId[];
