/**
 * Legacy 2-colour ImageTracer options — only the compare-harness "before" column.
 * Live tracing uses VTracer via `/api/trace` (`traceParams.ts` / `traceColor.mjs`).
 */
export const LEGACY_TRACE_OPTIONS: Record<string, unknown> = {
  pathomit: 16,
  ltres: 1.6,
  qtres: 2.2,
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
  strokewidth: 0,
};

export function vinylTraceOptions(smoothness = 5): Record<string, unknown> {
  const t = Math.max(1, Math.min(10, smoothness)) / 5;
  return {
    ...LEGACY_TRACE_OPTIONS,
    ltres: 0.6 + 1.0 * t,
    qtres: 0.8 + 1.4 * t,
  };
}
