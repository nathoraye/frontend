import { useEffect, useId, useState } from 'react';

type AiArtworkPanelProps = {
  mode: 'create' | 'edit';
  initialPrompt: string;
  remaining: number;
  limit: number;
  generating: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (prompt: string) => void;
};

const MAX_PROMPT = 300;

export function AiArtworkPanel({
  mode,
  initialPrompt,
  remaining,
  limit,
  generating,
  error,
  onClose,
  onSubmit,
}: AiArtworkPanelProps) {
  const titleId = useId();
  const [prompt, setPrompt] = useState(initialPrompt);
  const trimmed = prompt.trim();
  const tooLong = prompt.length > MAX_PROMPT;
  const exhausted = remaining <= 0;
  const canSubmit = !generating && !exhausted && trimmed.length > 0 && !tooLong;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const remainingLabel = exhausted
    ? 'No free generations left today. They reset tomorrow.'
    : `${remaining} of ${limit} free generations left today`;

  return (
    <div className="absolute top-3 right-3 z-50 max-h-[calc(100%-1.5rem)] w-[min(92vw,24rem)] overflow-y-auto">
      <form
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        data-testid="ai-artwork-panel"
        className="rounded-xl border border-slate-700 bg-[#181a25] p-4 text-slate-200 shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          onSubmit(trimmed);
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-sm font-bold text-slate-100">
              Create and edit with AI
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              {mode === 'edit'
                ? 'Edit regenerates a new image from the revised prompt. The current picture is not sent to the generator.'
                : 'Describe a sticker or a logo. Logos are set as a bold black wordmark. Other prompts are drawn as a flat black icon on white.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <label className="mt-3 block text-[10px] font-bold uppercase tracking-wider text-slate-400" htmlFor="ai-artwork-prompt">
          Prompt
        </label>
        <textarea
          id="ai-artwork-prompt"
          data-testid="ai-artwork-prompt"
          value={prompt}
          maxLength={MAX_PROMPT + 20}
          rows={4}
          disabled={generating}
          autoFocus
          placeholder="A bold black cat head, or Hunnid Collection logo"
          onChange={(event) => setPrompt(event.target.value)}
          className="mt-1 w-full resize-none rounded-md border border-slate-600 bg-[#0f111a] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-slate-400 disabled:opacity-60"
        />
        <p className="mt-1 text-[11px] text-slate-500">{prompt.length}/{MAX_PROMPT}</p>
        <p data-testid="ai-artwork-remaining" className={`mt-2 text-[11px] leading-relaxed ${exhausted ? 'text-amber-200' : 'text-slate-300'}`}>
          {remainingLabel}
        </p>

        {generating && (
          <p data-testid="ai-artwork-loading" className="mt-3 text-[11px] leading-relaxed text-slate-300" role="status">
            Generating artwork. This usually takes a few seconds and can take half a minute.
          </p>
        )}

        {error && (
          <p
            data-testid="ai-artwork-error"
            role="alert"
            className="mt-3 rounded-md border border-red-500/50 bg-[#2a151c] px-2.5 py-2 text-[11px] leading-relaxed text-red-100"
          >
            {error}
          </p>
        )}

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-md px-3.5 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            data-testid="ai-artwork-submit"
            disabled={!canSubmit}
            className="inline-flex h-10 items-center justify-center rounded-md bg-[#FF1493] px-3.5 text-sm font-semibold text-black hover:bg-[#d41270] disabled:pointer-events-none disabled:opacity-40"
          >
            {generating ? 'Generating…' : mode === 'edit' ? 'Regenerate' : 'Create artwork'}
          </button>
        </div>
      </form>
    </div>
  );
}
