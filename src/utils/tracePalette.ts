/**
 * Force the inks a vinyl graphic actually uses into VTracer's palette.
 *
 * Auto-clustering often drops thin black outlines so they get absorbed into
 * the nearest fill (red letters lose their stroke; small numerals vanish).
 * We always reserve the darkest ink and the strongest chroma, then fill the
 * remaining slots from the biggest pixel buckets.
 *
 * Near-duplicate reds (AA fringe between fill and outline) are merged so the
 * tracer does not cut a second, pixel-stair outline layer.
 */

export const COLOR_TRACE_MIN_EDGE = 900;
export const COLOR_TRACE_MAX_EDGE = 1400;
export const COLOR_TRACE_MAX_UPSCALE = 2;

export interface PreparedColorTrace {
  rgba: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  palette: string[];
}

function lumaOf(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'))
    .join('')}`;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function chromaOf(r: number, g: number, b: number): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function hueDeg(r: number, g: number, b: number): number | null {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const c = max - min;
  if (c < 8) return null;
  let h: number;
  if (max === r) h = ((g - b) / c) % 6;
  else if (max === g) h = (b - r) / c + 2;
  else h = (r - g) / c + 4;
  return ((h * 60) + 360) % 360;
}

function samePaint(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
): boolean {
  const ca = chromaOf(a.r, a.g, a.b);
  const cb = chromaOf(b.r, b.g, b.b);
  if (ca >= 24 && cb >= 24) {
    const ha = hueDeg(a.r, a.g, a.b);
    const hb = hueDeg(b.r, b.g, b.b);
    if (ha != null && hb != null) {
      let dh = Math.abs(ha - hb);
      if (dh > 180) dh = 360 - dh;
      if (dh < 22) return true;
    }
  }
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) < 48;
}

export function extractInkPalette(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  maxColors: number,
): string[] {
  const target = Math.max(2, Math.min(32, Math.round(maxColors) || 8));
  const counts = new Map<number, { count: number; r: number; g: number; b: number }>();
  const n = width * height;

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const a = data[o + 3] ?? 255;
    if (a < 28) continue;
    const r = data[o] ?? 0;
    const g = data[o + 1] ?? 0;
    const b = data[o + 2] ?? 0;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const prev = counts.get(key);
    if (prev) {
      prev.count += 1;
      prev.r += r;
      prev.g += g;
      prev.b += b;
    } else {
      counts.set(key, { count: 1, r, g, b });
    }
  }

  const buckets = [...counts.values()]
    .map((bucket) => {
      const r = Math.round(bucket.r / bucket.count);
      const g = Math.round(bucket.g / bucket.count);
      const b = Math.round(bucket.b / bucket.count);
      const lum = lumaOf(r, g, b);
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      return { r, g, b, count: bucket.count, lum, sat: maxC - minC };
    })
    .sort((a, b) => b.count - a.count);

  if (buckets.length === 0) return ['#000000', '#ffffff'];

  const picked: typeof buckets = [];
  const tooClose = (c: (typeof buckets)[0]) =>
    picked.some((p) => {
      const inkBlack = p.r === 0 && p.g === 0 && p.b === 0;
      if (inkBlack && c.lum < 62 && c.r > c.g + 16 && c.r > c.b + 16) return true;
      if (inkBlack && c.lum < 55) return true;
      return samePaint(p, c);
    });

  const darkest = [...buckets].sort((a, b) => a.lum - b.lum || b.count - a.count)[0];
  if (darkest) {
    picked.push(darkest.lum < 55 ? { ...darkest, r: 0, g: 0, b: 0, lum: 0 } : darkest);
  }

  const chroma = [...buckets].sort((a, b) => b.sat - a.sat || b.count - a.count)[0];
  if (chroma && !tooClose(chroma)) picked.push(chroma);

  for (const c of buckets) {
    if (picked.length >= target) break;
    if (!tooClose(c)) picked.push(c);
  }

  return mergeInkPalette(picked.slice(0, target).map((c) => toHex(c.r, c.g, c.b)));
}

export function mergeInkPalette(palette: string[]): string[] {
  const merged: { r: number; g: number; b: number }[] = [];
  for (const hex of palette) {
    const c = parseHex(hex);
    const lum = lumaOf(c.r, c.g, c.b);
    const hit = merged.findIndex((p) => {
      const pl = lumaOf(p.r, p.g, p.b);
      const darkPair = lum < 55 && pl < 55;
      return darkPair || samePaint(p, c);
    });
    if (hit < 0) {
      merged.push(lum < 40 ? { r: 0, g: 0, b: 0 } : c);
      continue;
    }
    const prev = merged[hit];
    const prevLum = lumaOf(prev.r, prev.g, prev.b);
    if (lum < 16) merged[hit] = { r: 0, g: 0, b: 0 };
    else if (prevLum < 16) merged[hit] = prev;
    else if (
      Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)
      > Math.max(prev.r, prev.g, prev.b) - Math.min(prev.r, prev.g, prev.b)
    ) {
      merged[hit] = c;
    }
  }
  const hexes = merged.map((c) => toHex(c.r, c.g, c.b));
  return hexes.length >= 2 ? hexes : ['#000000', '#ffffff'];
}

export function fitColorTraceSize(width: number, height: number): { width: number; height: number; scale: number } {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const edge = Math.max(w, h);
  let scale = 1;
  if (edge < COLOR_TRACE_MIN_EDGE) {
    scale = Math.min(COLOR_TRACE_MAX_UPSCALE, COLOR_TRACE_MIN_EDGE / edge);
  } else if (edge > COLOR_TRACE_MAX_EDGE) {
    scale = COLOR_TRACE_MAX_EDGE / edge;
  }
  if (Math.abs(scale - 1) < 0.02) return { width: w, height: h, scale: 1 };
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scale,
  };
}

export function resizeBilinearRgba(
  src: Uint8Array | Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8Array {
  const out = new Uint8Array(dstW * dstH * 4);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;
  for (let y = 0; y < dstH; y++) {
    const sy = (y + 0.5) * yRatio - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(srcH - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < dstW; x++) {
      const sx = (x + 0.5) * xRatio - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(srcW - 1, x0 + 1);
      const fx = sx - x0;
      const di = (y * dstW + x) * 4;
      for (let c = 0; c < 4; c++) {
        const v00 = src[(y0 * srcW + x0) * 4 + c];
        const v10 = src[(y0 * srcW + x1) * 4 + c];
        const v01 = src[(y1 * srcW + x0) * 4 + c];
        const v11 = src[(y1 * srcW + x1) * 4 + c];
        const v0 = v00 + (v10 - v00) * fx;
        const v1 = v01 + (v11 - v01) * fx;
        out[di + c] = v0 + (v1 - v0) * fy;
      }
    }
  }
  return out;
}

function dilateMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let on = 0;
      for (let dy = -1; dy <= 1 && !on; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          if (mask[yy * width + xx]) on = 1;
        }
      }
      out[y * width + x] = on;
    }
  }
  return out;
}

function erodeMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  const inverted = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) inverted[i] = mask[i] ? 0 : 1;
  const grown = dilateMask(inverted, width, height);
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = grown[i] ? 0 : 1;
  return out;
}

function morphCloseDarkInk(
  data: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const n = width * height;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    mask[i] = lumaOf(data[o] ?? 0, data[o + 1] ?? 0, data[o + 2] ?? 0) < 40 ? 1 : 0;
  }
  const closed = erodeMask(dilateMask(mask, width, height), width, height);
  for (let i = 0; i < n; i++) {
    if (closed[i] && !mask[i]) {
      const o = i * 4;
      data[o] = 0;
      data[o + 1] = 0;
      data[o + 2] = 0;
      data[o + 3] = 255;
    }
  }
  return data;
}

export function snapRgbaToPalette(
  src: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  palette: string[],
): Uint8Array {
  const colors = palette.map(parseHex);
  const out = new Uint8Array(src.length);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    if ((src[o + 3] ?? 255) < 28) {
      out[o + 3] = 0;
      continue;
    }
    let best = 0;
    let bestD = Infinity;
    for (let c = 0; c < colors.length; c++) {
      const { r, g, b } = colors[c];
      const d = (src[o] - r) ** 2 + (src[o + 1] - g) ** 2 + (src[o + 2] - b) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    out[o] = colors[best].r;
    out[o + 1] = colors[best].g;
    out[o + 2] = colors[best].b;
    out[o + 3] = 255;
  }
  return out;
}

export function prepareColorTraceRgba(
  rgba: Uint8Array | Uint8ClampedArray | ArrayLike<number>,
  width: number,
  height: number,
  params: { maxColors?: number; palette?: string[] } = {},
): PreparedColorTrace {
  const w0 = Math.max(1, Number(width) || 1);
  const h0 = Math.max(1, Number(height) || 1);
  const pixels = rgba instanceof Uint8Array || rgba instanceof Uint8ClampedArray
    ? rgba
    : new Uint8Array(rgba);
  const maxColors = Math.max(2, Math.min(32, Number(params.maxColors) || 4));
  const palette = params.palette
    ? mergeInkPalette(params.palette)
    : extractInkPalette(pixels, w0, h0, maxColors);
  const size = fitColorTraceSize(w0, h0);
  let data: Uint8Array | Uint8ClampedArray = pixels;
  let w = w0;
  let h = h0;
  if (size.width !== w0 || size.height !== h0) {
    data = resizeBilinearRgba(pixels, w0, h0, size.width, size.height);
    w = size.width;
    h = size.height;
  }
  data = snapRgbaToPalette(data, w, h, palette);
  data = morphCloseDarkInk(data, w, h);
  return { rgba: data, width: w, height: h, palette };
}
