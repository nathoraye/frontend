import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  TOUR_BUBBLE_WIDTH,
  TOUR_STEPS,
  placeTourBubble,
  type TourBox,
  type TourPlacement,
  type TourSide,
} from '../utils/studioTour';

type StudioTourProps = {
  open: boolean;
  stepIndex: number;
  onStep: (index: number) => void;
  onDismiss: () => void;
};

const FOCUSABLE = 'button:not([disabled])';

function arrowClass(side: TourSide): string {
  if (side === 'right') return 'left-0 -translate-x-full border-y-[7px] border-y-transparent border-r-[8px] border-r-[#FF1493]';
  if (side === 'left') return 'right-0 translate-x-full border-y-[7px] border-y-transparent border-l-[8px] border-l-[#FF1493]';
  if (side === 'bottom') return 'top-0 -translate-y-full border-x-[7px] border-x-transparent border-b-[8px] border-b-[#FF1493]';
  return 'bottom-0 translate-y-full border-x-[7px] border-x-transparent border-t-[8px] border-t-[#FF1493]';
}

function revealInScrollParent(el: Element) {
  let parent = el.parentElement;
  while (parent && parent !== document.documentElement) {
    const style = getComputedStyle(parent);
    const canScrollY =
      (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
      parent.scrollHeight > parent.clientHeight + 1;
    if (canScrollY) {
      const parentRect = parent.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      const pad = 8;
      if (rect.top < parentRect.top + pad) parent.scrollTop -= parentRect.top + pad - rect.top;
      else if (rect.bottom > parentRect.bottom - pad) parent.scrollTop += rect.bottom - (parentRect.bottom - pad);
    }
    parent = parent.parentElement;
  }
}

function readTarget(name: string): TourBox | null {
  const el = document.querySelector(`[data-tour="${name}"]`);
  if (!el) return null;
  revealInScrollParent(el);
  const rect = el.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return null;
  if (rect.bottom < 8 || rect.right < 8 || rect.top > window.innerHeight - 8 || rect.left > window.innerWidth - 8) {
    return null;
  }
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function unionBox(boxes: TourBox[]): TourBox {
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x, y, width: right - x, height: bottom - y };
}

function readTargets(names: string[]): TourBox | null {
  const boxes: TourBox[] = [];
  for (const name of names) {
    const box = readTarget(name);
    if (!box) return null;
    boxes.push(box);
  }
  return unionBox(boxes);
}

export function StudioTour({ open, stepIndex, onStep, onDismiss }: StudioTourProps) {
  const step = TOUR_STEPS[stepIndex] ?? TOUR_STEPS[0];
  const last = stepIndex >= TOUR_STEPS.length - 1;
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [target, setTarget] = useState<TourBox | null>(null);
  const [bubbleSize, setBubbleSize] = useState({ width: TOUR_BUBBLE_WIDTH, height: 168 });
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1280 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
  }));

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const names = step.targets?.length ? step.targets : [step.target];
      const next = readTargets(names);
      if (next) setTarget(next);
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    const timers = [0, 60, 240, 420, 640].map((delay) => window.setTimeout(measure, delay));
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, step.target, step.targets, stepIndex]);

  useLayoutEffect(() => {
    const el = dialogRef.current;
    if (!open || !el) return;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    if (width > 0 && height > 0 && (width !== bubbleSize.width || height !== bubbleSize.height)) {
      setBubbleSize({ width, height });
    }
  }, [open, bubbleSize.width, bubbleSize.height, stepIndex, viewport.width]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => primaryRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open, stepIndex]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onDismiss();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        event.stopPropagation();
        if (last) onDismiss();
        else onStep(stepIndex + 1);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        event.stopPropagation();
        if (stepIndex > 0) onStep(stepIndex - 1);
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const end = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !root.contains(active))) {
        event.preventDefault();
        end.focus();
      } else if (!event.shiftKey && active === end) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, last, onDismiss, onStep, stepIndex]);

  if (!open) return null;

  const width = Math.min(TOUR_BUBBLE_WIDTH, Math.max(220, viewport.width - 16));
  const pair =
    (step.targets?.length ?? 0) > 1 && !!target && target.width > target.height * 2;
  const prefer: TourSide[] = pair ? ['bottom', 'top'] : [];
  const placement: TourPlacement = target
    ? placeTourBubble(target, { width: bubbleSize.width || width, height: bubbleSize.height }, viewport, prefer)
    : {
        top: Math.max(8, (viewport.height - bubbleSize.height) / 2),
        left: Math.max(8, (viewport.width - width) / 2),
        side: 'bottom',
        arrow: width / 2,
      };

  const spot = target
    ? {
        left: target.x - 4,
        top: target.y - 4,
        width: target.width + 8,
        height: target.height + 8,
      }
    : null;

  return (
    <div className="fixed inset-0 z-[80]">
      {spot ? (
        <div
          aria-hidden="true"
          data-testid="studio-tour-spot"
          className="pointer-events-none absolute rounded-lg"
          style={{
            left: spot.left,
            top: spot.top,
            width: spot.width,
            height: spot.height,
            boxShadow: '0 0 0 9999px rgba(15, 17, 26, 0.72)',
            outline: '2px solid #FF1493',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[#0f111a]/72" />
      )}
      <div className="absolute inset-0" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Studio tour"
        data-testid="studio-tour"
        className="absolute rounded-lg border border-slate-600 bg-[#181a25] p-4 text-slate-200"
        style={{ top: placement.top, left: placement.left, width }}
      >
        <span
          aria-hidden="true"
          className={`absolute h-0 w-0 ${arrowClass(placement.side)}`}
          style={
            placement.side === 'left' || placement.side === 'right'
              ? { top: placement.arrow - 7 }
              : { left: placement.arrow - 7 }
          }
        />
        <p className="text-[11px] font-semibold tracking-wide text-slate-400">Studio tour</p>
        <p className="mt-1 text-xs font-semibold text-[#FF1493]">
          {stepIndex + 1} of {TOUR_STEPS.length}
        </p>
        <h2 className="mt-2 text-sm font-semibold text-slate-100">
          {step.title}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-300">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            disabled={stepIndex === 0}
            onClick={() => onStep(stepIndex - 1)}
            className="inline-flex h-10 items-center rounded-md border border-slate-600 px-3 text-xs font-semibold text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF1493] disabled:opacity-40"
          >
            Back
          </button>
          <button
            ref={primaryRef}
            type="button"
            onClick={() => (last ? onDismiss() : onStep(stepIndex + 1))}
            className="inline-flex h-10 items-center rounded-md bg-[#FF1493] px-3 text-xs font-semibold text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF1493] hover:bg-[#d41270]"
          >
            {last ? 'Done' : 'Next'}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="ml-auto inline-flex h-10 items-center rounded-md px-3 text-xs font-semibold text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF1493] hover:text-slate-200"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
