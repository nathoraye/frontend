/* Export pipeline: normalize -> flatten -> svgo optimize -> sanitize
 * This module exports a function `exportCanvasToOptimizedSVG` that accepts a Fabric canvas
 * and returns a Promise<string> with an optimized, sanitized SVG ready for export.
 *
 * Implementation notes:
 * - Uses canvas.toSVG() as canonical serializer from Fabric.js (preserves transforms and styles).
 * - Runs SVGO with a set of plugins to collapse groups, convert shapes to paths, remove metadata,
 *   and minify the result.
 * - Runs DOMPurify.sanitize when running in a browser environment (window available).
 *
 * This is the client-side export pipeline deliverable. For server-side processing or
 * deeper geometric validation, use the validation script in /scripts.
 */

import DOMPurify from 'dompurify';
import type { Canvas as FabricCanvas } from 'fabric';

interface SvgoPlugin {
  name: string;
  params?: Record<string, unknown>;
}

interface ExportOptions {
  svgoPlugins?: SvgoPlugin[];
  addMetadata?: boolean;
}

interface SvgoOptimizeResult {
  data: string;
}

interface SvgoOptimizeModule {
  optimize: (input: string, config: { multipass: boolean; plugins: SvgoPlugin[] }) => SvgoOptimizeResult;
}

const defaultSvgoPlugins: SvgoPlugin[] = [
  { name: 'preset-default' },
  // Convert shapes (rect,circle,ellipse,line,polyline,polygon) to paths for uniform processing
  { name: 'convertShapeToPath', params: {} },
  { name: 'convertPathData', params: { applyTransforms: true } },
  { name: 'collapseGroups', params: {} },
  { name: 'removeTitle', params: {} },
  { name: 'removeDesc', params: {} },
  { name: 'removeMetadata', params: {} },
  { name: 'removeEditorsNSData', params: {} },
  { name: 'removeUnknownsAndDefaults', params: {} },
  { name: 'removeUselessStrokeAndFill', params: {} },
  { name: 'cleanupNumericValues', params: { floatPrecision: 3 } },
  { name: 'cleanupIDs', params: {} }
];

export async function exportCanvasToOptimizedSVG(canvas: FabricCanvas, opts?: ExportOptions): Promise<string> {
  if (!canvas) throw new Error('No canvas provided');

  // Ensure nothing is active and render is up-to-date
  canvas.discardActiveObject?.();
  canvas.renderAll?.();

  // 1) Serialize the canvas to raw SVG (Fabric does transform application within nodes)
  const rawSVG = canvas.toSVG();

  // Optional: prefix metadata
  const svgWithMeta = opts?.addMetadata ? `<!-- West Vinyl Studio export -->\n${rawSVG}` : rawSVG;

  // 2) Optimize with the browser SVGO build (avoids Node fs/path/os in the client bundle)
  const svgoModule = await import('svgo/browser') as SvgoOptimizeModule;
  const optimize = svgoModule.optimize;

  const svgoConfig = {
    multipass: true,
    plugins: opts?.svgoPlugins ?? defaultSvgoPlugins
  };

  let optimized: SvgoOptimizeResult;
  try {
    optimized = optimize(svgWithMeta, svgoConfig);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error('SVGO optimization failed: ' + msg, { cause: e });
  }

  let optimizedSVG = optimized.data;

  // 3) Sanitize in-browser. Skip in Node (no window) so scripts can still call this.
  if (typeof window !== 'undefined') {
    optimizedSVG = DOMPurify.sanitize(optimizedSVG, { USE_PROFILES: { svg: true } });
  }

  return optimizedSVG;
}
