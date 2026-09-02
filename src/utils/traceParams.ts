/** Shared colour-trace knobs. Server (`traceColor.mjs`) uses the same defaults. */

export interface ColorTraceParams {
  /** Distinct colour clusters (2–32). */
  maxColors?: number;
  /** Degrees (VTracer). Lower detects more corners; higher rounds them off. */
  cornerThreshold?: number;
  /** 0 = polygon/stencil; 1–10 = spline (simplify/lengthThreshold). */
  curveFit?: number;
  /** VTracer speckle filter in px². Kept low so drips survive. */
  filterSpeckle?: number;
}

export const DEFAULT_COLOR_TRACE: Required<ColorTraceParams> = {
  maxColors: 8,
  cornerThreshold: 90,
  curveFit: 2,
  filterSpeckle: 2,
};

export function clampTraceInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(max, Math.max(min, n)));
}

export function normalizeColorTraceParams(params?: ColorTraceParams): Required<ColorTraceParams> {
  return {
    maxColors: clampTraceInt(params?.maxColors, 2, 32, DEFAULT_COLOR_TRACE.maxColors),
    cornerThreshold: clampTraceInt(params?.cornerThreshold, 20, 180, DEFAULT_COLOR_TRACE.cornerThreshold),
    curveFit: clampTraceInt(params?.curveFit, 0, 10, DEFAULT_COLOR_TRACE.curveFit),
    filterSpeckle: clampTraceInt(params?.filterSpeckle, 0, 16, DEFAULT_COLOR_TRACE.filterSpeckle),
  };
}
