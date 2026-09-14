import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getFulfillmentOrder,
  listFulfillmentOrders,
  type FulfillmentOrder,
} from '../services/orderService';
import { describeOrderJob, moneyString } from '../utils/orderPricing';

const TOKEN_KEY = 'wvs-orders-admin-token';

function statusClass(status?: string) {
  if (status === 'paid') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  if (status === 'unverified') return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  if (status === 'cancelled') return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
  return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
}

function stripeDashboardHref(paymentIntentId?: string | null) {
  if (!paymentIntentId || !paymentIntentId.startsWith('pi_')) return null;
  const live = !paymentIntentId.includes('_test_') && !import.meta.env.DEV;
  const mode = live ? '' : 'test/';
  return `https://dashboard.stripe.com/${mode}payments/${paymentIntentId}`;
}

function svgPreviewUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function JobsBoard() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '');
  const [tokenInput, setTokenInput] = useState(token);
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [store, setStore] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FulfillmentOrder | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadList = useCallback(async (adminToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await listFulfillmentOrders(adminToken || undefined);
      setOrders(result.orders);
      setStore(result.store || '');
    } catch (err) {
      setOrders([]);
      setError(err instanceof Error ? err.message : 'Could not load jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList(token);
  }, [loadList, token]);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    setDetailError(null);
    void getFulfillmentOrder(openId, token || undefined)
      .then((result) => {
        if (!cancelled) setDetail(result.order);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setDetailError(err instanceof Error ? err.message : 'Could not load design');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [openId, token]);

  const saveToken = () => {
    sessionStorage.setItem(TOKEN_KEY, tokenInput.trim());
    setToken(tokenInput.trim());
  };

  const paidCount = useMemo(
    () => orders.filter((order) => order.status === 'paid' || order.status === 'unverified').length,
    [orders],
  );

  return (
    <div className="min-h-[100dvh] bg-[#0f111a] px-4 py-6 text-slate-200" data-testid="jobs-board">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black tracking-widest text-pink-400 uppercase">
              West Vinyl Studio
            </p>
            <h1 className="text-2xl font-mono text-pink-500">Jobs board</h1>
            <p className="mt-1 max-w-xl text-sm text-slate-400">
              Paid and local vinyl/apparel jobs to cut. This is the in-app fulfillment view —
              Stripe Dashboard shows the payment, not the artwork.
            </p>
          </div>
          <a
            href="/"
            className="inline-flex min-h-11 items-center rounded border border-slate-600 px-3 font-mono text-sm hover:bg-slate-800"
          >
            Studio
          </a>
        </div>

        <form
          className="flex flex-col gap-2 rounded border border-slate-800 bg-[#181a25] p-4 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            saveToken();
          }}
        >
          <label className="flex-1 space-y-1 font-mono text-xs text-slate-400">
            <span>ORDERS_ADMIN_TOKEN</span>
            <input
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="Required on Vercel; local list may be open"
              className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <button
            type="submit"
            className="min-h-11 rounded bg-pink-500 px-4 font-mono text-sm text-gray-900 hover:bg-pink-600"
          >
            Load jobs
          </button>
        </form>

        {store ? (
          <p className="font-mono text-xs text-slate-500">
            Store: {store} · {paidCount} makeable job{paidCount === 1 ? '' : 's'}
          </p>
        ) : null}

        {loading ? (
          <p className="font-mono text-sm text-slate-400">Loading jobs…</p>
        ) : error ? (
          <p className="font-mono text-sm text-red-400">{error}</p>
        ) : orders.length === 0 ? (
          <p className="font-mono text-sm text-slate-400">No jobs yet.</p>
        ) : (
          <ul className="space-y-3">
            {orders.map((order) => {
              const open = openId === order.id;
              const dashboard = stripeDashboardHref(order.paymentIntentId);
              return (
                <li
                  key={order.id}
                  className="rounded border border-slate-800 bg-[#181a25] p-4"
                  data-testid="job-card"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase ${statusClass(order.status)}`}
                        >
                          {order.status || 'unknown'}
                        </span>
                        <span className="font-mono text-sm text-pink-400">
                          {describeOrderJob(order.orderConfig)}
                        </span>
                      </div>
                      <p className="font-mono text-xs text-slate-400">{order.id}</p>
                      <p className="text-sm text-slate-200">
                        {order.customer?.fullName || 'Unknown customer'}
                        {order.customer?.email ? ` · ${order.customer.email}` : ''}
                      </p>
                      {order.customer ? (
                        <p className="text-xs text-slate-500">
                          {[
                            order.customer.street,
                            order.customer.city,
                            order.customer.state,
                            order.customer.postcode,
                            order.customer.country,
                          ]
                            .filter(Boolean)
                            .join(', ')}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right font-mono text-sm">
                      <div className="text-pink-400">
                        ${moneyString(Number(order.amount || 0))} {order.currency || 'AUD'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(order.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : order.id)}
                      className="min-h-10 rounded border border-pink-500 px-3 font-mono text-xs text-pink-300 hover:bg-pink-500/10"
                    >
                      {open ? 'Hide design' : 'Show design'}
                    </button>
                    {dashboard ? (
                      <a
                        href={dashboard}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-10 items-center rounded border border-slate-600 px-3 font-mono text-xs hover:bg-slate-800"
                      >
                        Stripe payment
                      </a>
                    ) : null}
                  </div>
                  {open ? (
                    <div className="mt-4 space-y-3 border-t border-slate-800 pt-4">
                      {detailError ? (
                        <p className="font-mono text-xs text-red-400">{detailError}</p>
                      ) : !detail ? (
                        <p className="font-mono text-xs text-slate-400">Loading artwork…</p>
                      ) : (
                        <>
                          <div className="rounded border border-slate-700 bg-white p-3">
                            {detail.designSvg ? (
                              <img
                                src={svgPreviewUrl(detail.designSvg)}
                                alt={`Design for ${order.id}`}
                                className="mx-auto max-h-80 w-full object-contain"
                              />
                            ) : (
                              <p className="font-mono text-xs text-slate-500">No SVG stored.</p>
                            )}
                          </div>
                          {detail.designSvg ? (
                            <a
                              href={svgPreviewUrl(detail.designSvg)}
                              download={`${order.id}.svg`}
                              className="inline-flex min-h-10 items-center rounded bg-pink-500 px-3 font-mono text-xs text-gray-900 hover:bg-pink-600"
                            >
                              Download SVG
                            </a>
                          ) : null}
                        </>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default JobsBoard;
