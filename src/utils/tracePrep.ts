/** Longest edge sent to ImageTracer. Caps worker cost. */
export const TRACE_MAX_EDGE = 1000;
/** Upsample tiny logos so Bézier fitting has enough samples. Never 6×. */
export const TRACE_MIN_EDGE = 480;
export const TRACE_MAX_UPSCALE = 3;

export function colorDistance(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number,
): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

export function luminance(r: number, g: number, b: number): number {
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

export function resizeBilinear(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dstW * dstH * 4);
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

/** Separable 3-tap Gaussian ([1,2,1]/4) on RGB; alpha is copied. */
export function gaussianBlur3(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const tmp = new Uint8ClampedArray(data.length);
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const xl = Math.max(0, x - 1);
      const xr = Math.min(width - 1, x + 1);
      const il = (y * width + xl) * 4;
      const ir = (y * width + xr) * 4;
      tmp[i] = (data[il] + data[i] * 2 + data[ir]) / 4;
      tmp[i + 1] = (data[il + 1] + data[i + 1] * 2 + data[ir + 1]) / 4;
      tmp[i + 2] = (data[il + 2] + data[i + 2] * 2 + data[ir + 2]) / 4;
      tmp[i + 3] = data[i + 3];
    }
  }
  for (let y = 0; y < height; y++) {
    const yu = Math.max(0, y - 1);
    const yd = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const iu = (yu * width + x) * 4;
      const id = (yd * width + x) * 4;
      out[i] = (tmp[iu] + tmp[i] * 2 + tmp[id]) / 4;
      out[i + 1] = (tmp[iu + 1] + tmp[i + 1] * 2 + tmp[id + 1]) / 4;
      out[i + 2] = (tmp[iu + 2] + tmp[i + 2] * 2 + tmp[id + 2]) / 4;
      out[i + 3] = tmp[i + 3];
    }
  }
  return out;
}

/** Otsu threshold on opaque-pixel luminance. Returns 0–255. */
export function otsuThreshold(data: Uint8ClampedArray): number {
  const hist = new Uint32Array(256);
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 40) continue;
    hist[Math.round(luminance(data[i], data[i + 1], data[i + 2]))]++;
    total++;
  }
  if (total < 16) return 128;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let bestStart = 128;
  let bestEnd = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      bestStart = t;
      bestEnd = t;
    } else if (between === maxVar) {
      bestEnd = t;
    }
  }
  return Math.round((bestStart + bestEnd) / 2);
}

export function applyOtsuInk(data: Uint8ClampedArray): { ink: number; paper: number } {
  const t = otsuThreshold(data);
  let ink = 0;
  let paper = 0;
  for (let i = 0; i < data.length; i += 4) {
    const isPaper = data[i + 3] < 40 || luminance(data[i], data[i + 1], data[i + 2]) > t;
    if (isPaper) {
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
      paper++;
    } else {
      data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
      ink++;
    }
  }
  return { ink, paper };
}

function erodeMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const inverted = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) inverted[i] = mask[i] ? 0 : 1;
  const grown = dilateMask(inverted, width, height, radius);
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = grown[i] ? 0 : 1;
  return out;
}

/** Close 1px JPEG gaps in the ink mask. */
export function morphCloseInk(data: Uint8ClampedArray, width: number, height: number): void {
  const pixels = width * height;
  const mask = new Uint8Array(pixels);
  for (let p = 0, i = 0; p < pixels; p++, i += 4) {
    mask[p] = data[i] < 128 ? 1 : 0;
  }
  const closed = erodeMask(dilateMask(mask, width, height, 1), width, height, 1);
  for (let p = 0, i = 0; p < pixels; p++, i += 4) {
    if (closed[p]) {
      data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
    } else {
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
    }
  }
}

export function fitTraceSize(width: number, height: number): { width: number; height: number } {
  const edge = Math.max(width, height);
  let scale = 1;
  if (edge > TRACE_MAX_EDGE) scale = TRACE_MAX_EDGE / edge;
  else if (edge < TRACE_MIN_EDGE) scale = Math.min(TRACE_MAX_UPSCALE, TRACE_MIN_EDGE / edge);
  if (scale === 1) return { width, height };
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Resize → slight Gaussian blur → key-out (or Otsu) → 1px close.
 * All work is safe to run inside the tracer worker.
 */
export function prepareTraceRaster(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
): { data: Uint8ClampedArray; width: number; height: number; ink: number; paper: number } {
  const size = fitTraceSize(srcW, srcH);
  let width = srcW;
  let height = srcH;
  let data: Uint8ClampedArray;
  if (size.width !== srcW || size.height !== srcH) {
    data = resizeBilinear(src, srcW, srcH, size.width, size.height);
    width = size.width;
    height = size.height;
  } else {
    data = new Uint8ClampedArray(src);
  }

  data = gaussianBlur3(data, width, height);
  const blurred = new Uint8ClampedArray(data);

  let { ink, paper } = keyOutBackground(data, width, height);
  const inkRatio = ink / Math.max(1, ink + paper);
  if (ink === 0 || inkRatio < 0.004 || inkRatio > 0.96) {
    data.set(blurred);
    applyOtsuInk(data);
  }
  morphCloseInk(data, width, height);
  ink = 0;
  paper = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 128) ink++;
    else paper++;
  }
  if (paper === 0) {
    stampWhiteBorder(data, width, height);
    ink = 0;
    paper = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 128) ink++;
      else paper++;
    }
  }

  return { data, width, height, ink, paper };
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
