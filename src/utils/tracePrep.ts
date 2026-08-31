/** Longest edge sent to ImageTracer. Caps main-thread and worker cost. */
export const TRACE_MAX_EDGE = 1000;

export function colorDistance(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number,
): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function luminance(r: number, g: number, b: number): number {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function sampleCorner(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
): { r: number; g: number; b: number; a: number } {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let n = 0;
  for (let y = y0; y < y0 + 3 && y < height; y++) {
    for (let x = x0; x < x0 + 3 && x < width; x++) {
      const i = (y * width + x) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      a += data[i + 3];
      n++;
    }
  }
  return { r: r / n, g: g / n, b: b / n, a: a / n };
}

/** Square morphological dilate (separable max). Radius 0 returns the input. */
export function dilateMask(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  if (radius <= 0) return mask;
  const tmp = new Uint8Array(mask.length);
  const out = new Uint8Array(mask.length);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    let count = 0;
    for (let x = 0; x <= radius && x < width; x++) count += mask[row + x];
    for (let x = 0; x < width; x++) {
      tmp[row + x] = count > 0 ? 1 : 0;
      const leave = x - radius;
      const enter = x + radius + 1;
      if (leave >= 0) count -= mask[row + leave];
      if (enter < width) count += mask[row + enter];
    }
  }

  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = 0; y <= radius && y < height; y++) count += tmp[y * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = count > 0 ? 1 : 0;
      const leave = y - radius;
      const enter = y + radius + 1;
      if (leave >= 0) count -= tmp[leave * width + x];
      if (enter < height) count += tmp[enter * width + x];
    }
  }
  return out;
}

function outlineRadius(width: number, height: number): number {
  return Math.max(2, Math.min(16, Math.round(Math.min(width, height) * 0.015)));
}

/**
 * Turn a raster into white paper + black ink.
 *
 * Transparent PNGs keep alpha as paper (light artwork is not dropped).
 * Opaque images key out a uniform corner mat. On a dark mat, black outlines
 * that match the mat are recaptured by dilating the coloured ink.
 */
export function keyOutBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { ink: number; paper: number } {
  const pixels = width * height;
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 40) transparent++;
  }
  const useAlpha = transparent > pixels * 0.02;

  const corners = [
    sampleCorner(data, width, height, 0, 0),
    sampleCorner(data, width, height, Math.max(0, width - 3), 0),
    sampleCorner(data, width, height, 0, Math.max(0, height - 3)),
    sampleCorner(data, width, height, Math.max(0, width - 3), Math.max(0, height - 3)),
  ];
  const opaqueCorners = corners.filter((c) => c.a >= 40);
  const bg = opaqueCorners[0];
  const cornerAgree = bg
    ? opaqueCorners.filter((c) => colorDistance(c.r, c.g, c.b, bg.r, bg.g, bg.b) < 36).length
    : 0;
  const useCornerKey = !useAlpha && !!bg && cornerAgree >= 3;
  const darkMat = useCornerKey && luminance(bg.r, bg.g, bg.b) < 80;

  const sureInk = new Uint8Array(pixels);
  if (darkMat && bg) {
    for (let p = 0, i = 0; p < pixels; p++, i += 4) {
      const a = data[i + 3];
      if (a < 40) continue;
      if (colorDistance(data[i], data[i + 1], data[i + 2], bg.r, bg.g, bg.b) >= 48) {
        sureInk[p] = 1;
      }
    }
  }

  const inkMask = darkMat ? dilateMask(sureInk, width, height, outlineRadius(width, height)) : null;

  let ink = 0;
  let paper = 0;
  for (let p = 0, i = 0; p < pixels; p++, i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    const nearWhite = r > 242 && g > 242 && b > 242;

    let isPaper: boolean;
    if (useAlpha) {
      isPaper = a < 40;
    } else if (inkMask) {
      isPaper = inkMask[p] === 0;
    } else if (useCornerKey && bg) {
      isPaper = a < 40 || nearWhite || colorDistance(r, g, b, bg.r, bg.g, bg.b) < 48;
    } else {
      isPaper = a < 40 || nearWhite;
    }

    if (isPaper) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
      paper++;
    } else {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 255;
      ink++;
    }
  }
  return { ink, paper };
}

export function downsampleNearest(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  maxEdge: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const edge = Math.max(srcW, srcH);
  if (edge <= maxEdge) {
    return { data: src, width: srcW, height: srcH };
  }
  const dw = Math.max(1, Math.round((srcW * maxEdge) / edge));
  const dh = Math.max(1, Math.round((srcH * maxEdge) / edge));
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y * srcH) / dh));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x * srcW) / dw));
      const si = (sy * srcW + sx) * 4;
      const di = (y * dw + x) * 4;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = src[si + 3];
    }
  }
  return { data: out, width: dw, height: dh };
}

export function stampWhiteBorder(data: Uint8ClampedArray, width: number, height: number): void {
  for (let x = 0; x < width; x++) {
    const top = x * 4;
    const bottom = ((height - 1) * width + x) * 4;
    data[top] = 255; data[top + 1] = 255; data[top + 2] = 255; data[top + 3] = 255;
    data[bottom] = 255; data[bottom + 1] = 255; data[bottom + 2] = 255; data[bottom + 3] = 255;
  }
  for (let y = 0; y < height; y++) {
    const left = y * width * 4;
    const right = (y * width + (width - 1)) * 4;
    data[left] = 255; data[left + 1] = 255; data[left + 2] = 255; data[left + 3] = 255;
    data[right] = 255; data[right + 1] = 255; data[right + 2] = 255; data[right + 3] = 255;
  }
}

/** Browser-only: copy a raster onto a capped canvas so trace never 6×-upscales on the UI thread. */
export function rasterToImageData(source: CanvasImageSource, maxEdge = TRACE_MAX_EDGE): ImageData {
  const el = source as HTMLImageElement & HTMLCanvasElement;
  const nw = Number(el.naturalWidth || el.width || 0);
  const nh = Number(el.naturalHeight || el.height || 0);
  if (!nw || !nh) throw new Error('Could not read image data.');
  const edge = Math.max(nw, nh);
  const scale = edge > maxEdge ? maxEdge / edge : 1;
  const w = Math.max(1, Math.round(nw * scale));
  const h = Math.max(1, Math.round(nh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not read image data.');
  ctx.drawImage(source, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

export function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
