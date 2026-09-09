import { bboxOverlapArea, mergeSameColorDs, pathBBox, type BBox } from './pathContours.ts';

function roundPathD(d: string): string {
  return d.replace(/-?\d+\.\d+/g, (token) => {
    const r = Math.round(Number(token) * 10) / 10;
    return Object.is(r, -0) ? '0' : String(r);
  });
}

function parseAttr(attrs: string, name: string): string | null {
  const match = attrs.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'));
  return match ? match[1] : null;
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function parseFill(attrs: string): string | null {
  const raw = parseAttr(attrs, 'fill');
  if (!raw || raw === 'none' || raw === 'transparent') return null;
  const hex = raw.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return `#${h.slice(0, 6).toUpperCase()}`;
  }
  const rgb = raw.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (rgb) return rgbToHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
  return raw;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9A-F]{6})$/.exec(hex);
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function lumaOf(rgb: { r: number; g: number; b: number }): number {
  return rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114;
}

function chromaOf(rgb: { r: number; g: number; b: number }): number {
  return Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
}

function isPaperColor(fill: string): boolean {
  const rgb = hexToRgb(fill);
  if (!rgb) return /^(?:#fff(?:fff)?|white)$/i.test(fill);
  // Quantized paper / AA hole plugs land around #F0–#F3, not only #FFF.
  return lumaOf(rgb) > 230 && chromaOf(rgb) < 20;
}

/** Mid-grey AA fringe (low chroma, neither paper nor ink). */
function isGreyFringeFill(fill: string): boolean {
  const rgb = hexToRgb(fill);
  if (!rgb) return false;
  const y = lumaOf(rgb);
  return chromaOf(rgb) < 22 && y > 48 && y < 210;
}

function fillLuma(fill: string): number {
  const rgb = hexToRgb(fill);
  return rgb ? lumaOf(rgb) : 255;
}

/**
 * VTracer often emits a path whose first command is `L` (absolute lineto)
 * with no current point. SVG then strokes from (0,0). After `Z`, a following
 * `L` is a new subpath and must move, not draw a seam to the previous close.
 */
export function normalizeTracedPathD(d: string): string {
  let s = roundPathD(d).trim();
  if (!s) return s;
  if (!/^[Mm]/.test(s)) {
    s = s.replace(/^[LlCcQqSsTt]/, (cmd) => (cmd === cmd.toUpperCase() ? 'M' : 'm'));
  }
  return s.replace(/([Zz])\s*([Ll])/g, (_full, close: string, cmd: string) =>
    `${close} ${cmd === 'L' ? 'M' : 'm'}`,
  );
}

function pathBBoxArea(d: string): number {
  const nums = d.match(/-?\d*\.?\d+/g);
  if (!nums || nums.length < 4) return 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = Number(nums[i]);
    const y = Number(nums[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return 0;
  return Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
}

function readSvgSize(svg: string, fallbackW: number, fallbackH: number): { width: number; height: number } {
  const w = Number(/width="([\d.]+)"/.exec(svg)?.[1]);
  const h = Number(/height="([\d.]+)"/.exec(svg)?.[1]);
  const vb = /viewBox="\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)"/.exec(svg);
  return {
    width: Number.isFinite(w) && w > 0 ? w : Number(vb?.[1]) || fallbackW,
    height: Number.isFinite(h) && h > 0 ? h : Number(vb?.[2]) || fallbackH,
  };
}

/**
 * Drop full-frame paper so counters (O/S/0) stay holes.
 * Drop mid-grey AA fringe paths that overlap a darker fill — those stacked
 * greys are the jagged "shards" of under-colour, not missing fill-rule.
 * Union overlapping same-colour contours; concatenate disjoint ones so
 * evenodd does not punch AA rings. Keep fill-rule=evenodd per path.
 */
export function cleanupTracedSvg(svg: string, width = 0, height = 0): string {
  const parsed = readSvgSize(svg, width, height);
  const size = {
    width: parsed.width > 0 ? parsed.width : width,
    height: parsed.height > 0 ? parsed.height : height,
  };
  const canvasArea = Math.max(1, size.width * size.height);
  type Kept = { fill: string; d: string; bbox: BBox };
  const kept: Kept[] = [];

  const re = /<path\b([^>]*)\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(svg)) !== null) {
    const attrs = match[1];
    const fill = parseFill(attrs);
    const d = parseAttr(attrs, 'd');
    if (!fill || !d) continue;
    const normalized = normalizeTracedPathD(d);
    if (!/[MLCQ]/i.test(normalized)) continue;
    const area = pathBBoxArea(normalized);
    if (area < 1) continue;
    if (isPaperColor(fill)) continue;
    // Cutout layers often span the whole artboard. Drop only light
    // full-frame fills (paper / hole plugs) — dark ink must stay.
    if (area / canvasArea > 0.98 && fillLuma(fill) > 200) continue;
    const bbox = pathBBox(normalized);
    if (!bbox) continue;
    kept.push({ fill, d: normalized, bbox });
  }

  const darker = kept.filter((p) => !isGreyFringeFill(p.fill));
  const afterGrey = kept.filter((p) => {
    if (!isGreyFringeFill(p.fill)) return true;
    const y = fillLuma(p.fill);
    return !darker.some((ink) => fillLuma(ink.fill) < y - 8 && bboxOverlapArea(p.bbox, ink.bbox) > 4);
  });

  const byColor = new Map<string, string[]>();
  for (const p of afterGrey) {
    const list = byColor.get(p.fill) ?? [];
    list.push(p.d);
    byColor.set(p.fill, list);
  }

  const paths: string[] = [];
  const ordered = [...byColor.entries()].sort((a, b) => fillLuma(b[0]) - fillLuma(a[0]));
  for (const [fill, ds] of ordered) {
    const united = mergeSameColorDs(ds);
    if (!united) continue;
    paths.push(`<path fill="${fill}" fill-rule="evenodd" d="${united}"/>`);
  }

  const w = Math.round(size.width * 10) / 10;
  const h = Math.round(size.height * 10) / 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet">${paths.join('')}</svg>`;
}

export type StackedLayerPreview = {
  id: string;
  fill: string;
  label: string;
};

function layerLabel(id: string, fill: string): string {
  if (id === 'layer-silhouette' || /silhouette/i.test(id)) return 'Silhouette';
  return fill.toUpperCase();
}

function parseGroupFill(attrs: string, fallback: string): string {
  return parseFill(attrs) || fallback;
}

/**
 * Keep SvgTrace-style `<g id="layer-…">` sheets. Do not merge colours or
 * drop the black underbase even when it spans most of the frame.
 */
export function cleanupStackedTracedSvg(svg: string, width = 0, height = 0): string {
  const parsed = readSvgSize(svg, width, height);
  const size = {
    width: parsed.width > 0 ? parsed.width : width,
    height: parsed.height > 0 ? parsed.height : height,
  };
  const layers: { id: string; fill: string; ds: string[] }[] = [];
  const groupRe = /<g\b([^>]*)>([\s\S]*?)<\/g>/gi;
  let groupMatch: RegExpExecArray | null;
  while ((groupMatch = groupRe.exec(svg)) !== null) {
    const attrs = groupMatch[1];
    const body = groupMatch[2];
    const id = parseAttr(attrs, 'id') || `layer-${layers.length + 1}`;
    let fill = parseGroupFill(attrs, '#000000');
    const ds: string[] = [];
    const pathRe = /<path\b([^>]*)\/?>/gi;
    let pathMatch: RegExpExecArray | null;
    while ((pathMatch = pathRe.exec(body)) !== null) {
      const pathAttrs = pathMatch[1];
      const pathFill = parseFill(pathAttrs);
      if (pathFill) fill = pathFill;
      const d = parseAttr(pathAttrs, 'd');
      if (!d) continue;
      const normalized = normalizeTracedPathD(d);
      if (!/[MLCQ]/i.test(normalized) || pathBBoxArea(normalized) < 1) continue;
      if (pathFill && isPaperColor(pathFill)) continue;
      ds.push(normalized);
    }
    if (!ds.length) continue;
    if (isPaperColor(fill) && id !== 'layer-silhouette') continue;
    layers.push({ id, fill, ds });
  }

  if (!layers.length) {
    const re = /<path\b([^>]*)\/?>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(svg)) !== null) {
      const attrs = match[1];
      const fill = parseFill(attrs);
      const d = parseAttr(attrs, 'd');
      if (!fill || !d || isPaperColor(fill)) continue;
      const normalized = normalizeTracedPathD(d);
      if (!/[MLCQ]/i.test(normalized) || pathBBoxArea(normalized) < 1) continue;
      layers.push({
        id: fill === '#000000' ? 'layer-silhouette' : `layer-${fill.slice(1).toLowerCase()}`,
        fill,
        ds: [normalized],
      });
    }
  }

  const w = Math.round(size.width * 10) / 10;
  const h = Math.round(size.height * 10) / 10;
  const body = layers.map((layer) => {
    const paths = layer.ds
      .map((d) => `<path fill="${layer.fill}" fill-rule="evenodd" d="${d}"/>`)
      .join('');
    return `<g id="${layer.id}" fill="${layer.fill}">${paths}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}

export function listStackedLayers(svg: string): StackedLayerPreview[] {
  const layers: StackedLayerPreview[] = [];
  const groupRe = /<g\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = groupRe.exec(svg)) !== null) {
    const attrs = match[1];
    const id = parseAttr(attrs, 'id') || `layer-${layers.length + 1}`;
    const fill = parseFill(attrs) || '#000000';
    layers.push({ id, fill, label: layerLabel(id, fill) });
  }
  return layers;
}

export function cleanupTraceSvg(
  svg: string,
  width = 0,
  height = 0,
  hierarchical: 'cutout' | 'stacked' = 'cutout',
): string {
  return hierarchical === 'stacked'
    ? cleanupStackedTracedSvg(svg, width, height)
    : cleanupTracedSvg(svg, width, height);
}
