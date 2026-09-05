/**
 * Pure VTracer slider mapping — no DOM, no fetch.
 * Shared by the browser stencil pipeline and Node tests.
 */
import type { VTracerConfig } from '@visioncortex/vtracer';

export interface TracingUiConfig {
  /** UI slider. 0 = polygon/stencil; 1–100 = spline curve-fit strength. */
  curveFit: number;
  /** UI slider, degrees (typically 0–180). */
  cornerThreshold: number;
  /** Colour-count numeric input. */
  maxColors: number;
  /** Binarisation luminance cutoff (0–255). Pixels darker than this become ink. */
  thresholdValue: number;
}

export const DEFAULT_TRACING_UI: TracingUiConfig = {
  curveFit: 0,
  cornerThreshold: 90,
  maxColors: 2,
  thresholdValue: 128,
};

/** Aggressive speckle threshold so the cutter razor doesn't chatter. */
export const PATH_OMIT_SIZE = 16;

/**
 * Map studio sliders onto native VTracerConfig.
 *
 * Curve-fit: an exact 0 `curve_fitting_error` stalls or corrupts path
 * generation.  Lower slider settings therefore clamp to 0.1 so polygon
 * silhouettes stay hard without collapsing the fitter.
 *
 *   curveFit === 0  → mode 'polygon', curve_fitting_error 0.1
 *   curveFit 1–100  → mode 'spline',  curve_fitting_error in [0.1, 2.0]
 */
export function mapUiConfigToVtracer(uiConfig: TracingUiConfig): VTracerConfig {
  const curveFit = Number.isFinite(uiConfig.curveFit) ? uiConfig.curveFit : 0;
  const mappedCurveError = Math.max(0.1, (Math.max(0, curveFit) / 100) * 2.0);
  return {
    mode: curveFit === 0 ? 'polygon' : 'spline',
    layering: 'cutout',
    color_count: uiConfig.maxColors,
    corner_threshold: uiConfig.cornerThreshold,
    curve_fitting_error: mappedCurveError,
    path_omit_size: PATH_OMIT_SIZE,
  };
}

/**
 * Translate snake_case VTracerConfig into the `/api/trace` camelCase contract
 * (`traceColor.mjs` `buildVtracerOptions`).
 */
export function vtracerConfigToServerParams(config: VTracerConfig): {
  maxColors: number;
  cornerThreshold: number;
  curveFit: number;
  filterSpeckle: number;
} {
  const isPolygon = config.mode === 'polygon';
  const error = config.curve_fitting_error ?? 0.1;
  return {
    maxColors: config.color_count ?? 2,
    cornerThreshold: config.corner_threshold ?? 90,
    curveFit: isPolygon ? 0 : Math.max(1, Math.round((error / 2) * 10)),
    filterSpeckle: config.path_omit_size ?? PATH_OMIT_SIZE,
  };
}

/**
 * In-place ITU-R BT.601 luminance binarisation.
 * Alpha is left untouched so keyed-out pixels stay transparent.
 */
export function binarizeRgba(data: Uint8ClampedArray, thresholdValue: number): void {
  const cutoff = Number.isFinite(thresholdValue) ? thresholdValue : 128;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    const finalVal = luminance < cutoff ? 0 : 255;
    data[i] = finalVal;
    data[i + 1] = finalVal;
    data[i + 2] = finalVal;
  }
}
