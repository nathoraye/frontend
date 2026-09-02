/** Round path numbers to 1 decimal and convert ImageTracer Q segments to cubics. */
function convertPathData(d: string): string {
  const tokens = d.trim().split(/[\s,]+/).filter(Boolean);
  const out: string[] = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;

  const num = (n: number) => {
    const r = Math.round(n * 10) / 10;
    return Object.is(r, -0) ? 0 : r;
  };

  while (i < tokens.length) {
    const cmd = tokens[i];
    if (!/^[A-Za-z]$/.test(cmd)) {
      i++;
      continue;
    }
    i++;
    if (cmd === 'Z' || cmd === 'z') {
      out.push('Z');
      cx = startX;
      cy = startY;
      continue;
    }
    if (cmd === 'M' || cmd === 'L') {
      while (i + 1 < tokens.length && !/^[A-Za-z]$/.test(tokens[i])) {
        const x = Number(tokens[i]);
        const y = Number(tokens[i + 1]);
        i += 2;
        if (!Number.isFinite(x) || !Number.isFinite(y)) break;
        out.push(cmd, String(num(x)), String(num(y)));
        cx = x;
        cy = y;
        if (cmd === 'M') {
          startX = x;
          startY = y;
        }
      }
      continue;
    }
    if (cmd === 'Q') {
      while (i + 3 < tokens.length && !/^[A-Za-z]$/.test(tokens[i])) {
        const x1 = Number(tokens[i]);
        const y1 = Number(tokens[i + 1]);
        const x = Number(tokens[i + 2]);
        const y = Number(tokens[i + 3]);
        i += 4;
        if (![x1, y1, x, y].every(Number.isFinite)) break;
        const c1x = cx + (2 / 3) * (x1 - cx);
        const c1y = cy + (2 / 3) * (y1 - cy);
        const c2x = x + (2 / 3) * (x1 - x);
        const c2y = y + (2 / 3) * (y1 - y);
        out.push('C', String(num(c1x)), String(num(c1y)), String(num(c2x)), String(num(c2y)), String(num(x)), String(num(y)));
        cx = x;
        cy = y;
      }
      continue;
    }
    if (cmd === 'C') {
      while (i + 5 < tokens.length && !/^[A-Za-z]$/.test(tokens[i])) {
        const vals = tokens.slice(i, i + 6).map(Number);
        i += 6;
        if (!vals.every(Number.isFinite)) break;
        out.push('C', ...vals.map((v) => String(num(v))));
        cx = vals[4];
        cy = vals[5];
      }
      continue;
    }
  }
  return out.join(' ');
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

function isPaperFill(attrs: string): boolean {
  return /fill="(?:rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)|#fff(?:fff)?|white)"/i.test(attrs);
}

/**
 * Production cleanup: even-odd fills, no stroke halo, 1-decimal cubics,
 * drop paper/full-frame/zero-area/duplicate paths, proper viewBox.
 */
export function cleanupTracedSvg(svg: string, width: number, height: number): string {
  const canvasArea = Math.max(1, width * height);
  const seen = new Set<string>();
  const paths: string[] = [];

  const re = /<path\b([^>]*)\sd="([^"]*)"([^>]*)\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(svg)) !== null) {
    const attrs = `${match[1]} ${match[3]}`;
    if (isPaperFill(attrs)) continue;
    const d = convertPathData(match[2]);
    if (!/[CL]/.test(d)) continue;
    const area = pathBBoxArea(d);
    if (area < 4) continue;
    if (area / canvasArea > 0.82) continue;
    const key = d.replace(/\.0\b/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    paths.push(
      `<path fill="#000000" fill-rule="evenodd" d="${d}"/>`,
    );
  }

  const w = Math.round(width * 10) / 10;
  const h = Math.round(height * 10) / 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${paths.join('')}</svg>`;
}
