/**
 * vtracerWasm.ts
 *
 * High-precision vector tracing pipeline for vinyl stencil production.
 *
 * 1. 2× nearest-neighbour upscale (no bilinear blur) on a hidden canvas
 * 2. ITU-R BT.601 luminance binarisation to wipe grey anti-alias fringe
 * 3. Map UI sliders onto VTracerConfig (snake_case WASM surface)
 * 4. Yield to the browser, then run the VTracer engine
 *
 * Architecture note
 * -----------------
 * `@visioncortex/vtracer` ships a Node.js CJS wrapper that loads `.wasm` via
 * `require('fs')`.  Importing `convert_image_to_svg` (or `convertPixels`) from
 * that package in a Vite browser bundle would pull `fs` into the client and
 * fail at runtime.  The function below matches the declared
 * `convert_image_to_svg` signature and forwards RGBA to `/api/trace`, which
 * runs the same VTracer WASM (`convertPixels` / `traceRgba`) on the server.
 */

import type { VTracerConfig } from '@visioncortex/vtracer';
import { cleanupTracedSvg } from './svgTraceCleanup';
import type { ColorTraceParams } from './traceParams';
import { normalizeColorTraceParams } from './traceParams';
import {
  binarizeRgba,
  mapUiConfigToVtracer,
  vtracerConfigToServerParams,
  type TracingUiConfig,
} from './vtracerConfig';

export type { TracingUiConfig };
export {
  DEFAULT_TRACING_UI,
  PATH_OMIT_SIZE,
  binarizeRgba,
  mapUiConfigToVtracer,
  vtracerConfigToServerParams,
} from './vtracerConfig';

const UPSCALE_FACTOR = 2;

function rgbaToBase64(data: Uint8ClampedArray): string {
  const CHUNK = 32_768;
  let binary = '';
  for (let i = 0; i < data.length; i += CHUNK) {
    binary += String.fromCharCode(...data.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Adapter matching the declared `convert_image_to_svg` signature.
 * Forwards RGBA to `/api/trace` (VTracer WASM on the server).
 */
export async function convert_image_to_svg(
  imgData: Uint8ClampedArray | number[],
  width: number,
  height: number,
  config: VTracerConfig,
): Promise<string> {
  const pixels = imgData instanceof Uint8ClampedArray
    ? imgData
    : Uint8ClampedArray.from(imgData);
  const params = vtracerConfigToServerParams(config);
  const res = await fetch('/api/trace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rgba: rgbaToBase64(pixels),
      width,
      height,
      ...params,
    }),
  });
  const json = await res.json().catch(() => ({})) as { svg?: string; error?: string };
  if (!res.ok || !json.svg) {
    throw new Error(json.error ?? `VTracer WASM trace failed (HTTP ${res.status})`);
  }
  return json.svg;
}

async function traceCanvasStencil(
  sourceCanvas: HTMLCanvasElement,
  uiConfig: TracingUiConfig,
): Promise<string> {
  const width = Math.max(1, Math.round(sourceCanvas.width * UPSCALE_FACTOR));
  const height = Math.max(1, Math.round(sourceCanvas.height * UPSCALE_FACTOR));

  const hiddenCanvas = document.createElement('canvas');
  hiddenCanvas.width = width;
  hiddenCanvas.height = height;
  const ctx = hiddenCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Failed to create 2D graphics rendering context.');

  // Nearest-neighbour upscale: bilinear interpolation would soften knife edges.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, 0, 0, width, height);

  await yieldToUi();

  const imgDataWrapper = ctx.getImageData(0, 0, width, height);
  binarizeRgba(imgDataWrapper.data, uiConfig.thresholdValue);
  ctx.putImageData(imgDataWrapper, 0, 0);

  const vtracerConfig = mapUiConfigToVtracer(uiConfig);

  // Yield so the binarisation loop doesn't freeze React's render thread
  // before the WASM/network hop.
  await yieldToUi();
  const svgOutput = await convert_image_to_svg(
    imgDataWrapper.data,
    width,
    height,
    vtracerConfig,
  );
  return cleanupTracedSvg(svgOutput, width, height);
}

async function traceImageDataColor(
  pixelData: ImageData,
  uiConfig: ColorTraceParams,
): Promise<string> {
  const p = normalizeColorTraceParams(uiConfig);
  const res = await fetch('/api/trace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rgba: rgbaToBase64(pixelData.data),
      width: pixelData.width,
      height: pixelData.height,
      maxColors: p.maxColors,
      cornerThreshold: p.cornerThreshold,
      curveFit: p.curveFit,
      filterSpeckle: 8,
    }),
  });
  const json = await res.json().catch(() => ({})) as { svg?: string; error?: string };
  if (!res.ok || !json.svg) {
    throw new Error(json.error ?? `VTracer WASM trace failed (HTTP ${res.status})`);
  }
  return cleanupTracedSvg(json.svg, pixelData.width, pixelData.height);
}

/**
 * Convert a raster to an SVG string.
 *
 * Canvas + TracingUiConfig: 2× upscale, BT.601 binarise, then VTracer (stencil).
 * ImageData + ColorTraceParams: colour-preserving WASM path used by the
 * existing preview modal (no binarisation — that would collapse paint colours).
 */
export async function traceImageToVector(
  sourceCanvas: HTMLCanvasElement,
  uiConfig: TracingUiConfig,
): Promise<string>;
export async function traceImageToVector(
  pixelData: ImageData,
  uiConfig: ColorTraceParams,
): Promise<string>;
export async function traceImageToVector(
  source: HTMLCanvasElement | ImageData,
  uiConfig: TracingUiConfig | ColorTraceParams,
): Promise<string> {
  if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) {
    return traceCanvasStencil(source, uiConfig as TracingUiConfig);
  }
  if (typeof ImageData !== 'undefined' && source instanceof ImageData) {
    return traceImageDataColor(source, uiConfig as ColorTraceParams);
  }
  const pixels = source as ImageData;
  if (pixels && pixels.data && typeof pixels.width === 'number') {
    return traceImageDataColor(pixels, uiConfig as ColorTraceParams);
  }
  throw new Error('traceImageToVector expects an HTMLCanvasElement or ImageData.');
}
