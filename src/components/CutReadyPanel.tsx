import type { CutReadyReport } from '../utils/cutReady';

export function CutReadyPanel({ report }: { report: CutReadyReport }) {
  const errors = report.issues.filter((i) => i.severity === 'error');
  const warnings = report.issues.filter((i) => i.severity === 'warning');
  const headline = report.ready
    ? 'Cut ready'
    : errors.length > 0
      ? 'Not cut ready'
      : 'Almost ready';

  const color = report.ready
    ? 'text-emerald-400'
    : errors.length > 0
      ? 'text-amber-400'
      : 'text-sky-300';

  return (
    <section
      data-testid="cut-ready-panel"
      className="mb-4 rounded-xl border border-slate-700 bg-[#0f111a] p-3"
    >
      <h3 className={`text-[10px] font-bold uppercase tracking-widest ${color}`}>{headline}</h3>
      {report.issues.length === 0 ? (
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
          Vectors on the mat, weeding box in place. Export when you are happy with placement.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {report.issues.map((issue) => (
            <li
              key={issue.code}
              className={`text-[11px] leading-relaxed ${issue.severity === 'error' ? 'text-amber-200' : 'text-slate-400'}`}
            >
              {issue.message}
            </li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && errors.length === 0 && (
        <p className="mt-2 text-[10px] text-slate-500">Export still works. Warnings will not block the knife, but weeding is harder.</p>
      )}
    </section>
  );
}

export function CutReadyBadge({
  report,
  onClick,
}: {
  report: CutReadyReport;
  onClick: () => void;
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
      className={`h-8 rounded-md border px-2 text-[10px] font-bold uppercase tracking-wider touch-manipulation ${cls}`}
      title="Open cut-ready checklist"
    >
      {label}
    </button>
  );
}
