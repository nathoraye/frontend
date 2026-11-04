export interface Department {
  id: string;
  name: string;
  subhead: string;
  tagline: string;
  handle: string;
  accentColor: string;
  badgeTag: string;
  features: string[];
}

export const DEPARTMENTS: Department[] = [
  {
    id: 'custom',
    name: 'West Vinyl',
    subhead: 'Custom',
    tagline: 'STICK IT. STYLE IT. MAKE IT YOURS.',
    handle: 'west-vinyl-custom',
    accentColor: '#00D2FF',
    badgeTag: 'dept:custom',
    features: ['Vehicle & Boat Decals', 'Business Signage', 'Custom Stickers', 'Workwear & Apparel', 'Personalised Products'],
  },
  {
    id: 'crafts',
    name: 'West Made',
    subhead: 'Crafts',
    tagline: 'HANDMADE WITH HEART.',
    handle: 'west-made-crafts',
    accentColor: '#FF2E93',
    badgeTag: 'dept:crafts',
    features: ['Personalised Gifts', 'Handmade Creations', 'Small-Batch Products', 'Seasonal Decorations', 'Custom Designed Pieces'],
  },
  {
    id: 'collectables',
    name: 'West Finds',
    subhead: 'Collectables',
    tagline: 'DISCOVER. COLLECT. RELIVE.',
    handle: 'west-finds-collectables',
    accentColor: '#FFB800',
    badgeTag: 'dept:finds',
    features: ['Vintage Collectibles', 'Secondhand Treasures', 'Retro Toys', 'Unique Household Finds', 'Curated Resale Products'],
  },
];
