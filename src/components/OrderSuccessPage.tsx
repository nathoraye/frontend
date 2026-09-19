import { useEffect, useState } from 'react';
import { fetchSessionStatus, type SessionStatusResult } from '../services/orderService';

function money(amount?: number, currency?: string) {
  if (typeof amount !== 'number') return '';
  return `$${amount.toFixed(2)} ${currency || 'AUD'}`;
}

export function OrderSuccessPage() {
  const [status, setStatus] = useState<SessionStatusResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const orderId = params.get('orderId');
    void fetchSessionStatus({ sessionId, orderId })
      .then(setStatus)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load order status');
      });
  }, []);

  return (
    <div className="min-h-[100dvh] bg-[#0f111a] px-4 py-10 text-slate-200">
      <div className="mx-auto w-full max-w-lg space-y-6 rounded-lg border border-slate-800 bg-[#181a25] p-6">
        <p className="text-xs font-black tracking-widest text-pink-400 uppercase">West Vinyl Studio</p>
        <h1 className="text-2xl font-mono text-pink-500">Payment received</h1>
        {error ? (
          <p className="font-mono text-sm text-red-400">{error}</p>
        ) : !status ? (
          <p className="font-mono text-sm text-slate-400">Checking Stripe and your job…</p>
        ) : (
          <div className="space-y-3 font-mono text-sm text-slate-300">
            <p>
              {status.unverified
                ? 'Saved as a local unverified job (no Stripe capture).'
                : status.status === 'paid'
                  ? 'Stripe marked this session paid. The cut job is on the Jobs board.'
                  : `Order status: ${status.status}.`}
            </p>
            <div className="rounded border border-slate-700 bg-slate-950/60 p-3 space-y-1">
              <div className="flex justify-between gap-4">
                <span>Job</span>
                <span className="text-pink-400">{status.orderId}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Type</span>
                <span className="text-pink-400">{status.orderType}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Total</span>
                <span className="text-pink-400">{money(status.amount, status.currency)}</span>
              </div>
              {status.email ? (
                <div className="flex justify-between gap-4">
                  <span>Email</span>
                  <span className="text-pink-400">{status.email}</span>
                </div>
              ) : null}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <a
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded bg-pink-500 px-4 font-mono text-sm text-gray-900 hover:bg-pink-600"
          >
            Back to studio
          </a>
        </div>
      </div>
    </div>
  );
}

export default OrderSuccessPage;
