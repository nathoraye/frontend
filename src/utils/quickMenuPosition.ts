/**
 * Positions the selection quick-action bar so it does not cover Fabric's
 * rotate handle (`mtr`). Phone tools use a 36px touch target sitting 40px
 * above the object; the old "bounding-box top − 90" math landed the bar on
 * that handle.
 */

export const TOUCH_CORNER_SIZE = 36;
/** Fabric's default `controls.mtr.offsetY`. */
export const FABRIC_ROTATE_HANDLE_OFFSET_Y = 40;
export const QUICK_MENU_GAP = 12;
export const QUICK_MENU_EDGE_PAD = 8;
export const DEFAULT_QUICK_MENU_WIDTH = 240;
export const DEFAULT_QUICK_MENU_HEIGHT = 56;

export type Point = { x: number; y: number };
export type Rect = { left: number; top: number; width: number; height: number };
export type Size = { width: number; height: number };
export type Viewport = { width: number; height: number };
export type Placement = 'above' | 'below' | 'side';

export type SelectionScreen = {
  box: Rect;
  rotateHandle: Point;
  bottomHandle?: Point;
};

export type FabricObjectLike = {
  setCoords?: () => void;
  oCoords?: Partial<Record<'mtr' | 'mb' | 'tl' | 'tr' | 'bl' | 'br', Point>>;
};

type Bounds = { left: number; top: number; right: number; bottom: number };

export function rectsOverlap(a: Bounds, b: Bounds): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function aabbFromCorners(corners: Point[]): Rect {
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

function isPoint(p: Point | undefined): p is Point {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

/** Read canvas-pixel handle coords from a Fabric object (`oCoords` after `setCoords`). */
export function selectionFromFabricObject(obj: FabricObjectLike): SelectionScreen | null {
  obj.setCoords?.();
  const c = obj.oCoords;
  if (!c) return null;
  const corners = [c.tl, c.tr, c.br, c.bl].filter(isPoint);
  if (corners.length < 2) return null;
  const box = aabbFromCorners(corners);
  const rotateHandle = isPoint(c.mtr)
    ? { x: c.mtr.x, y: c.mtr.y }
    : { x: box.left + box.width / 2, y: box.top - FABRIC_ROTATE_HANDLE_OFFSET_Y };
  return {
    box,
    rotateHandle,
    bottomHandle: isPoint(c.mb) ? { x: c.mb.x, y: c.mb.y } : undefined,
  };
}

export function placeQuickMenu(
  selection: SelectionScreen,
  viewport: Viewport,
  menu: Size = { width: DEFAULT_QUICK_MENU_WIDTH, height: DEFAULT_QUICK_MENU_HEIGHT },
  opts: { touchCornerSize?: number; gap?: number; edgePad?: number } = {},
): { top: number; left: number; placement: Placement } {
  const radius = (opts.touchCornerSize ?? TOUCH_CORNER_SIZE) / 2;
  const gap = opts.gap ?? QUICK_MENU_GAP;
  const pad = opts.edgePad ?? QUICK_MENU_EDGE_PAD;
  const mw = Math.max(1, menu.width);
  const mh = Math.max(1, menu.height);
  const vw = Math.max(1, viewport.width);
  const vh = Math.max(1, viewport.height);
  const { box, rotateHandle: rotate } = selection;

  const clampLeft = (x: number) => {
    const min = pad + mw / 2;
    const max = vw - pad - mw / 2;
    if (!(max >= min)) return vw / 2;
    return Math.min(max, Math.max(min, x));
  };

  const clampTop = (y: number) => {
    const max = vh - pad - mh;
    if (!(max >= pad)) return pad;
    return Math.min(max, Math.max(pad, y));
  };

  const menuBounds = (top: number, left: number): Bounds => ({
    left: left - mw / 2,
    top,
    right: left + mw / 2,
    bottom: top + mh,
  });

  const handleBounds: Bounds = {
    left: rotate.x - radius - gap,
    top: rotate.y - radius - gap,
    right: rotate.x + radius + gap,
    bottom: rotate.y + radius + gap,
  };

  const overlapsHandle = (top: number, left: number) =>
    rectsOverlap(menuBounds(top, left), handleBounds);

  const inViewport = (top: number, left: number) => {
    const r = menuBounds(top, left);
    return r.top >= pad - 0.5 && r.bottom <= vh - pad + 0.5
      && r.left >= pad - 0.5 && r.right <= vw - pad + 0.5;
  };

  const bottomY = Math.max(box.top + box.height, selection.bottomHandle?.y ?? -Infinity);
  const sideTop = clampTop(box.top + box.height / 2 - mh / 2);

  const candidates: { top: number; left: number; placement: Placement }[] = [
    {
      top: rotate.y - radius - gap - mh,
      left: clampLeft(rotate.x),
      placement: 'above',
    },
    {
      top: bottomY + radius + gap,
      left: clampLeft(box.left + box.width / 2),
      placement: 'below',
    },
    {
      top: sideTop,
      left: clampLeft(box.left + box.width + radius + gap + mw / 2),
      placement: 'side',
    },
    {
      top: sideTop,
      left: clampLeft(box.left - radius - gap - mw / 2),
      placement: 'side',
    },
  ];

  const fitted = candidates.find((c) => inViewport(c.top, c.left) && !overlapsHandle(c.top, c.left));
  if (fitted) return fitted;

  const clear = candidates.find((c) => !overlapsHandle(c.top, c.left));
  if (clear) return { ...clear, left: clampLeft(clear.left) };

  const fallback = candidates[0];
  return { top: fallback.top, left: clampLeft(fallback.left), placement: 'above' };
}
