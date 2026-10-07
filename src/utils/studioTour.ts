export const TOUR_STORAGE_KEY = 'wvs-studio-tour';

export const TOUR_BUBBLE_WIDTH = 280;
export const TOUR_VIEWPORT_MARGIN = 8;
export const TOUR_TARGET_GAP = 12;

export type TourReveal = 'tools' | 'canvas' | 'inspector';

export type TourStep = {
  id: string;
  title: string;
  body: string;
  target: string;
  reveal: TourReveal;
  tab?: 'design' | 'layers';
  tool?: 'wand';
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'import',
    title: 'Import Image',
    body: 'Import Image adds a photo to the mat.',
    target: 'import-image',
    reveal: 'tools',
  },
  {
    id: 'draw',
    title: 'Brush Tool',
    body: 'Brush Tool draws on the mat.',
    target: 'brush-tool',
    reveal: 'tools',
  },
  {
    id: 'colour',
    title: 'Erase Color',
    body: 'Erase Color, on Magic Wand, removes the background you tap.',
    target: 'erase-color',
    reveal: 'canvas',
    tool: 'wand',
  },
  {
    id: 'trace',
    title: 'Trace to Razor SVG',
    body: 'Trace to Razor SVG and Trace layered SVG turn a picture into cut paths.',
    target: 'trace-svg',
    reveal: 'inspector',
    tab: 'design',
  },
  {
    id: 'layers',
    title: 'Layers',
    body: 'Layers lists every shape so you can show, hide, or reorder it.',
    target: 'layers-tab',
    reveal: 'inspector',
    tab: 'layers',
  },
];

export function isTourDismissed(): boolean {
  try {
    return globalThis.localStorage?.getItem(TOUR_STORAGE_KEY) === 'done';
  } catch {
    return true;
  }
}

export function markTourDismissed(): void {
  try {
    globalThis.localStorage?.setItem(TOUR_STORAGE_KEY, 'done');
  } catch {
    /* Private browsing can reject storage; the tour still closes. */
  }
}

export type TourBox = { x: number; y: number; width: number; height: number };
export type TourSide = 'top' | 'right' | 'bottom' | 'left';

export type TourPlacement = {
  top: number;
  left: number;
  side: TourSide;
  arrow: number;
};

export function rectsOverlap(a: TourBox, b: TourBox): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function arrowOffset(
  side: TourSide,
  top: number,
  left: number,
  bubble: { width: number; height: number },
  target: TourBox,
): number {
  const along = side === 'left' || side === 'right' ? bubble.height : bubble.width;
  const pad = Math.min(16, along / 2);
  const center =
    side === 'left' || side === 'right'
      ? target.y + target.height / 2 - top
      : target.x + target.width / 2 - left;
  return Math.min(Math.max(center, pad), along - pad);
}

/**
 * Puts the bubble on the side of the target with the most room, then clamps it
 * inside the viewport. A side is kept only when the clamped bubble stays fully
 * on screen and does not cover the control.
 */
export function placeTourBubble(
  target: TourBox,
  bubble: { width: number; height: number },
  viewport: { width: number; height: number },
): TourPlacement {
  const margin = TOUR_VIEWPORT_MARGIN;
  const gap = TOUR_TARGET_GAP;
  const sides: { side: TourSide; room: number; top: number; left: number }[] = [
    {
      side: 'bottom',
      room: viewport.height - (target.y + target.height),
      top: target.y + target.height + gap,
      left: target.x + target.width / 2 - bubble.width / 2,
    },
    {
      side: 'top',
      room: target.y,
      top: target.y - bubble.height - gap,
      left: target.x + target.width / 2 - bubble.width / 2,
    },
    {
      side: 'right',
      room: viewport.width - (target.x + target.width),
      top: target.y + target.height / 2 - bubble.height / 2,
      left: target.x + target.width + gap,
    },
    {
      side: 'left',
      room: target.x,
      top: target.y + target.height / 2 - bubble.height / 2,
      left: target.x - bubble.width - gap,
    },
  ];

  const ranked = sides
    .map((side, index) => ({ ...side, index }))
    .sort((a, b) => b.room - a.room || a.index - b.index);

  const clamp = (top: number, left: number) => ({
    top: Math.min(Math.max(margin, top), Math.max(margin, viewport.height - bubble.height - margin)),
    left: Math.min(Math.max(margin, left), Math.max(margin, viewport.width - bubble.width - margin)),
  });

  const inside = (top: number, left: number) =>
    left >= margin - 0.5 &&
    top >= margin - 0.5 &&
    left + bubble.width <= viewport.width - margin + 0.5 &&
    top + bubble.height <= viewport.height - margin + 0.5;

  for (const candidate of ranked) {
    const pos = clamp(candidate.top, candidate.left);
    const box: TourBox = { x: pos.left, y: pos.top, width: bubble.width, height: bubble.height };
    if (inside(pos.top, pos.left) && !rectsOverlap(box, target)) {
      return {
        ...pos,
        side: candidate.side,
        arrow: arrowOffset(candidate.side, pos.top, pos.left, bubble, target),
      };
    }
  }

  const best = ranked[0];
  let pos = clamp(best.top, best.left);
  const box = (): TourBox => ({ x: pos.left, y: pos.top, width: bubble.width, height: bubble.height });
  if (rectsOverlap(box(), target)) {
    if (best.side === 'left' || best.side === 'right') {
      const below = target.y + target.height + gap;
      const above = target.y - bubble.height - gap;
      pos = clamp(below + bubble.height <= viewport.height - margin ? below : above, pos.left);
    } else {
      const right = target.x + target.width + gap;
      const left = target.x - bubble.width - gap;
      pos = clamp(pos.top, right + bubble.width <= viewport.width - margin ? right : left);
    }
  }
  return {
    ...pos,
    side: best.side,
    arrow: arrowOffset(best.side, pos.top, pos.left, bubble, target),
  };
}
