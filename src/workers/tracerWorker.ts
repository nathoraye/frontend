import ImageTracer from 'imagetracerjs';

self.onmessage = function(e: MessageEvent) {
  try {
    const imageData: ImageData = e.data.imageData;

    // B&W trace: 2 colours (black ink + white background) — no CPU wasted on colour noise.
    // pathomit:8  — drops sub-pixel artifact paths that would create ghost cut lines.
    // ltres:0.3 / qtres:0.5 — relaxed tolerances produce smooth, vinyl-cutter-friendly curves
    //   instead of the jagged micro-curves that 0.05 generated.
    // rightangleenhance keeps crisp 90° corners where the design genuinely has them.
    const svgString = ImageTracer.imagedataToSVG(imageData, {
      pathomit: 8,
      ltres: 0.3,
      qtres: 0.5,
      scale: 1,
      rightangleenhance: true,
      numberofcolors: 2,
    });

    self.postMessage({ svgString });
  } catch (err) {
    self.postMessage({ error: err instanceof Error ? err.message : 'Background trace failed' });
  }
};