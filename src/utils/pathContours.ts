import * as clipperNs from 'clipper-lib';

const clipperLib = (clipperNs as { Clipper?: unknown; default?: object }).Clipper
  ? clipperNs
  : ((clipperNs as { default: typeof clipperNs }).default);

export type Pt = { x: number; y: number };
export type BBox = { minX: number; minY: number; maxX: number; maxY: number };
type ClipperPath = Array<{ X: number; Y: number }>;

const CLIPPER_SCALE = 1000;
const CURVE_STEPS = 8;

function toClipper(points: Pt[]): ClipperPath {
  return points.map((pt) => ({ X: Math.round(pt.x * CLIPPER_SCALE), Y: Math.round(pt.y * CLIPPER_SCALE) }));
}

function fromClipper(path: ClipperPath): Pt[] {
  return path.map((pt) => ({ x: pt.X / CLIPPER_SCALE, y: pt.Y / CLIPPER_SCALE }));
}

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return {
    x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
    y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y,
  };
}

function quad(p0: Pt, p1: Pt, p2: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

/** Flatten an SVG path `d` into closed contours (line strings), one per subpath. */
export function flattenPathD(d: string): Pt[][] {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  const contours: Pt[][] = [];
  let cur: Pt[] = [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let prev = '';
  let lx = 0;
  let ly = 0;
  let i = 0;

  const num = () => Number(tokens[i++]);
  const push = (pt: Pt) => {
    const last = cur[cur.length - 1];
    if (!last || last.x !== pt.x || last.y !== pt.y) cur.push(pt);
  };
  const close = () => {
    if (cur.length >= 3) contours.push(cur);
    cur = [];
  };

  while (i < tokens.length) {
    const raw = tokens[i];
    const isCmd = /^[A-Za-z]$/.test(raw);
    const cmd = isCmd ? raw : prev;
    if (isCmd) i += 1;
    if (!cmd) break;
    const lastCmd = prev;
    const rel = cmd === cmd.toLowerCase();
    const c = cmd.toUpperCase();
    prev = cmd;

    if (c === 'Z') {
      x = sx;
      y = sy;
      push({ x, y });
      close();
      prev = '';
      continue;
    }
    if (c === 'M') {
      close();
      x = rel ? x + num() : num();
      y = rel ? y + num() : num();
      sx = x;
      sy = y;
      cur = [{ x, y }];
      prev = rel ? 'l' : 'L';
      continue;
    }
    if (c === 'L') {
      x = rel ? x + num() : num();
      y = rel ? y + num() : num();
      push({ x, y });
      continue;
    }
    if (c === 'H') {
      x = rel ? x + num() : num();
      push({ x, y });
      continue;
    }
    if (c === 'V') {
      y = rel ? y + num() : num();
      push({ x, y });
      continue;
    }
    if (c === 'C') {
      const x1 = rel ? x + num() : num();
      const y1 = rel ? y + num() : num();
      const x2 = rel ? x + num() : num();
      const y2 = rel ? y + num() : num();
      const x3 = rel ? x + num() : num();
      const y3 = rel ? y + num() : num();
      const p0 = { x, y };
      const p1 = { x: x1, y: y1 };
      const p2 = { x: x2, y: y2 };
      const p3 = { x: x3, y: y3 };
      for (let s = 1; s <= CURVE_STEPS; s++) push(cubic(p0, p1, p2, p3, s / CURVE_STEPS));
      lx = x2;
      ly = y2;
      x = x3;
      y = y3;
      continue;
    }
    if (c === 'Q') {
      const x1 = rel ? x + num() : num();
      const y1 = rel ? y + num() : num();
      const x2 = rel ? x + num() : num();
      const y2 = rel ? y + num() : num();
      const p0 = { x, y };
      const p1 = { x: x1, y: y1 };
      const p2 = { x: x2, y: y2 };
      for (let s = 1; s <= CURVE_STEPS; s++) push(quad(p0, p1, p2, s / CURVE_STEPS));
      lx = x1;
      ly = y1;
      x = x2;
      y = y2;
      continue;
    }
    if (c === 'S') {
      const smooth = lastCmd.toUpperCase() === 'C' || lastCmd.toUpperCase() === 'S';
      const x1 = smooth ? 2 * x - lx : x;
      const y1 = smooth ? 2 * y - ly : y;
      const x2 = rel ? x + num() : num();
      const y2 = rel ? y + num() : num();
      const x3 = rel ? x + num() : num();
      const y3 = rel ? y + num() : num();
      const p0 = { x, y };
      const p1 = { x: x1, y: y1 };
      const p2 = { x: x2, y: y2 };
      const p3 = { x: x3, y: y3 };
      for (let s = 1; s <= CURVE_STEPS; s++) push(cubic(p0, p1, p2, p3, s / CURVE_STEPS));
      lx = x2;
      ly = y2;
      x = x3;
      y = y3;
      continue;
    }
    if (c === 'T') {
      const smooth = lastCmd.toUpperCase() === 'Q' || lastCmd.toUpperCase() === 'T';
      const x1 = smooth ? 2 * x - lx : x;
      const y1 = smooth ? 2 * y - ly : y;
      const x2 = rel ? x + num() : num();
      const y2 = rel ? y + num() : num();
      const p0 = { x, y };
      const p1 = { x: x1, y: y1 };
      const p2 = { x: x2, y: y2 };
      for (let s = 1; s <= CURVE_STEPS; s++) push(quad(p0, p1, p2, s / CURVE_STEPS));
      lx = x1;
      ly = y1;
      x = x2;
      y = y2;
      continue;
    }
    if (isCmd) continue;
    i += 1;
  }
  close();
  return contours;
}

function pointSegDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function rdpOpen(pts: Pt[], eps: number): Pt[] {
  if (pts.length <= 2) return pts;
  let maxD = 0;
  let idx = 0;
  const a = pts[0];
  const b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = pointSegDist(pts[i], a, b);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > eps) {
    const left = rdpOpen(pts.slice(0, idx + 1), eps);
    const right = rdpOpen(pts.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

/** Drop pixel-stair vertices; keep real corners (large deviation from the chord). */
export function simplifyClosedContour(pts: Pt[], epsilon = 1.6): Pt[] {
  let ring = pts;
  if (
    ring.length >= 2
    && ring[0].x === ring[ring.length - 1].x
    && ring[0].y === ring[ring.length - 1].y
  ) {
    ring = ring.slice(0, -1);
  }
  if (ring.length <= 3) return ring;
  const opened = rdpOpen(ring.concat([ring[0]]), epsilon);
  if (
    opened.length >= 2
    && opened[0].x === opened[opened.length - 1].x
    && opened[0].y === opened[opened.length - 1].y
  ) {
    return opened.slice(0, -1);
  }
  return opened;
}

function contourToD(pts: Pt[]): string {
  const ring = simplifyClosedContour(pts);
  if (ring.length < 3) return '';
  if (ring.length >= 8) {
    let d = `M${round(ring[0].x)},${round(ring[0].y)}`;
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const p0 = ring[(i - 1 + n) % n];
      const p1 = ring[i];
      const p2 = ring[(i + 1) % n];
      const p3 = ring[(i + 2) % n];
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += `C${round(c1x)},${round(c1y)} ${round(c2x)},${round(c2y)} ${round(p2.x)},${round(p2.y)}`;
    }
    return `${d}Z`;
  }
  let d = `M${round(ring[0].x)},${round(ring[0].y)}`;
  for (let i = 1; i < ring.length; i++) d += `L${round(ring[i].x)},${round(ring[i].y)}`;
  return `${d}Z`;
}

function contoursToD(contours: Pt[][]): string {
  return contours.map(contourToD).filter(Boolean).join('');
}

function round(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
}

function signedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  }
  return a / 2;
}

function pointInPoly(pt: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const hit = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

export function contourBBox(pts: Pt[]): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pt of pts) {
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }
  return { minX, minY, maxX, maxY };
}

export function pathBBox(d: string): BBox | null {
  const contours = flattenPathD(d);
  if (!contours.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pts of contours) {
    const b = contourBBox(pts);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

export function bboxOverlapArea(a: BBox, b: BBox): number {
  const x = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const y = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
  return x * y;
}

function bboxContains(outer: BBox, inner: BBox): boolean {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY;
}

/**
 * Evenodd nesting: reverse contained contours so Clipper nonzero union
 * keeps holes instead of filling them.
 */
export function orientContoursForNonZero(contours: Pt[][]): Pt[][] {
  const meta = contours.map((pts) => ({
    pts,
    area: Math.abs(signedArea(pts)),
    bbox: contourBBox(pts),
    sample: pts[0],
  }));
  meta.sort((a, b) => b.area - a.area);
  return meta.map((c, i) => {
    let depth = 0;
    for (let j = 0; j < i; j++) {
      if (bboxContains(meta[j].bbox, c.bbox) && pointInPoly(c.sample, meta[j].pts)) depth += 1;
    }
    const wantPositive = depth % 2 === 0;
    const positive = signedArea(c.pts) > 0;
    if (wantPositive === positive) return c.pts;
    return c.pts.slice().reverse();
  });
}

function contoursOverlap(a: Pt[][], b: Pt[][]): boolean {
  const ba = a.map(contourBBox);
  const bb = b.map(contourBBox);
  for (const x of ba) {
    for (const y of bb) {
      if (bboxOverlapArea(x, y) > 1) return true;
    }
  }
  return false;
}

/**
 * Merge same-colour path `d` strings.
 * Non-overlapping contours are concatenated (curves kept; evenodd will not punch).
 * Overlapping contours are Clipper-unioned so anti-aliased rings stay opaque.
 */
export function mergeSameColorDs(ds: string[]): string {
  const cleaned = ds.map((d) => d.trim()).filter(Boolean);
  if (cleaned.length <= 1) return cleaned[0] || '';

  const flattened = cleaned.map((d) => flattenPathD(d).filter((c) => c.length >= 3));
  let overlap = false;
  for (let i = 0; i < flattened.length && !overlap; i++) {
    for (let j = i + 1; j < flattened.length; j++) {
      if (contoursOverlap(flattened[i], flattened[j])) {
        overlap = true;
        break;
      }
    }
  }
  if (!overlap) return contoursToD(cleaned.flatMap((d) => flattenPathD(d)));
  return unionPathDs(cleaned);
}

/** Union overlapping contours of one colour. Holes (contained / opposite winding) stay holes. */
export function unionPathDs(ds: string[]): string {
  const contours = orientContoursForNonZero(ds.flatMap((d) => flattenPathD(d)).filter((c) => c.length >= 3));
  if (!contours.length) return '';
  if (contours.length === 1) return contoursToD(contours);

  const clipper = new clipperLib.Clipper();
  clipper.AddPaths(contours.map(toClipper), clipperLib.PolyType.ptSubject, true);
  const solution: ClipperPath[] = [];
  clipper.Execute(
    clipperLib.ClipType.ctUnion,
    solution,
    clipperLib.PolyFillType.pftNonZero,
    clipperLib.PolyFillType.pftNonZero,
  );
  if (!solution.length) return contoursToD(contours);
  return contoursToD(solution.map(fromClipper));
}
