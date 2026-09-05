import type { Canvas as FabricCanvas } from 'fabric';

const IDENTITY_VPT = [1, 0, 0, 1, 0, 0] as const;

/** Rasterizes artwork bounds (not the empty mat) for mockups and checkout. */
export function snapshotDesignAsDataURL(canvas: FabricCanvas): string {
  const objects = canvas.getObjects();
  if (!objects.length) {
    return '';
  }

  const previousVpt = canvas.viewportTransform
    ? ([...canvas.viewportTransform] as number[])
    : [...IDENTITY_VPT];

  try {
    canvas.setViewportTransform?.([...IDENTITY_VPT]);
    objects.forEach((obj) => obj.setCoords?.());
    canvas.discardActiveObject?.();
    canvas.renderAll?.();

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    canvas.getObjects().forEach((obj) => {
      const rect = obj.getBoundingRect();
      if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return;
      minX = Math.min(minX, rect.left);
      minY = Math.min(minY, rect.top);
      maxX = Math.max(maxX, rect.left + rect.width);
      maxY = Math.max(maxY, rect.top + rect.height);
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || maxX <= minX || maxY <= minY) {
      return '';
    }

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
  } finally {
    canvas.setViewportTransform?.(previousVpt as typeof canvas.viewportTransform);
  }
}
