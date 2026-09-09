/** Stay under Vercel's 4.5 MB body limit with room for headers. */
export const TRACE_PNG_BODY_BUDGET = 4_000_000;

export function imageDataToPngDataUrl(imageData: ImageData): string {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not encode image for trace.');
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

export function imageDataToPngBlob(imageData: ImageData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not encode image for trace.');
  ctx.putImageData(imageData, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('Could not encode image for trace.'));
      else resolve(blob);
    }, 'image/png');
  });
}

export function scaleImageData(imageData: ImageData, width: number, height: number): ImageData {
  const src = document.createElement('canvas');
  src.width = imageData.width;
  src.height = imageData.height;
  const sctx = src.getContext('2d');
  if (!sctx) throw new Error('Could not encode image for trace.');
  sctx.putImageData(imageData, 0, 0);

  const dst = document.createElement('canvas');
  dst.width = width;
  dst.height = height;
  const dctx = dst.getContext('2d');
  if (!dctx) throw new Error('Could not encode image for trace.');
  dctx.imageSmoothingEnabled = true;
  dctx.imageSmoothingQuality = 'high';
  dctx.drawImage(src, 0, 0, width, height);
  return dctx.getImageData(0, 0, width, height);
}

/**
 * Encode a raster as PNG, downscaling only if the file would exceed the
 * serverless body budget (incompressible noise at 1000px can still be ~4 MB).
 */
export async function encodeTracePng(imageData: ImageData): Promise<Blob> {
  let current = imageData;
  for (let i = 0; i < 8; i++) {
    const blob = await imageDataToPngBlob(current);
    if (blob.size <= TRACE_PNG_BODY_BUDGET) return blob;
    const scale = Math.max(0.35, Math.min(0.85, Math.sqrt(TRACE_PNG_BODY_BUDGET / blob.size)));
    const width = Math.max(32, Math.round(current.width * scale));
    const height = Math.max(32, Math.round(current.height * scale));
    if (width >= current.width && height >= current.height) return blob;
    current = scaleImageData(current, width, height);
  }
  return imageDataToPngBlob(current);
}
