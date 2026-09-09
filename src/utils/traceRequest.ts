import { encodeTracePng } from './imageDataPng';
import { cleanupTracedSvg } from './svgTraceCleanup';
import {
  buildTraceQuery,
  TRACE_REQUEST_BODY_LIMIT,
  traceHttpError,
  type ColorTraceParams,
} from './traceParams';

export { buildTraceQuery, TRACE_REQUEST_BODY_LIMIT, traceHttpError };

/**
 * POST a PNG (not raw RGBA JSON) to `/api/trace`.
 *
 * A 1000×1000 raster is 4 MB uncompressed; base64 JSON is ~5.3 MB and Vercel
 * rejects it with HTTP 413. A binary PNG of the same pixels stays under the
 * 4.5 MB platform limit.
 */
export async function requestServerTrace(
  imageData: ImageData,
  params?: ColorTraceParams,
): Promise<string> {
  const blob = await encodeTracePng(imageData);
  const res = await fetch(`/api/trace?${buildTraceQuery(params)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: blob,
  });
  const json = await res.json().catch(() => ({})) as {
    svg?: string;
    error?: string;
    width?: number;
    height?: number;
  };
  if (!res.ok || !json.svg) {
    throw traceHttpError(res.status, json.error);
  }
  return cleanupTracedSvg(json.svg, json.width ?? imageData.width, json.height ?? imageData.height);
}
