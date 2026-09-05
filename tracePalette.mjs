/**
 * Force the inks a vinyl graphic actually uses into VTracer's palette.
 *
 * Auto-clustering often drops thin black outlines so they get absorbed into
 * the nearest fill (red letters lose their stroke; small numerals vanish).
 * We always reserve the darkest ink and the strongest chroma, then fill the
 * remaining slots from the biggest pixel buckets.
 */

export function extractInkPalette(data, width, height, maxColors) {
  const target = Math.max(2, Math.min(32, Math.round(maxColors) || 8));
  const counts = new Map();
  const n = width * height;

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const a = data[o + 3] ?? 255;
    if (a < 28) continue;
    const r = data[o] ?? 0;
    const g = data[o + 1] ?? 0;
    const b = data[o + 2] ?? 0;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const prev = counts.get(key);
    if (prev) {
      prev.count += 1;
      prev.r += r;
      prev.g += g;
      prev.b += b;
    } else {
      counts.set(key, { count: 1, r, g, b });
    }
  }

  const buckets = [...counts.values()]
    .map((bucket) => {
      const r = Math.round(bucket.r / bucket.count);
      const g = Math.round(bucket.g / bucket.count);
      const b = Math.round(bucket.b / bucket.count);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      return { r, g, b, count: bucket.count, lum, sat: maxC - minC };
    })
    .sort((a, b) => b.count - a.count);

  if (buckets.length === 0) return ['#000000', '#FFFFFF'];

  const picked = [];
  const tooClose = (c) =>
    picked.some((p) => {
      const inkBlack = p.r === 0 && p.g === 0 && p.b === 0;
      if (inkBlack && c.lum < 62 && c.r > c.g + 16 && c.r > c.b + 16) return true;
      if (inkBlack && c.lum < 55) return true;
      return Math.hypot(p.r - c.r, p.g - c.g, p.b - c.b) < 28;
    });

  const darkest = [...buckets].sort((a, b) => a.lum - b.lum || b.count - a.count)[0];
  if (darkest) {
    picked.push(darkest.lum < 55 ? { ...darkest, r: 0, g: 0, b: 0, lum: 0 } : darkest);
  }

  const chroma = [...buckets].sort((a, b) => b.sat - a.sat || b.count - a.count)[0];
  if (chroma && !tooClose(chroma)) picked.push(chroma);

  for (const c of buckets) {
    if (picked.length >= target) break;
    if (!tooClose(c)) picked.push(c);
  }

  return picked.slice(0, target).map(
    (c) =>
      `#${[c.r, c.g, c.b]
        .map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0'))
        .join('')}`,
  );
}

export function normalizePalette(palette) {
  if (!Array.isArray(palette)) return undefined;
  const hexes = palette
    .filter((s) => typeof s === 'string')
    .map((s) => {
      const raw = s.trim();
      const withHash = raw.startsWith('#') ? raw : `#${raw}`;
      return withHash.toLowerCase();
    })
    .filter((s) => /^#[0-9a-f]{6}$/.test(s));
  return hexes.length >= 2 ? hexes : undefined;
}
