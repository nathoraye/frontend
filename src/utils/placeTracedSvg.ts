import * as fabric from 'fabric';
import { isBackgroundFill, isBlackFill, isFullFrameShape, normalizeFill } from './traceFills.ts';
import { keepWeldArtwork } from './weldImport.ts';
import { readTraceFrame } from './svgTraceCleanup.ts';

export { isBackgroundFill, isBlackFill, isFullFrameShape, normalizeFill } from './traceFills.ts';

type FabricAny = fabric.Object & {
  fill?: unknown;
  stroke?: unknown;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  type?: string;
};

export type TraceFrame = {
  width: number;
  height: number;
};

export function filterTracedObjects(
  objects: fabric.Object[],
  svgWidth: number,
  svgHeight: number,
  keepOnlyBlack = false,
  keepFullFrame = false,
): fabric.Object[] {
  return objects.filter((raw) => {
    const obj = raw as FabricAny;
    if (!keepFullFrame && isFullFrameShape(obj, svgWidth, svgHeight)) return false;
    if (isBackgroundFill(obj.fill) && (isBackgroundFill(obj.stroke) || !obj.stroke)) return false;
    if (keepOnlyBlack && !isBlackFill(obj.fill) && !isBlackFill(obj.stroke)) return false;
    return true;
  });
}

export async function loadTracedObjects(
  svgString: string,
  keepOnlyBlack = false,
  keepFullFrame = false,
): Promise<{ objects: fabric.Object[]; frame: TraceFrame }> {
  const result = await (fabric as { loadSVGFromString: (svg: string) => Promise<{ objects?: fabric.Object[]; options?: { width?: number; height?: number } }> }).loadSVGFromString(svgString);
  const objects = (result.objects || []).filter(Boolean);
  const svgWidth = Number(result.options?.width || 0);
  const svgHeight = Number(result.options?.height || 0);
  const meta = readTraceFrame(svgString);
  // Prefer the pre-crop artboard so placeOverSource maps onto the source photo.
  // Fall back to the (possibly cropped) SVG size when metadata is absent.
  const frame: TraceFrame = {
    width: meta?.width || svgWidth,
    height: meta?.height || svgHeight,
  };
  const filtered = filterTracedObjects(objects, svgWidth, svgHeight, keepOnlyBlack, keepFullFrame);
  // Drop leftover dust Fabric still imported as separate shapes.
  const cleaned = keepWeldArtwork(filtered, { width: svgWidth, height: svgHeight });
  return { objects: cleaned, frame };
}

const CONTROL_STYLE = {
  originX: 'center' as const,
  originY: 'center' as const,
  cornerColor: '#FF1493',
  transparentCorners: false,
  cornerStyle: 'circle' as const,
  objectCaching: true,
};

export function groupTracedObjects(
  objects: fabric.Object[],
  style?: Record<string, unknown>,
): fabric.Object | null {
  if (!objects.length) return null;

  objects.forEach((obj) => {
    obj.set({
      stroke: style?.stroke ?? '',
      strokeWidth: style?.strokeWidth ?? 0,
      // Keep evenodd from svgTraceCleanup so letter counters (O, D, A) stay
      // holes instead of filling solid. Callers may override.
      fillRule: (style?.fillRule as string) ?? 'evenodd',
      objectCaching: true,
      ...(style?.fill != null ? { fill: style.fill as string } : {}),
    });
  });

  if (objects.length === 1) {
    const only = objects[0];
    only.set({ ...CONTROL_STYLE, ...style });
    only.setCoords();
    return only;
  }

  const group = new fabric.Group(objects, {
    ...CONTROL_STYLE,
    ...style,
    subTargetCheck: false,
  });
  group.setCoords();
  return group;
}

function layerNameForFill(fill: string, index: number): string {
  const hex = String(fill || '').toUpperCase();
  if (index === 0 && (hex === '#000000' || hex === '#000')) return 'Silhouette';
  return hex || `Layer ${index + 1}`;
}

/** One Fabric group per vinyl colour, nested so Ungroup yields cut sheets. */
export function groupStackedTracedObjects(objects: fabric.Object[]): fabric.Object | null {
  if (!objects.length) return null;
  const buckets: { fill: string; items: fabric.Object[] }[] = [];
  for (const obj of objects) {
    const fill = normalizeFill((obj as FabricAny).fill) || '#000000';
    const last = buckets[buckets.length - 1];
    if (last && last.fill === fill) last.items.push(obj);
    else buckets.push({ fill, items: [obj] });
  }
  const layers = buckets
    .map((bucket, index) => {
      const grouped = groupTracedObjects(bucket.items, {
        fill: bucket.fill,
        fillRule: 'evenodd',
      });
      if (!grouped) return null;
      (grouped as fabric.Object & { name?: string }).name = layerNameForFill(bucket.fill, index);
      return grouped;
    })
    .filter((obj): obj is fabric.Object => !!obj);
  if (!layers.length) return null;
  if (layers.length === 1) return layers[0];
  const stack = new fabric.Group(layers, {
    ...CONTROL_STYLE,
    subTargetCheck: false,
  });
  (stack as fabric.Group & { name?: string }).name = 'Layered SVG';
  stack.setCoords();
  return stack;
}

/**
 * Match the traced artwork to the source image's on-canvas pose.
 *
 * Scale by the original SVG artboard (viewBox / data-trace-frame), not the
 * ink-tight group size — otherwise corner logos stretch to fill the photo
 * and empty SVG canvas becomes a huge selection box.
 */
export function placeOverSource(
  placed: fabric.Object,
  source: fabric.Object,
  frame?: TraceFrame | null,
): void {
  const center = source.getCenterPoint();
  const sw = Math.max(1, source.getScaledWidth());
  const sh = Math.max(1, source.getScaledHeight());

  const frameW = frame?.width && frame.width > 0 ? frame.width : 0;
  const frameH = frame?.height && frame.height > 0 ? frame.height : 0;

  if (frameW > 0 && frameH > 0) {
    const scaleX = sw / frameW;
    const scaleY = sh / frameH;
    // `placed` is still in SVG user units (ink center within the artboard).
    const inkX = placed.left ?? frameW / 2;
    const inkY = placed.top ?? frameH / 2;
    placed.set({
      ...CONTROL_STYLE,
      left: center.x + (inkX - frameW / 2) * scaleX,
      top: center.y + (inkY - frameH / 2) * scaleY,
      scaleX: (placed.scaleX || 1) * scaleX,
      scaleY: (placed.scaleY || 1) * scaleY,
      angle: source.angle || 0,
    });
    placed.setCoords();
    return;
  }

  // Legacy fallback when no artboard size is known: fit ink box to the photo.
  const pw = Math.max(1, placed.getScaledWidth());
  const ph = Math.max(1, placed.getScaledHeight());
  placed.set({
    ...CONTROL_STYLE,
    left: center.x,
    top: center.y,
    scaleX: (placed.scaleX || 1) * (sw / pw),
    scaleY: (placed.scaleY || 1) * (sh / ph),
    angle: source.angle || 0,
  });
  placed.setCoords();
}

export async function tracedSvgToObject(
  svgString: string,
  options?: {
    keepOnlyBlack?: boolean;
    fill?: string;
    source?: fabric.Object;
    hierarchical?: 'cutout' | 'stacked';
    /** @deprecated Traces are fitted to the source's on-canvas size. */
    scaleDivisor?: number;
  },
): Promise<fabric.Object | null> {
  const stacked = options?.hierarchical === 'stacked';
  const { objects, frame } = await loadTracedObjects(
    svgString,
    options?.keepOnlyBlack ?? false,
    stacked,
  );
  const grouped = stacked
    ? groupStackedTracedObjects(objects)
    : groupTracedObjects(objects, options?.fill != null ? { fill: options.fill } : undefined);
  if (!grouped) return null;
  if (options?.source) {
    placeOverSource(grouped, options.source, frame);
  }
  return grouped;
}

/**
 * Parse a VTracer SVG string and inject it onto the canvas as an editable
 * vector group.  Fabric v7's `loadSVGFromString` is Promise-based (the v5
 * callback + `groupSVGElements` API is gone), so this uses that Promise and
 * the existing `loadTracedObjects` / `groupTracedObjects` helpers which:
 *  - drop paper / full-frame background paths
 *  - keep `fillRule: 'evenodd'` so letter counters stay holes
 */
export async function placeTracedSvg(
  svgString: string,
  canvas: fabric.Canvas,
): Promise<fabric.Object | null> {
  const { objects } = await loadTracedObjects(svgString);
  const importedGroup = groupTracedObjects(objects);
  if (!importedGroup) return null;

  importedGroup.set({
    left: canvas.getWidth() / 2,
    top: canvas.getHeight() / 2,
    originX: 'center',
    originY: 'center',
    hasControls: true,
    hasBorders: true,
    selectable: true,
  });
  importedGroup.setCoords();

  canvas.add(importedGroup);
  canvas.setActiveObject(importedGroup);
  canvas.requestRenderAll();
  return importedGroup;
}
