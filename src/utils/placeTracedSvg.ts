import * as fabric from 'fabric';
import { isBackgroundFill, isBlackFill, isFullFrameShape } from './traceFills';

export { isBackgroundFill, isBlackFill, isFullFrameShape, normalizeFill } from './traceFills';

type FabricAny = fabric.Object & {
  fill?: unknown;
  stroke?: unknown;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  type?: string;
};

export function filterTracedObjects(
  objects: fabric.Object[],
  svgWidth: number,
  svgHeight: number,
  keepOnlyBlack = false,
): fabric.Object[] {
  return objects.filter((raw) => {
    const obj = raw as FabricAny;
    if (isFullFrameShape(obj, svgWidth, svgHeight)) return false;
    if (isBackgroundFill(obj.fill) && (isBackgroundFill(obj.stroke) || !obj.stroke)) return false;
    if (keepOnlyBlack && !isBlackFill(obj.fill) && !isBlackFill(obj.stroke)) return false;
    return true;
  });
}

export async function loadTracedObjects(
  svgString: string,
  keepOnlyBlack = false,
): Promise<fabric.Object[]> {
  const result = await (fabric as { loadSVGFromString: (svg: string) => Promise<{ objects?: fabric.Object[]; options?: { width?: number; height?: number } }> }).loadSVGFromString(svgString);
  const objects = (result.objects || []).filter(Boolean);
  const svgWidth = Number(result.options?.width || 0);
  const svgHeight = Number(result.options?.height || 0);
  return filterTracedObjects(objects, svgWidth, svgHeight, keepOnlyBlack);
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

/** Match the traced group to the source image's on-canvas size and pose. */
export function placeOverSource(
  placed: fabric.Object,
  source: fabric.Object,
): void {
  const center = source.getCenterPoint();
  const sw = Math.max(1, source.getScaledWidth());
  const sh = Math.max(1, source.getScaledHeight());
  const pw = Math.max(1, (placed.width || 1) * (placed.scaleX || 1));
  const ph = Math.max(1, (placed.height || 1) * (placed.scaleY || 1));
  placed.set({
    ...CONTROL_STYLE,
    left: center.x,
    top: center.y,
    scaleX: sw / pw,
    scaleY: sh / ph,
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
    /** @deprecated Traces are fitted to the source's on-canvas size. */
    scaleDivisor?: number;
  },
): Promise<fabric.Object | null> {
  const objects = await loadTracedObjects(svgString, options?.keepOnlyBlack ?? false);
  const grouped = groupTracedObjects(objects, options?.fill != null ? { fill: options.fill } : undefined);
  if (!grouped) return null;
  if (options?.source) {
    placeOverSource(grouped, options.source);
  }
  return grouped;
}
