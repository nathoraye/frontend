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
};

export interface WeldImportFrame {
  width: number;
  height: number;
}

function isInvisiblePaint(value: unknown): boolean {
  const n = normalizeFill(value);
  return n === '' || n === 'transparent' || n === 'none';
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
  const looksLikePercentParsedAsHundred =
    width >= 99 && width <= 101 && height >= 99 && height <= 101 && left <= 1 && top <= 1;
  return looksLikePercentParsedAsHundred && invisibleFill;
}

export function filterWeldImportedObjects<T extends WeldImportShape>(
  objects: T[],
  frame?: WeldImportFrame,
): T[] {
  return objects.filter((obj) => !!obj && !isPhantomWeldRect(obj, frame));
}

type GroupLike = WeldImportShape & {
  getObjects?: () => unknown[];
  remove?: (...objects: unknown[]) => unknown;
};

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
