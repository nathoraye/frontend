/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fabric from 'fabric';
import * as clipperLib from 'clipper-lib';
import { flattenPathD, orientContoursForNonZero } from './pathContours';

type ClipperPoint = { X: number; Y: number };
type ClipperPath = ClipperPoint[];

const CLIPPER_SCALE = 1000;

function toClipper(points: Array<{ x: number; y: number }>): ClipperPath {
  return points.map((pt) => ({ X: Math.round(pt.x * CLIPPER_SCALE), Y: Math.round(pt.y * CLIPPER_SCALE) }));
}

function fromClipper(path: ClipperPath): Array<{ x: number; y: number }> {
  return path.map((pt) => ({ x: pt.X / CLIPPER_SCALE, y: pt.Y / CLIPPER_SCALE }));
}

function canvasPointToImagePixel(target: fabric.Image, point: { x: number; y: number }) {
  const inv = fabric.util.invertTransform(target.calcTransformMatrix());
  const local = fabric.util.transformPoint(new fabric.Point(point.x, point.y), inv);
  const width = target.width || 0;
  const height = target.height || 0;
  const originX = target.originX === 'center' ? width / 2 : target.originX === 'right' ? width : 0;
  const originY = target.originY === 'center' ? height / 2 : target.originY === 'bottom' ? height : 0;
  return { x: local.x + originX, y: local.y + originY };
}

function pathToD(path: fabric.Path): string {
  const data = (path as any).path;
  if (!data) return '';
  if (typeof data === 'string') return data;
  try {
    return fabric.util.joinPath(data);
  } catch {
    return '';
  }
}

function samplePathPoints(path: fabric.Path, spacing = 2): Array<{ x: number; y: number }> {
  const d = pathToD(path);
  if (!d) return [];
  const parsed = fabric.util.parsePath(d);
  const simple = fabric.util.makePathSimpler(parsed);
  const matrix = path.calcTransformMatrix();
  const offset = (path as any).pathOffset || new fabric.Point(0, 0);
  const transformed = fabric.util.transformPath(simple, matrix, offset);
  const infos = fabric.util.getPathSegmentsInfo(transformed);
  const total = infos.reduce((sum, info) => sum + (info.length || 0), 0);
  if (total < 1) {
    return transformed.flatMap((cmd) => {
      if (cmd.length >= 3 && typeof cmd[cmd.length - 2] === 'number') {
        return [{ x: Number(cmd[cmd.length - 2]), y: Number(cmd[cmd.length - 1]) }];
      }
      return [];
    });
  }
  const points: Array<{ x: number; y: number }> = [];
  for (let dist = 0; dist <= total; dist += spacing) {
    const pt = fabric.util.getPointOnPath(transformed, dist, infos);
    if (pt) points.push({ x: pt.x, y: pt.y });
  }
  return points;
}

function offsetStrokeToPolygon(points: Array<{ x: number; y: number }>, radius: number): ClipperPath[] {
  if (points.length < 2) return [];
  const offset = new clipperLib.ClipperOffset(2, 0.25);
  offset.AddPath(toClipper(points), clipperLib.JoinType.jtRound, clipperLib.EndType.etOpenRound);
  const solution: ClipperPath[] = [];
  offset.Execute(solution, radius * CLIPPER_SCALE);
  return solution;
}

function pathToWorldContours(path: fabric.Path): Array<Array<{ x: number; y: number }>> {
  const d = pathToD(path);
  if (!d) return [];
  const matrix = path.calcTransformMatrix();
  const offset = (path as any).pathOffset || new fabric.Point(0, 0);
  return orientContoursForNonZero(flattenPathD(d)).map((pts) =>
    pts.map((pt) => {
      const world = fabric.util.transformPoint(new fabric.Point(pt.x - offset.x, pt.y - offset.y), matrix);
      return { x: world.x, y: world.y };
    }),
  );
}

function objectToClipperPaths(obj: fabric.Object): ClipperPath[] {
  const matrix = obj.calcTransformMatrix();
  const transformLocal = (x: number, y: number) => {
    const pt = fabric.util.transformPoint(new fabric.Point(x, y), matrix);
    return { x: pt.x, y: pt.y };
  };

  if (obj.type === 'path') {
    return pathToWorldContours(obj as fabric.Path)
      .filter((pts) => pts.length >= 3)
      .map(toClipper);
  }

  if (obj.type === 'polygon' || obj.type === 'polyline') {
    const poly = obj as fabric.Polygon;
    const width = poly.width || 0;
    const height = poly.height || 0;
    const pts = (poly.points || []).map((pt) => transformLocal(pt.x - width / 2, pt.y - height / 2));
    if (pts.length < 3) return [];
    return [toClipper(pts)];
  }

  if (obj.type === 'rect' || obj.type === 'triangle') {
    const width = obj.width || 0;
    const height = obj.height || 0;
    const hw = width / 2;
    const hh = height / 2;
    const corners =
      obj.type === 'triangle'
        ? [transformLocal(0, -hh), transformLocal(hw, hh), transformLocal(-hw, hh)]
        : [transformLocal(-hw, -hh), transformLocal(hw, -hh), transformLocal(hw, hh), transformLocal(-hw, hh)];
    return [toClipper(corners)];
  }

  if (obj.type === 'circle' || obj.type === 'ellipse') {
    const rx = (obj as fabric.Circle).radius
      ? (obj as fabric.Circle).radius || 0
      : (obj.width || 0) / 2;
    const ry = obj.type === 'ellipse' ? (obj.height || 0) / 2 : rx;
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 64; i += 1) {
      const a = (i / 64) * Math.PI * 2;
      pts.push(transformLocal(Math.cos(a) * rx, Math.sin(a) * ry));
    }
    return [toClipper(pts)];
  }

  return [];
}

function clipperPathsToFabricPath(paths: ClipperPath[], fill: unknown): fabric.Path | null {
  if (!paths.length) return null;
  let d = '';
  paths.forEach((path) => {
    const pts = fromClipper(path);
    if (pts.length < 3) return;
    d += `M ${pts[0].x} ${pts[0].y} `;
    for (let i = 1; i < pts.length; i += 1) d += `L ${pts[i].x} ${pts[i].y} `;
    d += 'Z ';
  });
  if (!d) return null;
  return new fabric.Path(d, {
    fill: (fill as string) || '#FF1493',
    stroke: '',
    strokeWidth: 0,
    fillRule: 'evenodd',
    originX: 'center',
    originY: 'center',
    cornerColor: '#FF1493',
    transparentCorners: false,
    cornerStyle: 'circle',
    objectCaching: true,
  });
}

function differencePaths(subjects: ClipperPath[], clips: ClipperPath[]): ClipperPath[] {
  const clipper = new clipperLib.Clipper();
  clipper.AddPaths(subjects, clipperLib.PolyType.ptSubject, true);
  clipper.AddPaths(clips, clipperLib.PolyType.ptClip, true);
  const solution: ClipperPath[] = [];
  clipper.Execute(
    clipperLib.ClipType.ctDifference,
    solution,
    clipperLib.PolyFillType.pftNonZero,
    clipperLib.PolyFillType.pftNonZero,
  );
  return solution;
}

async function replaceObject(canvas: fabric.Canvas, original: fabric.Object, next: fabric.Object) {
  // `next` path data is already in scene coordinates (Clipper world space).
  // Re-centering on the original bbox would shift remaining geometry after a side erase.
  next.setCoords();
  canvas.remove(original);
  canvas.add(next);
  canvas.setActiveObject(next);
}

function childFill(obj: fabric.Object): unknown {
  const fill = (obj as any).fill;
  if (fill && fill !== 'transparent' && fill !== 'none') return fill;
  return (obj as any).stroke || '#FF1493';
}

export async function eraseRasterImage(
  canvas: fabric.Canvas,
  target: fabric.Image,
  strokePath: fabric.Path,
): Promise<boolean> {
  const imgEl = target.getElement() as HTMLImageElement | undefined;
  if (!imgEl) return false;

  const width = imgEl.naturalWidth || imgEl.width;
  const height = imgEl.naturalHeight || imgEl.height;
  if (!width || !height) return false;

  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const ctx = off.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;

  ctx.drawImage(imgEl, 0, 0);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const avgScale = ((target.scaleX || 1) + (target.scaleY || 1)) / 2;
  ctx.lineWidth = Math.max(1, (strokePath.strokeWidth || 8) / avgScale);

  const d = pathToD(strokePath);
  if (!d) return false;

  const parsed = fabric.util.parsePath(d);
  const simple = fabric.util.makePathSimpler(parsed);
  const matrix = strokePath.calcTransformMatrix();
  const offset = (strokePath as any).pathOffset || new fabric.Point(0, 0);
  const transformed = fabric.util.transformPath(simple, matrix, offset);

  ctx.beginPath();
  transformed.forEach((cmd) => {
    const type = cmd[0];
    if (type === 'M') {
      const pt = canvasPointToImagePixel(target, { x: Number(cmd[1]), y: Number(cmd[2]) });
      ctx.moveTo(pt.x, pt.y);
    } else if (type === 'L') {
      const pt = canvasPointToImagePixel(target, { x: Number(cmd[1]), y: Number(cmd[2]) });
      ctx.lineTo(pt.x, pt.y);
    } else if (type === 'Q') {
      const c = canvasPointToImagePixel(target, { x: Number(cmd[1]), y: Number(cmd[2]) });
      const p = canvasPointToImagePixel(target, { x: Number(cmd[3]), y: Number(cmd[4]) });
      ctx.quadraticCurveTo(c.x, c.y, p.x, p.y);
    } else if (type === 'C') {
      const c1 = canvasPointToImagePixel(target, { x: Number(cmd[1]), y: Number(cmd[2]) });
      const c2 = canvasPointToImagePixel(target, { x: Number(cmd[3]), y: Number(cmd[4]) });
      const p = canvasPointToImagePixel(target, { x: Number(cmd[5]), y: Number(cmd[6]) });
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p.x, p.y);
    }
  });
  ctx.stroke();

  const nextImg = await fabric.Image.fromURL(off.toDataURL('image/png'));
  nextImg.set({
    originX: target.originX,
    originY: target.originY,
    left: target.left,
    top: target.top,
    scaleX: target.scaleX,
    scaleY: target.scaleY,
    angle: target.angle,
    cornerColor: '#FF1493',
    transparentCorners: false,
    cornerStyle: 'circle',
    objectCaching: true,
  });
  canvas.remove(target);
  canvas.add(nextImg);
  canvas.setActiveObject(nextImg);
  return true;
}

function eraseVectorChildren(
  children: fabric.Object[],
  clips: ClipperPath[],
): fabric.Object[] | null {
  const nextChildren: fabric.Object[] = [];
  for (const child of children) {
    const subjects = objectToClipperPaths(child);
    if (!subjects.length) return null;
    const result = differencePaths(subjects, clips);
    if (!result.length) continue;
    const next = clipperPathsToFabricPath(result, childFill(child));
    if (!next) return null;
    nextChildren.push(next);
  }
  return nextChildren;
}

function eraseVectorObject(canvas: fabric.Canvas, target: fabric.Object, strokePath: fabric.Path): boolean {
  const strokePts = samplePathPoints(strokePath, 1.5);
  const clips = offsetStrokeToPolygon(strokePts, Math.max(1, (strokePath.strokeWidth || 8) / 2));
  if (!clips.length) return false;

  const isGroup = target.type === 'group' || target.type === 'activeSelection';
  if (isGroup) {
    const children = (target as fabric.Group).getObjects();
    const nextChildren = eraseVectorChildren(children, clips);
    if (!nextChildren) return false;
    if (!nextChildren.length) {
      canvas.remove(target);
      return true;
    }
    if (nextChildren.length === 1) {
      void replaceObject(canvas, target, nextChildren[0]);
      return true;
    }
    const nextGroup = new fabric.Group(nextChildren, {
      originX: 'center',
      originY: 'center',
      cornerColor: '#FF1493',
      transparentCorners: false,
      cornerStyle: 'circle',
      objectCaching: true,
      subTargetCheck: false,
    });
    void replaceObject(canvas, target, nextGroup);
    return true;
  }

  const subjects = objectToClipperPaths(target);
  if (!subjects.length) return false;

  const result = differencePaths(subjects, clips);
  if (!result.length) {
    canvas.remove(target);
    return true;
  }

  const next = clipperPathsToFabricPath(result, childFill(target));
  if (!next) return false;
  void replaceObject(canvas, target, next);
  return true;
}

async function eraseVectorByRaster(
  canvas: fabric.Canvas,
  target: fabric.Object,
  strokePath: fabric.Path,
): Promise<boolean> {
  const el = (target as fabric.Object & { toCanvasElement?: (mult?: number) => HTMLCanvasElement }).toCanvasElement?.(2);
  if (!el) return false;
  const ctx = el.getContext('2d');
  if (!ctx) return false;

  const bounds = target.getBoundingRect();
  const scaleX = el.width / Math.max(1, bounds.width);
  const scaleY = el.height / Math.max(1, bounds.height);

  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, (strokePath.strokeWidth || 8) * ((scaleX + scaleY) / 2));
  ctx.strokeStyle = '#000';

  const points = samplePathPoints(strokePath, 1.5);
  if (points.length < 2) return false;
  ctx.beginPath();
  points.forEach((pt, i) => {
    const x = (pt.x - bounds.left) * scaleX;
    const y = (pt.y - bounds.top) * scaleY;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const nextImg = await fabric.Image.fromURL(el.toDataURL('image/png'));
  nextImg.set({
    originX: 'center',
    originY: 'center',
    left: bounds.left + bounds.width / 2,
    top: bounds.top + bounds.height / 2,
    scaleX: 1 / 2,
    scaleY: 1 / 2,
    cornerColor: '#FF1493',
    transparentCorners: false,
    cornerStyle: 'circle',
    objectCaching: true,
  });
  canvas.remove(target);
  canvas.add(nextImg);
  canvas.setActiveObject(nextImg);
  return true;
}

export async function applyEraserStroke(
  canvas: fabric.Canvas,
  strokePath: fabric.Path,
  target: fabric.Object | null,
  mode: 'layer' | 'canvas',
): Promise<boolean> {
  const targets: fabric.Object[] = [];
  if (mode === 'layer') {
    if (!target) return false;
    targets.push(target);
  } else {
    canvas.getObjects().forEach((obj) => {
      if (obj === strokePath) return;
      if (obj.intersectsWithObject?.(strokePath) || strokePath.intersectsWithObject?.(obj)) {
        targets.push(obj);
      }
    });
  }

  let changed = false;
  for (const obj of targets) {
    if ((obj.type || '').toLowerCase() === 'image') {
      changed = (await eraseRasterImage(canvas, obj as fabric.Image, strokePath)) || changed;
    } else {
      changed = eraseVectorObject(canvas, obj, strokePath) || (await eraseVectorByRaster(canvas, obj, strokePath)) || changed;
    }
  }
  return changed;
}
