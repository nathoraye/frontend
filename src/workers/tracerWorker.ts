import ImageTracer from 'imagetracerjs';

self.onmessage = function(e: MessageEvent) {
  try {
    const imageData: ImageData = e.data.imageData;
    const traceOptions = e.data.traceOptions || {};

    const src = imageData.data;
    const out = new Uint8ClampedArray(src.length);
    let hasForeground = false;
    let hasBackground = false;

    // Enforce a strict binary map: transparent/near-white => white background, all else => black art.
    for (let i = 0; i < src.length; i += 4) {
      const r = src[i];
      const g = src[i + 1];
      const b = src[i + 2];
      const a = src[i + 3];
      const isBackground = a < 16 || (r > 245 && g > 245 && b > 245);

      if (isBackground) {
        out[i] = 255;
        out[i + 1] = 255;
        out[i + 2] = 255;
        out[i + 3] = 255;
        hasBackground = true;
      } else {
        out[i] = 0;
        out[i + 1] = 0;
        out[i + 2] = 0;
        out[i + 3] = 255;
        hasForeground = true;
      }
    }

    if (!hasForeground) {
      throw new Error('No visible artwork pixels found for trace.');
    }

    // Guard against full-canvas black fills by forcing an explicit white border when needed.
    if (!hasBackground) {
      const w = imageData.width;
      const h = imageData.height;
      for (let x = 0; x < w; x++) {
        const top = x * 4;
        const bottom = ((h - 1) * w + x) * 4;
        out[top] = 255; out[top + 1] = 255; out[top + 2] = 255; out[top + 3] = 255;
        out[bottom] = 255; out[bottom + 1] = 255; out[bottom + 2] = 255; out[bottom + 3] = 255;
      }
      for (let y = 0; y < h; y++) {
        const left = (y * w) * 4;
        const right = (y * w + (w - 1)) * 4;
        out[left] = 255; out[left + 1] = 255; out[left + 2] = 255; out[left + 3] = 255;
        out[right] = 255; out[right + 1] = 255; out[right + 2] = 255; out[right + 3] = 255;
      }
    }

    const normalizedImageData = new ImageData(out, imageData.width, imageData.height);

    // B&W trace: 2 colours (black ink + white background) — no CPU wasted on colour noise.
    // pathomit:8  — drops sub-pixel artifact paths that would create ghost cut lines.
    // ltres:0.3 / qtres:0.5 — relaxed tolerances produce smooth, vinyl-cutter-friendly curves
    //   instead of the jagged micro-curves that 0.05 generated.
    // rightangleenhance keeps crisp 90° corners where the design genuinely has them.
    // colorquantcycles:2 and mincolorgap:128 ensure strict black/white separation.
    const svgString = ImageTracer.imagedataToSVG(normalizedImageData, {
      pathomit: 8,
      ltres: 0.3,
      qtres: 0.5,
      scale: 1,
      rightangleenhance: true,
      numberofcolors: 2,
      colorquantcycles: 2,
      mincolorgap: 128,
      pal: [
        { r: 255, g: 255, b: 255, a: 255 },
        { r: 0, g: 0, b: 0, a: 255 },
      ],
      colorsampling: 0,
      ...traceOptions,
    });

    self.postMessage({ svgString });
  } catch (err) {
    self.postMessage({ error: err instanceof Error ? err.message : 'Background trace failed' });
  }
};