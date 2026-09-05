/** Shared colour-trace knobs. Server (`traceColor.mjs`) uses the same defaults. */

export interface ColorTraceParams {
  /** Distinct colour clusters (2–32). */
  maxColors?: number;
  /** Degrees (VTracer). Lower detects more corners; higher rounds them off. */
  cornerThreshold?: number;
  /** 0–10 spline tightness. Low stays tight; high smooths pixel stairs. Always spline. */
  curveFit?: number;
  /** VTracer speckle filter in px². Kept low so drips survive. */
  filterSpeckle?: number;
  /** Forced `#rrggbb` inks. When omitted the server extracts them. */
  palette?: string[];
}

export const DEFAULT_COLOR_TRACE: Required<Omit<ColorTraceParams, 'palette'>> = {
  maxColors: 4,
  cornerThreshold: 90,
  curveFit: 4,
  filterSpeckle: 0,
};

export function clampTraceInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(max, Math.max(min, n)));
}

export type NormalizedColorTraceParams = Required<Omit<ColorTraceParams, 'palette'>> & {
  palette?: string[];
};

export function normalizeColorTraceParams(params?: ColorTraceParams): NormalizedColorTraceParams {
  const palette = Array.isArray(params?.palette)
    ? params.palette.filter((s): s is string => typeof s === 'string' && /^#?[0-9A-Fa-f]{6}$/.test(s.trim()))
      .map((s) => (s.startsWith('#') ? s : `#${s}`).toLowerCase())
    : undefined;
  return {
    maxColors: clampTraceInt(params?.maxColors, 2, 32, DEFAULT_COLOR_TRACE.maxColors),
    cornerThreshold: clampTraceInt(params?.cornerThreshold, 20, 180, DEFAULT_COLOR_TRACE.cornerThreshold),
    curveFit: clampTraceInt(params?.curveFit, 0, 10, DEFAULT_COLOR_TRACE.curveFit),
    filterSpeckle: clampTraceInt(params?.filterSpeckle, 0, 16, DEFAULT_COLOR_TRACE.filterSpeckle),
    palette: palette && palette.length >= 2 ? palette : undefined,
  };
}
