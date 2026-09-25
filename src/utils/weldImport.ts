import { isFullFrameShape, normalizeFill } from './traceFills.ts';

export type WeldImportShape = {
  id?: string;
  type?: string;
  fill?: unknown;
  stroke?: unknown;
  strokeWidth?: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  left?: number;
  top?: number;
  originX?: string | number;
  originY?: string | number;
};

export interface WeldImportFrame {
  width: number;
  height: number;
}

export interface ShapeBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Distant dust smaller than this fraction of the largest piece is dropped. */
export const WELD_SPECK_AREA_RATIO = 0.015;
/** Keep drips within this padding of the main artwork (ratio of the main size). */
export const WELD_SPECK_PAD_RATIO = 0.1;
export const WELD_SPECK_PAD_MIN = 12;

function isInvisiblePaint(value: unknown): boolean {
  const n = normalizeFill(value);
  if (n === '' || n === 'transparent' || n === 'none') return true;
  // Fabric serializes clear fills as rgba(0,0,0,0) — still leftover paper.
  if (/^rgba\(\d+,\d+,\d+,0(?:\.0+)?\)$/.test(n)) return true;
  if (/^hsla?\([^)]+,0(?:\.0+)?\)$/.test(n)) return true;
  return false;
}

function originOffset(origin: string | number | undefined, size: number): number {
  if (origin === 'center' || origin === 0.5) return size / 2;
  if (origin === 'right' || origin === 'bottom' || origin === 1) return size;
  return 0;
}

export function shapeBBox(obj: WeldImportShape): ShapeBBox | null {
  const width = Math.abs((obj.width || 0) * (obj.scaleX || 1));
  const height = Math.abs((obj.height || 0) * (obj.scaleY || 1));
  if (width <= 0 && height <= 0) return null;
  const left = obj.left ?? 0;
  const top = obj.top ?? 0;
  const minX = left - originOffset(obj.originX, width);
  const minY = top - originOffset(obj.originY, height);
  return { minX, minY, maxX: minX + width, maxY: minY + height };
}

function bboxArea(box: ShapeBBox): number {
  return Math.max(0, box.maxX - box.minX) * Math.max(0, box.maxY - box.minY);
}

function bboxOverlap(a: ShapeBBox, b: ShapeBBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function unionBoxes(boxes: ShapeBBox[]): ShapeBBox | null {
  if (!boxes.length) return null;
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

/**
 * Fabric's canvas.toSVG() writes a background rect of width/height "100%"
 * when backgroundColor is the string "transparent". On re-import, percent
 * units often become 100×100 squares at the SVG origin. Those leftover
 * rects expand the weld group (objects look like they jumped) and Add
 * Outline paints them as extra pink boxes at the top-left of the selection.
 */
export function isPhantomWeldRect(obj: WeldImportShape, frame?: WeldImportFrame): boolean {
  const type = String(obj.type || '').toLowerCase();
  if (obj.id === 'workspace') return true;
  if (type !== 'rect') return false;

  // White/paper fills are real cut shapes unless they cover the whole SVG frame.
  // Only treat empty / none / transparent paint as leftover export junk.
  const invisibleFill = isInvisiblePaint(obj.fill);
  const strokeWidth = Number(obj.strokeWidth) || 0;
  const invisibleStroke = isInvisiblePaint(obj.stroke) || strokeWidth <= 0;
  if (invisibleFill && invisibleStroke) return true;

  if (frame && isFullFrameShape(obj, frame.width, frame.height)) return true;

  const width = Math.abs((obj.width || 0) * (obj.scaleX || 1));
  const height = Math.abs((obj.height || 0) * (obj.scaleY || 1));
  const left = obj.left ?? 0;
  const top = obj.top ?? 0;
  // Percent 100% parses as 100×100. Fabric's default center origin then
  // places that square at left/top ≈ 50, not 0.
  const looksLikePercentParsedAsHundred =
    width >= 99 &&
    width <= 101 &&
    height >= 99 &&
    height <= 101 &&
    left >= -1 &&
    left <= 51 &&
    top >= -1 &&
    top <= 51;
  return looksLikePercentParsedAsHundred && invisibleFill;
}

export function filterWeldImportedObjects<T extends WeldImportShape>(
  objects: T[],
  frame?: WeldImportFrame,
): T[] {
  return objects.filter((obj) => !!obj && !isPhantomWeldRect(obj, frame));
}

/**
 * Trace/weld dust far from the main cut expands the selection box (artwork
 * sits in a corner of a huge frame). Keep nearby drips; drop tiny outliers.
 */
export function dropDistantSpecks<T extends WeldImportShape>(objects: T[]): T[] {
  if (objects.length < 2) return objects;
  const boxes = objects.map(shapeBBox);
  const areas = boxes.map((box) => (box ? bboxArea(box) : 0));
  const maxArea = Math.max(...areas);
  if (maxArea <= 0) return objects;

  const mainBoxes = boxes.filter((box, i) => box && areas[i] >= maxArea * WELD_SPECK_AREA_RATIO) as ShapeBBox[];
  const main = unionBoxes(mainBoxes);
  if (!main) return objects;

  const padX = Math.max(WELD_SPECK_PAD_MIN, (main.maxX - main.minX) * WELD_SPECK_PAD_RATIO);
  const padY = Math.max(WELD_SPECK_PAD_MIN, (main.maxY - main.minY) * WELD_SPECK_PAD_RATIO);
  const padded: ShapeBBox = {
    minX: main.minX - padX,
    minY: main.minY - padY,
    maxX: main.maxX + padX,
    maxY: main.maxY + padY,
  };

  return objects.filter((_, i) => {
    if (areas[i] >= maxArea * WELD_SPECK_AREA_RATIO) return true;
    const box = boxes[i];
    return !!box && bboxOverlap(padded, box);
  });
}

export function flattenWeldObjects<T extends WeldImportShape>(objects: T[]): T[] {
  const out: T[] = [];
  for (const obj of objects) {
    if (!obj) continue;
    const type = String(obj.type || '').toLowerCase();
    const group = obj as T & { getObjects?: () => unknown[] };
    if ((type === 'group' || type === 'activeselection') && typeof group.getObjects === 'function') {
      const kids = flattenWeldObjects((group.getObjects() as T[]) || []);
      if (kids.length) {
        out.push(...kids);
        continue;
      }
    }
    out.push(obj);
  }
  return out;
}

export function keepWeldArtwork<T extends WeldImportShape>(
  objects: T[],
  frame?: WeldImportFrame,
): T[] {
  return dropDistantSpecks(filterWeldImportedObjects(flattenWeldObjects(objects), frame));
}

type GroupLike = WeldImportShape & {
  getObjects?: () => unknown[];
  remove?: (...objects: unknown[]) => unknown;
  triggerLayout?: () => void;
  setCoords?: () => void;
  setDimensions?: () => void;
};

function relayoutGroup(group: GroupLike): void {
  // Paths keep stale width/height after children are removed; refresh from geometry.
  const refresh = (obj: GroupLike) => {
    obj.setDimensions?.();
    const kids = obj.getObjects?.() ?? [];
    for (const child of kids) refresh(child as GroupLike);
  };
  refresh(group);
  group.triggerLayout?.();
  group.setCoords?.();
}

/**
 * Remove leftover weld-export rects from an already-grouped object so Add
 * Outline cannot paint them as extra boxes at the selection top-left.
 */
export function stripPhantomWeldChildren(obj: unknown): number {
  const group = obj as GroupLike | null;
  const type = String(group?.type || '').toLowerCase();
  if (!group || (type !== 'group' && type !== 'activeselection')) return 0;
  const children = group.getObjects?.() ?? [];
  let removed = 0;
  for (const child of [...children]) {
    removed += stripPhantomWeldChildren(child);
    if (isPhantomWeldRect(child as WeldImportShape) && group.remove) {
      group.remove(child);
      removed += 1;
    }
  }
  return removed;
}

/**
 * Drop distant specks / leftover paper inside a live group and fit the
 * selection box to the remaining artwork.
 */
export function tightPackWeldObject(obj: unknown): number {
  const removedPhantoms = stripPhantomWeldChildren(obj);
  const group = obj as GroupLike | null;
  const type = String(group?.type || '').toLowerCase();
  if (!group || (type !== 'group' && type !== 'activeselection')) {
    if (removedPhantoms) relayoutGroup(group as GroupLike);
    return removedPhantoms;
  }
  const children = (group.getObjects?.() ?? []) as WeldImportShape[];
  const kept = new Set(dropDistantSpecks(children));
  let removedSpecks = 0;
  for (const child of [...children]) {
    if (!kept.has(child) && group.remove) {
      group.remove(child);
      removedSpecks += 1;
    }
  }
  relayoutGroup(group);
  return removedPhantoms + removedSpecks;
}
