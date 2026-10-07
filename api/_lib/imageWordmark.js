import { PNG } from 'pngjs';

/**
 * Stencil alphabet. The keyless image host draws a mascot instead of these
 * words, so logo prompts are set here as thick black letters on white.
 * Rows are top to bottom, 1 is ink.
 */
const RAW = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  6: ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  ' ': ['000', '000', '000', '000', '000', '000', '000'],
};

const GLYPHS = Object.fromEntries(
  Object.entries(RAW).map(([char, rows]) => [char, rows.map((row) => row.split('').map((bit) => bit === '1'))]),
);

const CANVAS = 1024;
const MAX_SCALE = 22;
const GAP_X = 3;
const GAP_Y = 3;

function packLines(text) {
  const words = String(text).toUpperCase().split(/\s+/).filter(Boolean).slice(0, 8);
  const lines = [];
  let current = '';
  for (const word of words) {
    const clipped = word.replace(/[^A-Z0-9-]/g, '').slice(0, 16);
    if (!clipped) continue;
    const next = current ? `${current} ${clipped}` : clipped;
    if (next.length > 12 && current) {
      lines.push(current);
      current = clipped;
    } else {
      current = next;
    }
    if (lines.length === 3) break;
  }
  if (current && lines.length < 3) lines.push(current);
  return lines.length ? lines : ['LOGO'];
}

function glyphOf(char) {
  return GLYPHS[char] || GLYPHS[' '];
}

function paintLines(lines) {
  const widths = lines.map((line) => {
    let width = 0;
    for (const char of line) width += glyphOf(char)[0].length + GAP_X;
    return Math.max(1, width - GAP_X);
  });
  const gridW = Math.max(...widths);
  const gridH = lines.length * 7 + (lines.length - 1) * GAP_Y;
  const ink = Array.from({ length: gridH }, () => Array(gridW).fill(false));
  lines.forEach((line, lineIndex) => {
    const y0 = lineIndex * (7 + GAP_Y);
    let x = Math.floor((gridW - widths[lineIndex]) / 2);
    for (const char of line) {
      const glyph = glyphOf(char);
      for (let gy = 0; gy < glyph.length; gy += 1) {
        for (let gx = 0; gx < glyph[gy].length; gx += 1) {
          if (glyph[gy][gx]) ink[y0 + gy][x + gx] = true;
        }
      }
      x += glyph[0].length + GAP_X;
    }
  });
  return ink;
}

function pad(grid, padding) {
  const height = grid.length;
  const width = grid[0].length;
  const out = Array.from({ length: height + padding * 2 }, () => Array(width + padding * 2).fill(false));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (grid[y][x]) out[y + padding][x + padding] = true;
    }
  }
  return out;
}

function dilate4(grid) {
  const height = grid.length;
  const width = grid[0].length;
  const out = grid.map((row) => row.slice());
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!grid[y][x]) continue;
      if (y > 0) out[y - 1][x] = true;
      if (y + 1 < height) out[y + 1][x] = true;
      if (x > 0) out[y][x - 1] = true;
      if (x + 1 < width) out[y][x + 1] = true;
    }
  }
  return out;
}

export function renderStencilWordmark(lettering) {
  const lines = packLines(lettering);
  const grid = dilate4(pad(paintLines(lines), 1));
  const scale = Math.max(
    1,
    Math.min(
      MAX_SCALE,
      Math.floor(880 / grid[0].length),
      Math.floor(640 / grid.length),
    ),
  );
  const drawnW = grid[0].length * scale;
  const drawnH = grid.length * scale;
  const originX = Math.floor((CANVAS - drawnW) / 2);
  const originY = Math.floor((CANVAS - drawnH) / 2);
  const png = new PNG({ width: CANVAS, height: CANVAS });
  png.data.fill(255);
  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < grid[y].length; x += 1) {
      if (!grid[y][x]) continue;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const px = originX + x * scale + dx;
          const py = originY + y * scale + dy;
          const i = (py * CANVAS + px) * 4;
          png.data[i] = 0;
          png.data[i + 1] = 0;
          png.data[i + 2] = 0;
          png.data[i + 3] = 255;
        }
      }
    }
  }
  return { bytes: PNG.sync.write(png), contentType: 'image/png' };
}
