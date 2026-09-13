import * as fabric from 'fabric';
import { isBackgroundFill, isBlackFill, isFullFrameShape, normalizeFill } from './traceFills.ts';

export { isBackgroundFill, isBlackFill, isFullFrameShape, normalizeFill } from './traceFills.ts';

type FabricAny = fabric.Object & {
  fill?: unknown;
  stroke?: unknown;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  type?: string;
  left?: number;
  top?: number;
  getBoundingRect?: (absolute?: boolean) => {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  setCoords?: () => void;
};

export type SvgFrame = { width: number; height: number };

export type InkBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type LoadedTrace = {
  objects: fabric.Object[];
  frame: SvgFrame;
  ink: InkBounds;
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

/** Union bbox of SVG-space objects before Fabric regroups them. */
export function measureInkBounds(objects: fabric.Object[]): InkBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const raw of objects) {
    const obj = raw as FabricAny;
    obj.setCoords?.();
    const rect =
      typeof obj.getBoundingRect === 'function'
        ? obj.getBoundingRect(true)
        : {
            left: Number(obj.left || 0),
            top: Number(obj.top || 0),
            width: Math.max(1, Number(obj.width || 1) * Number(obj.scaleX || 1)),
            height: Math.max(1, Number(obj.height || 1) * Number(obj.scaleY || 1)),
          };
    minX = Math.min(minX, rect.left);
    minY = Math.min(minY, rect.top);
    maxX = Math.max(maxX, rect.left + rect.width);
    maxY = Math.max(maxY, rect.top + rect.height);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { left: 0, top: 0, width: 1, height: 1 };
  }

  return {
    left: minX,
    top: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export async function loadTracedObjects(
  svgString: string,
  keepOnlyBlack = false,
  keepFullFrame = false,
): Promise<LoadedTrace> {
  const result = await (
    fabric as {
      loadSVGFromString: (svg: string) => Promise<{
        objects?: fabric.Object[];
        options?: { width?: number; height?: number };
      }>;
    }
  ).loadSVGFromString(svgString);
  const loaded = (result.objects || []).filter(Boolean) as fabric.Object[];
  const svgWidth = Number(result.options?.width || 0);
  const svgHeight = Number(result.options?.height || 0);
  const objects = filterTracedObjects(
    loaded,
    svgWidth,
    svgHeight,
    keepOnlyBlack,
    keepFullFrame,
  );
  const ink = measureInkBounds(objects.length ? objects : loaded);
  const frame: SvgFrame = {
    width: Math.max(1, svgWidth || ink.width),
    height: Math.max(1, svgHeight || ink.height),
  };
  return { objects, frame, ink };
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
 * Pure placement math: scale the SVG *viewBox* onto the source display size,
 * then park the tight ink group so its SVG-space centre lands correctly.
 * Stretching by ink-bbox size (old behaviour) blew small cutouts up to the
 * full photo and left the selection handles huge/wrong.
 */
export function computePlaceOverSourceTransform(input: {
  sourceCenter: { x: number; y: number };
  sourceScaledWidth: number;
  sourceScaledHeight: number;
  sourceAngleDeg?: number;
  frame: SvgFrame;
  ink: InkBounds;
  placedScaleX?: number;
  placedScaleY?: number;
}): { left: number; top: number; scaleX: number; scaleY: number; angle: number } {
  const fw = Math.max(1, input.frame.width);
  const fh = Math.max(1, input.frame.height);
  const sw = Math.max(1, input.sourceScaledWidth);
  const sh = Math.max(1, input.sourceScaledHeight);
  const scaleX = (input.placedScaleX || 1) * (sw / fw);
  const scaleY = (input.placedScaleY || 1) * (sh / fh);

  const inkCx = input.ink.left + input.ink.width / 2;
  const inkCy = input.ink.top + input.ink.height / 2;
  const localOffsetX = (inkCx - fw / 2) * (sw / fw);
  const localOffsetY = (inkCy - fh / 2) * (sh / fh);

  const angle = input.sourceAngleDeg || 0;
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rotatedX = localOffsetX * cos - localOffsetY * sin;
  const rotatedY = localOffsetX * sin + localOffsetY * cos;

  return {
    left: input.sourceCenter.x + rotatedX,
    top: input.sourceCenter.y + rotatedY,
    scaleX,
    scaleY,
    angle,
  };
}

/** Match the traced group to the source image using the SVG viewBox frame. */
export function placeOverSource(
  placed: fabric.Object,
  source: fabric.Object,
  frame: SvgFrame,
  ink: InkBounds,
): void {
  const transform = computePlaceOverSourceTransform({
    sourceCenter: source.getCenterPoint(),
    sourceScaledWidth: source.getScaledWidth(),
    sourceScaledHeight: source.getScaledHeight(),
    sourceAngleDeg: source.angle || 0,
    frame,
    ink,
    placedScaleX: placed.scaleX || 1,
    placedScaleY: placed.scaleY || 1,
  });
  placed.set({
    ...CONTROL_STYLE,
    left: transform.left,
    top: transform.top,
    scaleX: transform.scaleX,
    scaleY: transform.scaleY,
    angle: transform.angle,
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
    /** @deprecated Traces are fitted to the source's on-canvas size via viewBox. */
    scaleDivisor?: number;
  },
): Promise<fabric.Object | null> {
  const stacked = options?.hierarchical === 'stacked';
  const { objects, frame, ink } = await loadTracedObjects(
    svgString,
    options?.keepOnlyBlack ?? false,
    stacked,
  );
  const grouped = stacked
    ? groupStackedTracedObjects(objects)
    : groupTracedObjects(objects, options?.fill != null ? { fill: options.fill } : undefined);
  if (!grouped) return null;
  if (options?.source) {
    placeOverSource(grouped, options.source, frame, ink);
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
