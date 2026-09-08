/** Client coordinates from mouse, pointer, or touch events. */
export type ClientPoint = { x: number; y: number };

type TouchLike = { clientX?: number; clientY?: number };
type EventLike = {
  clientX?: number;
  clientY?: number;
  touches?: ArrayLike<TouchLike>;
  changedTouches?: ArrayLike<TouchLike>;
};

function fromTouchList(list: ArrayLike<TouchLike> | undefined): ClientPoint | null {
  if (!list || list.length === 0) return null;
  const t = list[0];
  if (typeof t?.clientX === 'number' && typeof t?.clientY === 'number') {
    return { x: t.clientX, y: t.clientY };
  }
  return null;
}

/**
 * Fabric's `mouse:*` handlers receive a TouchEvent on phones when
 * `enablePointerEvents` is off. TouchEvent has no `clientX`/`clientY` —
 * those live on `touches[0]` / `changedTouches[0]`.
 */
export function getClientPoint(event: unknown): ClientPoint | null {
  if (!event || typeof event !== 'object') return null;
  const ev = event as EventLike;
  if (typeof ev.clientX === 'number' && typeof ev.clientY === 'number') {
    return { x: ev.clientX, y: ev.clientY };
  }
  return fromTouchList(ev.touches) ?? fromTouchList(ev.changedTouches);
}

/** Map a client (viewport) point onto a canvas element's backing-store pixels. */
export function canvasPixelFromClient(
  el: { width: number; height: number; getBoundingClientRect: () => DOMRect },
  clientX: number,
  clientY: number,
): ClientPoint {
  const rect = el.getBoundingClientRect();
  const scaleX = rect.width > 0 ? el.width / rect.width : 1;
  const scaleY = rect.height > 0 ? el.height / rect.height : 1;
  return {
    x: Math.floor((clientX - rect.left) * scaleX),
    y: Math.floor((clientY - rect.top) * scaleY),
  };
}

/**
 * Read an opaque pixel at (x, y), then search a small ring so a fat finger
 * that lands just off a colour still samples the intended paint.
 */
export function sampleOpaquePixel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius = 10,
): { r: number; g: number; b: number; a: number; x: number; y: number } | null {
  const { width, height } = ctx.canvas;
  const read = (px: number, py: number) => {
    if (px < 0 || py < 0 || px >= width || py >= height) return null;
    const data = ctx.getImageData(px, py, 1, 1).data;
    if (data[3] <= 0) return null;
    return { r: data[0], g: data[1], b: data[2], a: data[3], x: px, y: py };
  };

  const center = read(x, y);
  if (center) return center;

  for (let r = 1; r <= radius; r += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      const top = read(x + dx, y - r);
      if (top) return top;
      const bottom = read(x + dx, y + r);
      if (bottom) return bottom;
    }
    for (let dy = -r + 1; dy <= r - 1; dy += 1) {
      const left = read(x - r, y + dy);
      if (left) return left;
      const right = read(x + r, y + dy);
      if (right) return right;
    }
  }
  return null;
}

export function midpoint(a: ClientPoint, b: ClientPoint): ClientPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function distance(a: ClientPoint, b: ClientPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
