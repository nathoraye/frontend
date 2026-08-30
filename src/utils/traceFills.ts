export function normalizeFill(fill: unknown): string {
  if (fill == null) return '';
  return String(fill).toLowerCase().replace(/\s/g, '');
}

export function isBackgroundFill(fill: unknown): boolean {
  const value = normalizeFill(fill);
  return (
    value === '' ||
    value === 'transparent' ||
    value === 'none' ||
    value === '#ffffff' ||
    value === '#fff' ||
    value === 'white' ||
    value === 'rgb(255,255,255)' ||
    /^rgba\(255,255,255,/.test(value)
  );
}

export function isBlackFill(fill: unknown): boolean {
  const value = normalizeFill(fill);
  return (
    value === '#000000' ||
    value === '#000' ||
    value === 'black' ||
    value === 'rgb(0,0,0)' ||
    /^rgba\(0,0,0,/.test(value)
  );
}

type SizedShape = {
  type?: string;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
};

export function isFullFrameShape(obj: SizedShape, svgWidth: number, svgHeight: number): boolean {
  if (!svgWidth || !svgHeight) return false;
  const width = Math.abs((obj.width || 0) * (obj.scaleX || 1));
  const height = Math.abs((obj.height || 0) * (obj.scaleY || 1));
  const covers = width >= svgWidth * 0.9 && height >= svgHeight * 0.9;
  if (!covers) return false;
  return obj.type === 'rect' || obj.type === 'path' || obj.type === 'polygon';
}
