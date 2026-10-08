import type { CutReadyReport } from '../utils/cutReady';

export function CutReadyBadge({
  report,
  onClick,
  className = '',
}: {
  report: CutReadyReport;
  onClick: () => void;
  className?: string;
}) {
  const errors = report.issues.filter((i) => i.severity === 'error').length;
  const label = report.ready ? 'Cut ready' : errors > 0 ? `${errors} cut issue${errors === 1 ? '' : 's'}` : 'Cut check';
  const cls = report.ready
    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
    : errors > 0
      ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
      : 'border-slate-600 bg-slate-800 text-slate-300';

  return (
    <button
      type="button"
      data-testid="cut-ready-badge"
      onClick={onClick}
      className={`h-8 rounded-md border px-2 text-[10px] font-bold uppercase tracking-wider touch-manipulation ${cls} ${className}`}
      title="Open cut-ready checklist"
    >
      {label}
    </button>
  );
}
