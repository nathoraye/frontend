import type * as fabricNS from 'fabric';

export type TrackPoint = { x: number; y: number };

export type TrackLineStyle = {
  brushSize?: number;
  brushColor?: string;
  brushType?: 'round' | 'chisel';
};

type LineLike = { x2?: number; y2?: number };

export function uniqueTrackPoints(pts: TrackPoint[]): TrackPoint[] {
  return pts.filter((pt, idx, self) => {
    if (idx === 0) return true;
    const prev = self[idx - 1];
    return Math.abs(pt.x - prev.x) > 2 || Math.abs(pt.y - prev.y) > 2;
  });
}

/** Include the rubber-band endpoint so a one-finger drag is not thrown away. */
export function collectTrackPoints(
  points: TrackPoint[],
  activeLine?: LineLike | null,
): TrackPoint[] {
  const pts = [...points];
  if (activeLine && typeof activeLine.x2 === 'number' && typeof activeLine.y2 === 'number') {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(activeLine.x2 - last.x, activeLine.y2 - last.y) > 2) {
      pts.push({ x: activeLine.x2, y: activeLine.y2 });
    }
  }
  return uniqueTrackPoints(pts);
}

export function trackLineObjectProps(style: TrackLineStyle = {}) {
  const width = style.brushSize || 5;
  return {
    strokeWidth: width,
    stroke: style.brushColor || '#FF1493',
    strokeUniform: true,
    cornerColor: '#FF1493',
    transparentCorners: false,
    objectCaching: false,
    padding: Math.max(8, width),
    strokeLineCap: (style.brushType === 'chisel' ? 'square' : 'round') as 'square' | 'round',
    strokeLineJoin: (style.brushType === 'chisel' ? 'miter' : 'round') as 'miter' | 'round',
  };
}

export function createTrackLineShape(
  fabricLib: typeof fabricNS,
  points: TrackPoint[],
  options: TrackLineStyle & { closed?: boolean } = {},
): fabricNS.Object | null {
  const pts = uniqueTrackPoints(points);
  if (pts.length < 2) return null;
  const props = trackLineObjectProps(options);
  if (options.closed && pts.length >= 3) {
    return new fabricLib.Polygon(pts, { ...props, fill: 'rgba(255,255,255,0.01)' });
  }
  if (pts.length === 2) {
    return new fabricLib.Line([pts[0].x, pts[0].y, pts[1].x, pts[1].y], { ...props, fill: 'transparent' });
  }
  return new fabricLib.Polyline(pts, { ...props, fill: 'transparent' });
}
