import type { Ref } from 'react';

type PhoneStudioMenuProps = {
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onTour: () => void;
  onAi: () => void;
  aiDisabled: boolean;
  tourRef: Ref<HTMLButtonElement>;
};

const itemClass =
  'flex h-11 w-full items-center rounded-md px-3 text-left text-xs font-semibold text-slate-200 touch-manipulation hover:bg-slate-800';

/** Secondary phone controls, kept off the single header row. */
export function PhoneStudioMenu({
  onUndo,
  onRedo,
  onClear,
  onTour,
  onAi,
  aiDisabled,
  tourRef,
}: PhoneStudioMenuProps) {
  return (
    <nav className="flex h-full w-40 shrink-0 flex-col gap-1 overflow-y-auto border-r border-slate-800 bg-[#181a25] px-2 py-3" aria-label="Studio menu">
      <p className="px-3 pb-1 text-[10px] font-black tracking-widest text-slate-400 uppercase">WVS</p>
      <button type="button" onClick={onUndo} className={itemClass} aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)">Undo</button>
      <button type="button" onClick={onRedo} className={itemClass} aria-label="Redo (Ctrl+Y)" title="Redo (Ctrl+Y)">Redo</button>
      <button type="button" onClick={onClear} className={itemClass} aria-label="Clear Mat" title="Clear Mat">Clear mat</button>
      <a href="/policies" className={itemClass}>Info</a>
      <button type="button" ref={tourRef} data-testid="studio-tour-replay" onClick={onTour} className={itemClass}>
        Tour
      </button>
      <button
        type="button"
        data-testid="ai-artwork-button"
        aria-label="Create and edit with AI"
        disabled={aiDisabled}
        onClick={onAi}
        className={`${itemClass} disabled:opacity-40`}
      >
        AI
      </button>
    </nav>
  );
}
