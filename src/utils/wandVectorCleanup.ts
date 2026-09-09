/** A group often has no fill/stroke of its own — only its descendants paint. */

export type ColorMatchFn = (colorVal: unknown, hex: string, tolerance: number) => boolean;

type VectorLike = {
  type?: string;
  fill?: unknown;
  stroke?: unknown;
  dirty?: boolean;
  _objects?: VectorLike[];
  getObjects?: () => VectorLike[];
  removeWithUpdate?: (child: VectorLike) => void;
  remove?: (child: VectorLike) => void;
  set?: (key: string | Record<string, unknown>, value?: unknown) => void;
};

export function isEmptyPaint(value: unknown): boolean {
  if (value == null) return true;
  const s = typeof value === 'string' ? value : String(value);
  return s === '' || s === 'none' || s === 'transparent';
}

export function isVectorContainer(obj: VectorLike | null | undefined): boolean {
  if (!obj) return false;
  return obj.type === 'group' || obj.type === 'activeSelection' || Array.isArray(obj._objects);
}

export function vectorChildren(obj: VectorLike): VectorLike[] {
  if (Array.isArray(obj._objects)) return obj._objects;
  if (typeof obj.getObjects === 'function') return obj.getObjects() ?? [];
  return [];
}

/** True if this object or any descendant still has a visible fill or stroke. */
export function hasPaintedAppearance(obj: VectorLike | null | undefined): boolean {
  if (!obj) return false;
  if (isVectorContainer(obj)) {
    const kids = vectorChildren(obj);
    if (kids.length > 0) return kids.some(hasPaintedAppearance);
  }
  return !isEmptyPaint(obj.fill) || !isEmptyPaint(obj.stroke);
}

function removeChild(parent: VectorLike, child: VectorLike): void {
  if (typeof parent.removeWithUpdate === 'function') parent.removeWithUpdate(child);
  else if (typeof parent.remove === 'function') parent.remove(child);
  else if (Array.isArray(parent._objects)) {
    parent._objects = parent._objects.filter((item) => item !== child);
  }
}

function setProp(obj: VectorLike, key: string, value: unknown): void {
  if (typeof obj.set === 'function') obj.set(key, value);
  else (obj as Record<string, unknown>)[key] = value;
}

function stripEmptyChildren(parent: VectorLike): void {
  const kids = vectorChildren(parent);
  for (let i = kids.length - 1; i >= 0; i -= 1) {
    if (!hasPaintedAppearance(kids[i])) removeChild(parent, kids[i]);
  }
}

/** Extract: clear non-matching paint, then drop only truly empty leaves/groups. */
export function keepMatchingVectorColors(
  obj: VectorLike,
  clickedHex: string,
  tolerance: number,
  isColorMatch: ColorMatchFn,
): void {
  if (isVectorContainer(obj)) {
    for (const child of [...vectorChildren(obj)]) {
      keepMatchingVectorColors(child, clickedHex, tolerance, isColorMatch);
    }
    stripEmptyChildren(obj);
    return;
  }
  if (!isColorMatch(obj.fill, clickedHex, tolerance)) setProp(obj, 'fill', 'transparent');
  if (!isColorMatch(obj.stroke, clickedHex, tolerance)) setProp(obj, 'stroke', 'transparent');
  setProp(obj, 'dirty', true);
}

/** Erase: clear matching paint, then drop only truly empty leaves/groups. */
export function eraseMatchingVectorColors(
  obj: VectorLike,
  clickedHex: string,
  tolerance: number,
  isColorMatch: ColorMatchFn,
): void {
  if (isVectorContainer(obj)) {
    for (const child of [...vectorChildren(obj)]) {
      eraseMatchingVectorColors(child, clickedHex, tolerance, isColorMatch);
    }
    stripEmptyChildren(obj);
    return;
  }
  if (isColorMatch(obj.fill, clickedHex, tolerance)) setProp(obj, 'fill', 'transparent');
  if (isColorMatch(obj.stroke, clickedHex, tolerance)) setProp(obj, 'stroke', 'transparent');
  setProp(obj, 'dirty', true);
}
