import type { Canvas as FabricCanvas } from 'fabric';

/** Rasterizes artwork bounds (not the empty mat) for mockups and checkout. */
export function snapshotDesignAsDataURL(canvas: FabricCanvas): string {
  canvas.discardActiveObject?.();
  canvas.renderAll?.();

  const objects = canvas.getObjects();
  if (!objects.length) {
    return canvas.toDataURL({ format: 'png', multiplier: 1 });
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  objects.forEach((obj) => {
    const rect = obj.getBoundingRect();
    minX = Math.min(minX, rect.left);
    minY = Math.min(minY, rect.top);
    maxX = Math.max(maxX, rect.left + rect.width);
    maxY = Math.max(maxY, rect.top + rect.height);
  });

  const pad = 24;
  const width = Math.max(8, maxX - minX + pad * 2);
  const height = Math.max(8, maxY - minY + pad * 2);

  return canvas.toDataURL({
    format: 'png',
    multiplier: 2,
    left: minX - pad,
    top: minY - pad,
    width,
    height,
  });
}
