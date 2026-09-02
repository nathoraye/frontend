export function imageDataToPngDataUrl(imageData: ImageData): string {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not encode image for trace.');
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}
