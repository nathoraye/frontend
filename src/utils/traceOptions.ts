/**
 * ImageTracer.js options for vinyl-cut SVGs.
 *
 * ImageTracer emits L (lines) and Q (quadratic Béziers). Higher ltres/qtres
 * fit longer smooth segments instead of pixel staircases. pathomit + linefilter
 * drop speckles. strokewidth 0 avoids a 1px halo that made edges look jagged.
 *
 * smoothness 1 = tight/detailed, 5 = default, 10 = extra-smooth (crop slider).
 */
export function vinylTraceOptions(smoothness = 5): Record<string, unknown> {
  const t = Math.max(1, Math.min(10, smoothness)) / 5;
  return {
    // Drop edge-node paths shorter than this (speckles / JPEG crumbs).
    pathomit: 12,
    // Straight-line error (px). Was 0.2 → micro-segments. ~1.2 prefers clean lines.
    ltres: 0.4 + 0.8 * t,
    // Quadratic error. Was 0.4 → bumpy curves. ~1.3 prefers smooth Q/C fits.
    qtres: 0.5 + 0.9 * t,
    scale: 1,
    // Keep 90° vinyl corners; natural curves still go through qtres.
    rightangleenhance: true,
    numberofcolors: 2,
    colorquantcycles: 2,
    mincolorgap: 128,
    pal: [
      { r: 255, g: 255, b: 255, a: 255 },
      { r: 0, g: 0, b: 0, a: 255 },
    ],
    colorsampling: 0,
    // No extra stroke around fills (default 1 fattened every path).
    strokewidth: 0,
    // Discard 1–2 segment junk paths.
    linefilter: true,
    roundcoords: 1,
    viewbox: true,
    desc: false,
    layering: 0,
    // ImageTracer's own blur is coarse; we Gaussian-blur in prepareTraceRaster.
    blurradius: 0,
  };
}

/** Previous production options — used only by the before/after compare harness. */
export const LEGACY_TRACE_OPTIONS: Record<string, unknown> = {
  pathomit: 1,
  ltres: 0.2,
  qtres: 0.4,
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
};
