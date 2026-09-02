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

function isPaperColor(fill: string): boolean {
  const rgb = hexToRgb(fill);
  if (!rgb) return /^(?:#fff(?:fff)?|white)$/i.test(fill);
  const luma = rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114;
  const chroma = Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
  return luma > 242 && chroma < 18;
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
 * Keep one even-odd path per colour. Drop full-frame paper so counters (O/S/0)
 * stay holes instead of getting filled by the letter colour. Do not flatten
 * fills to black, and do not strip small drips.
 */
export function cleanupTracedSvg(svg: string, width = 0, height = 0): string {
  const size = readSvgSize(svg, width, height);
  const canvasArea = Math.max(1, size.width * size.height);
  const byFill = new Map<string, string[]>();

  const re = /<path\b([^>]*)\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(svg)) !== null) {
    const attrs = match[1];
    const fill = parseFill(attrs);
    const d = parseAttr(attrs, 'd');
    if (!fill || !d) continue;
    const rounded = roundPathD(d);
    if (!/[MLCQ]/i.test(rounded)) continue;
    const area = pathBBoxArea(rounded);
    if (area < 1) continue;
    const paper = isPaperColor(fill);
    if (paper) continue;
    if (area / canvasArea > 0.98) continue;
    const list = byFill.get(fill) ?? [];
    list.push(rounded);
    byFill.set(fill, list);
  }

  const w = Math.round(size.width * 10) / 10;
  const h = Math.round(size.height * 10) / 10;
  const paths: string[] = [];
  for (const [fill, ds] of byFill) {
    const d = ds.join(' ');
    paths.push(`<path fill="${fill}" fill-rule="evenodd" d="${d}"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${paths.join('')}</svg>`;
}
