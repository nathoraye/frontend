import { useEffect, useState } from 'react';
import {
  dismissStudioNotice,
  subscribeStudioNotices,
  type StudioNotice,
} from '../utils/studioNotice';

const TONE: Record<StudioNotice['tone'], string> = {
  error: 'border-red-500/50 bg-[#2a151c] text-red-100',
  warning: 'border-amber-400/40 bg-[#2a2415] text-amber-100',
  info: 'border-sky-400/40 bg-[#15202a] text-sky-100',
  success: 'border-emerald-400/40 bg-[#152a1c] text-emerald-100',
};

export function StudioNoticeHost() {
  const [notices, setNotices] = useState<StudioNotice[]>([]);

  useEffect(() => subscribeStudioNotices(setNotices), []);

  useEffect(() => {
    if (notices.length === 0) return;
    const timers = notices.map((notice) =>
      window.setTimeout(() => dismissStudioNotice(notice.id), notice.tone === 'error' ? 8000 : 5000),
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [notices]);

  if (notices.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2">
      {notices.map((notice) => (
        <div
          key={notice.id}
          data-testid="studio-notice"
          role="status"
          className={`pointer-events-auto rounded-xl border px-3 py-2.5 shadow-2xl ${TONE[notice.tone]}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider">{notice.title}</p>
              {notice.detail && <p className="mt-1 text-[11px] leading-relaxed opacity-80">{notice.detail}</p>}
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md px-1.5 text-sm opacity-70 hover:opacity-100"
              aria-label="Dismiss"
              onClick={() => dismissStudioNotice(notice.id)}
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
