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

function removeCornerMarks(png) {
  const { width, height, data } = png;
  const minY = Math.floor(height * 0.9);
  const minX = Math.floor(width * 0.55);
  const seen = new Uint8Array(width * height);
  const inside = (x, y) => x >= minX && x < width && y >= minY && y < height;
  for (let y = minY; y < height; y += 1) {
    for (let x = minX; x < width; x += 1) {
      const start = y * width + x;
      if (data[start * 4] !== 0 || seen[start]) continue;
      const stack = [start];
      seen[start] = 1;
      const pixels = [];
      let joinedToArtwork = false;
      while (stack.length) {
        const index = stack.pop();
        pixels.push(index);
        const py = Math.floor(index / width);
        const px = index - py * width;
        const neighbors = [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (data[(ny * width + nx) * 4] !== 0) continue;
          if (!inside(nx, ny)) {
            joinedToArtwork = true;
            continue;
          }
          const next = ny * width + nx;
          if (seen[next]) continue;
          seen[next] = 1;
          stack.push(next);
        }
      }
      if (joinedToArtwork || pixels.length > 2500) continue;
      for (const index of pixels) {
        const offset = index * 4;
        data[offset] = 255;
        data[offset + 1] = 255;
        data[offset + 2] = 255;
        data[offset + 3] = 255;
      }
    }
  }
}

function removeSmallComponents(png) {
  const { width, height, data } = png;
  const minArea = Math.max(24, Math.round(width * height * 0.00012));
  const seen = new Uint8Array(width * height);
  const components = [];
  let largest = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (data[start * 4] !== 0 || seen[start]) continue;
      const stack = [start];
      seen[start] = 1;
      const pixels = [];
      while (stack.length) {
        const index = stack.pop();
        pixels.push(index);
        const py = Math.floor(index / width);
        const px = index - py * width;
        const neighbors = [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (data[(ny * width + nx) * 4] !== 0) continue;
          const next = ny * width + nx;
          if (seen[next]) continue;
          seen[next] = 1;
          stack.push(next);
        }
      }
      if (pixels.length > largest) largest = pixels.length;
      components.push(pixels);
    }
  }
  for (const pixels of components) {
    if (pixels.length >= minArea || pixels.length >= largest) continue;
    for (const index of pixels) {
      const offset = index * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = 255;
    }
  }
}

function insetFromEdges(png) {
  const { width, height, data } = png;
  if (width < 64 || height < 64) return png;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4] !== 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return png;
  const margin = Math.max(8, Math.round(Math.min(width, height) * 0.06));
  if (minX >= margin && minY >= margin && maxX < width - margin && maxY < height - margin) return png;
  const srcW = maxX - minX + 1;
  const srcH = maxY - minY + 1;
  const scale = Math.min((width - margin * 2) / srcW, (height - margin * 2) / srcH);
  const dstW = Math.max(1, Math.round(srcW * scale));
  const dstH = Math.max(1, Math.round(srcH * scale));
  const originX = Math.round((width - dstW) / 2);
  const originY = Math.round((height - dstH) / 2);
  const next = new PNG({ width, height });
  next.data.fill(255);
  for (let y = 0; y < dstH; y += 1) {
    const sy = minY + Math.min(srcH - 1, Math.floor(y / scale));
    for (let x = 0; x < dstW; x += 1) {
      const sx = minX + Math.min(srcW - 1, Math.floor(x / scale));
      if (data[(sy * width + sx) * 4] !== 0) continue;
      const offset = ((originY + y) * width + (originX + x)) * 4;
      next.data[offset] = 0;
      next.data[offset + 1] = 0;
      next.data[offset + 2] = 0;
      next.data[offset + 3] = 255;
    }
  }
  return next;
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
 * Gray fringes, specks, and a corner mark become extra cut paths, and
 * full-bleed silhouettes are pulled in so the cutter has a paper margin.
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
    removeSmallComponents(png);
    removeCornerMarks(png);
    const fitted = insetFromEdges(png);
    removeSmallComponents(fitted);
    return { bytes: PNG.sync.write(fitted), contentType: 'image/png' };
  } catch {
    return { bytes, contentType };
  }
}
