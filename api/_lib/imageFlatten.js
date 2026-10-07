import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

function luminance(data, index) {
  return data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
}

function decodeRaster(bytes, contentType) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buf.length < 32) return null;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  if (isPng || contentType === 'image/png') {
    const png = PNG.sync.read(buf);
    return { width: png.width, height: png.height, data: png.data };
  }
  if (isJpeg || contentType === 'image/jpeg') {
    const raw = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 64 });
    return { width: raw.width, height: raw.height, data: raw.data };
  }
  return null;
}

function cornerMedian(data, width, height) {
  const samples = [];
  const span = Math.min(8, width, height);
  const take = (x, y) => samples.push(luminance(data, (y * width + x) * 4));
  for (let y = 0; y < span; y += 1) {
    for (let x = 0; x < span; x += 1) {
      take(x, y);
      take(width - 1 - x, y);
      take(x, height - 1 - y);
      take(width - 1 - x, height - 1 - y);
    }
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] ?? 255;
}

function despeckle(png) {
  const { width, height, data } = png;
  const ink = (x, y) => data[(y * width + x) * 4] === 0;
  const clear = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (!ink(x, y)) continue;
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if ((dx || dy) && ink(x + dx, y + dy)) neighbors += 1;
        }
      }
      if (neighbors === 0) clear.push((y * width + x) * 4);
    }
  }
  for (const index of clear) {
    data[index] = 255;
    data[index + 1] = 255;
    data[index + 2] = 255;
    data[index + 3] = 255;
  }
}

/**
 * Snap a generated raster to solid black ink on white paper.
 * Gray backgrounds and anti-aliased fringes become extra cut paths.
 */
export function flattenArtworkBytes(bytes, contentType) {
  try {
    const decoded = decodeRaster(bytes, contentType);
    if (!decoded || decoded.width < 8 || decoded.height < 8) {
      return { bytes, contentType };
    }
    const { width, height, data } = decoded;
    const paper = cornerMedian(data, width, height);
    const lightPaper = paper >= 128;
    const cutoff = lightPaper ? Math.max(90, paper - 36) : Math.min(170, paper + 36);
    const png = new PNG({ width, height });
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const lum = luminance(data, index);
        const ink = lightPaper ? lum < cutoff : lum > cutoff;
        const value = ink ? 0 : 255;
        png.data[index] = value;
        png.data[index + 1] = value;
        png.data[index + 2] = value;
        png.data[index + 3] = 255;
      }
    }
    despeckle(png);
    return { bytes: PNG.sync.write(png), contentType: 'image/png' };
  } catch {
    return { bytes, contentType };
  }
}
