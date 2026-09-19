import { useEffect, useMemo, useState } from 'react';
import {
  getFulfillmentOrder,
  listFulfillmentOrders,
  type FulfillmentOrder,
} from '../services/orderService';
import { describeOrderJob, moneyString } from '../utils/orderPricing';

const TOKEN_KEY = 'wvs-orders-admin-token';

function readTokenFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('token')?.trim();
  if (fromQuery) {
    sessionStorage.setItem(TOKEN_KEY, fromQuery);
    params.delete('token');
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', next);
    return fromQuery;
  }
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

function describeStore(store?: string) {
  if (!store) return '';
  if (store.startsWith('vercel-blob:')) {
    return `Vercel Blob (${store.slice('vercel-blob:'.length)}) — shared production store`;
  }
  if (store.startsWith('file:')) {
    const file = store.replace(/^file:/, '');
    return `Local file ${file} — used by server.mjs when Blob store id / token is unset`;
  }
  return store;
}

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

function JobDesignPanel({ orderId, token }: { orderId: string; token: string }) {
  const [detail, setDetail] = useState<FulfillmentOrder | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getFulfillmentOrder(orderId, token || undefined)
      .then((result) => {
        if (!cancelled) {
          setDetail(result.order);
          setDetailError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setDetail(null);
          setDetailError(err instanceof Error ? err.message : 'Could not load design');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, token]);

  if (detailError) {
    return (
      <div className="mt-4 space-y-3 border-t border-slate-800 pt-4">
        <p className="font-mono text-xs text-red-400">{detailError}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="mt-4 space-y-3 border-t border-slate-800 pt-4">
        <p className="font-mono text-xs text-slate-400">Loading artwork…</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3 border-t border-slate-800 pt-4">
      <div className="rounded border border-slate-700 bg-white p-3">
        {detail.designSvg ? (
          <img
            src={svgPreviewUrl(detail.designSvg)}
            alt={`Design for ${orderId}`}
            className="mx-auto max-h-80 w-full object-contain"
          />
        ) : (
          <p className="font-mono text-xs text-slate-500">No SVG stored.</p>
        )}
      </div>
      {detail.designSvg ? (
        <a
          href={svgPreviewUrl(detail.designSvg)}
          download={`${orderId}.svg`}
          className="inline-flex min-h-10 items-center rounded bg-pink-500 px-3 font-mono text-xs text-gray-900 hover:bg-pink-600"
        >
          Download SVG
        </a>
      ) : null}
    </div>
  );
}

export function JobsBoard() {
  const [token, setToken] = useState(() => readTokenFromLocation());
  const [tokenInput, setTokenInput] = useState(token);
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [store, setStore] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [listEpoch, setListEpoch] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void listFulfillmentOrders(token || undefined)
      .then((result) => {
        if (cancelled) return;
        setOrders(result.orders);
        setStore(result.store || '');
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setOrders([]);
        setError(err instanceof Error ? err.message : 'Could not load jobs');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, listEpoch]);

  const saveToken = () => {
    const next = tokenInput.trim();
    sessionStorage.setItem(TOKEN_KEY, next);
    setLoading(true);
    setError(null);
    setToken(next);
    setListEpoch((n) => n + 1);
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
            <h1 className="text-2xl font-mono text-pink-500">Orders</h1>
            <p className="mt-1 max-w-xl text-sm text-slate-400">
              Internal board for paid vinyl/apparel jobs. Open{' '}
              <code className="text-pink-300">/admin/orders</code> after Stripe pays — jobs are
              stored on the server (webhook), not only in the browser.
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
            <span>ORDERS_ADMIN_TOKEN (Vercel env → paste here)</span>
            <input
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="Required on Vercel production; local list is open without Stripe"
              className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <button
            type="submit"
            className="min-h-11 rounded bg-pink-500 px-4 font-mono text-sm text-gray-900 hover:bg-pink-600"
          >
            Load orders
          </button>
        </form>

        <div className="space-y-1 font-mono text-xs text-slate-500">
          {store ? (
            <p>
              Store: {describeStore(store)} · {paidCount} makeable job{paidCount === 1 ? '' : 's'}
            </p>
          ) : null}
          <p>
            Production URL: <code className="text-slate-400">/admin/orders</code> (alias{' '}
            <code className="text-slate-400">/jobs</code>). Token also accepted as{' '}
            <code className="text-slate-400">?token=</code>.
          </p>
        </div>

        {loading ? (
          <p className="font-mono text-sm text-slate-400">Loading jobs…</p>
        ) : error ? (
          <div className="space-y-1">
            <p className="font-mono text-sm text-red-400">{error}</p>
            {/unauthor/i.test(error) ? (
              <p className="font-mono text-xs text-amber-400">
                Paste <code>ORDERS_ADMIN_TOKEN</code> from the Vercel project env and click Load
                orders.
              </p>
            ) : null}
          </div>
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
                        Created {new Date(order.createdAt).toLocaleString()}
                      </div>
                      {order.paidAt ? (
                        <div className="text-xs text-emerald-400/80">
                          Paid {new Date(order.paidAt).toLocaleString()}
                        </div>
                      ) : null}
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
                  {open ? <JobDesignPanel key={`${order.id}:${token}`} orderId={order.id} token={token} /> : null}
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
