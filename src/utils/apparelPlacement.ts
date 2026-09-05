export interface ProductPlacement {
  posX: number;
  posY: number;
  scale: number;
  rotationDeg: number;
}

/** Offset from the print-zone centre, in % of the garment frame. */
export const PLACEMENT_POS_RANGE = 42;
export const PLACEMENT_SCALE_MIN = 0.15;
export const PLACEMENT_SCALE_MAX = 5;

export function clampPlacement(next: ProductPlacement): ProductPlacement {
  return {
    posX: Math.max(-PLACEMENT_POS_RANGE, Math.min(PLACEMENT_POS_RANGE, next.posX)),
    posY: Math.max(-PLACEMENT_POS_RANGE, Math.min(PLACEMENT_POS_RANGE, next.posY)),
    scale: Math.max(PLACEMENT_SCALE_MIN, Math.min(PLACEMENT_SCALE_MAX, next.scale)),
    rotationDeg: next.rotationDeg,
  };
}
