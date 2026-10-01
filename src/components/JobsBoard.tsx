import { useEffect, useMemo, useState } from 'react';
import {
  fetchOrderDesignBlob,
  fetchOrderPreviewBlob,
  getFulfillmentOrder,
  listFulfillmentOrders,
  loginJobsAdmin,
  setFulfillmentStatus,
  type FulfillmentOrder,
} from '../services/orderService';
import { describeOrderJob, formatOrderSize, moneyString } from '../utils/orderPricing';

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
  if (status === 'shipped') return 'bg-violet-500/20 text-violet-300 border-violet-500/40';
  if (status === 'making') return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
  return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
}

type JobFilter = 'make' | 'shipped' | 'all';

function shopStatus(order: FulfillmentOrder) {
  if (order.status !== 'paid' && order.status !== 'unverified') return order.status || 'unknown';
  return order.fulfillmentStatus || 'new';
}

function isToMake(order: FulfillmentOrder) {
  const shop = shopStatus(order);
  return (order.status === 'paid' || order.status === 'unverified') && shop !== 'shipped';
}

function stripeDashboardHref(paymentIntentId?: string | null) {
  if (!paymentIntentId || !paymentIntentId.startsWith('pi_')) return null;
  const live = !paymentIntentId.includes('_test_') && !import.meta.env.DEV;
  const mode = live ? '' : 'test/';
  return `https://dashboard.stripe.com/${mode}payments/${paymentIntentId}`;
}

/** Labeled cut / garment size — separate from the pink job summary line. */
function JobSizeLine({ orderConfig }: { orderConfig?: Record<string, unknown> | null }) {
  const orderType = orderConfig?.orderType === 'product' ? 'product' : 'vinyl';
  const size = formatOrderSize(orderConfig);
  const quoted = Boolean(orderConfig?.productType || orderConfig?.designType);
  const label = quoted ? 'Print size' : orderType === 'product' ? 'Garment size' : 'Vinyl size';
  return (
    <p className="font-mono text-sm text-slate-200" data-testid="job-size">
      <span className="text-slate-500">{label} · </span>
      {size ? (
        <span className="text-pink-300">{size}</span>
      ) : (
        <span className="text-amber-400/90">not set (legacy order)</span>
      )}
    </p>
  );
}

function JobQuoteLine({ orderConfig }: { orderConfig?: Record<string, unknown> | null }) {
  const quote = orderConfig?.quote;
  if (!quote || typeof quote !== 'object') return null;
  const row = quote as Record<string, unknown>;
  if (typeof row.subtotal !== 'number' || typeof row.shipping !== 'number') return null;
  return (
    <p className="font-mono text-xs text-slate-400" data-testid="job-quote">
      Item ${moneyString(row.subtotal)} · Shipping ${moneyString(row.shipping)}
      {typeof row.designType === 'string' ? ` · ${row.designType}` : ''}
    </p>
  );
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function JobDesignPanel({ orderId, token }: { orderId: string; token: string }) {
  const [detail, setDetail] = useState<FulfillmentOrder | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [designUrl, setDesignUrl] = useState<string | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'preview' | 'design' | null>(null);

  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];
    const track = (url: string) => {
      objectUrls.push(url);
      return url;
    };

    void (async () => {
      try {
        const result = await getFulfillmentOrder(orderId, token || undefined);
        if (cancelled) return;
        setDetail(result.order);
        setDetailError(null);

        const order = result.order;
        const errors: string[] = [];

        // Prefer authenticated private-blob / inline asset endpoints so <img>
        // never needs a giant data: URL (those break for photo-heavy SVGs).
        if (order.hasPreview || order.previewBlobPath || order.designPreviewPng) {
          try {
            const blob = await fetchOrderPreviewBlob(orderId, token || undefined);
            if (cancelled) return;
            setPreviewUrl(track(URL.createObjectURL(blob)));
          } catch (err: unknown) {
            errors.push(err instanceof Error ? err.message : 'Preview failed');
          }
        }

        if (order.hasDesign || order.designBlobPath || order.designSvg) {
          try {
            const blob = await fetchOrderDesignBlob(orderId, token || undefined);
            if (cancelled) return;
            const url = track(URL.createObjectURL(blob));
            setDesignUrl(url);
            // Legacy jobs without a PNG still need something in the preview frame.
            if (!order.hasPreview && !order.previewBlobPath && !order.designPreviewPng) {
              setPreviewUrl(url);
            }
          } catch (err: unknown) {
            // Fall back to inline SVG from the detail payload when asset route is unavailable.
            if (order.designSvg && order.designSvg.length >= 20) {
              const blob = new Blob([order.designSvg], { type: 'image/svg+xml;charset=utf-8' });
              const url = track(URL.createObjectURL(blob));
              setDesignUrl(url);
              if (!order.hasPreview && !order.previewBlobPath && !order.designPreviewPng) {
                setPreviewUrl(url);
              }
            } else {
              errors.push(err instanceof Error ? err.message : 'Design failed');
            }
          }
        }

        if (!cancelled) {
          setAssetError(errors.length ? errors.join(' · ') : null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setDetail(null);
          setDetailError(err instanceof Error ? err.message : 'Could not load design');
        }
      }
    })();

    return () => {
      cancelled = true;
      while (objectUrls.length) {
        const url = objectUrls.pop();
        if (url) URL.revokeObjectURL(url);
      }
    };
  }, [orderId, token]);

  const openPreview = async () => {
    setBusy('preview');
    setAssetError(null);
    try {
      if (previewUrl) {
        window.open(previewUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      const blob = await fetchOrderPreviewBlob(orderId, token || undefined);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: unknown) {
      setAssetError(err instanceof Error ? err.message : 'Could not open preview');
    } finally {
      setBusy(null);
    }
  };

  const openDesign = async () => {
    setBusy('design');
    setAssetError(null);
    try {
      if (designUrl) {
        window.open(designUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      const blob = await fetchOrderDesignBlob(orderId, token || undefined);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: unknown) {
      setAssetError(err instanceof Error ? err.message : 'Could not open design');
    } finally {
      setBusy(null);
    }
  };

  const downloadDesign = async () => {
    setBusy('design');
    setAssetError(null);
    try {
      const blob = await fetchOrderDesignBlob(orderId, token || undefined, true);
      triggerBlobDownload(blob, `${orderId}.svg`);
    } catch (err: unknown) {
      if (detail?.designSvg) {
        triggerBlobDownload(
          new Blob([detail.designSvg], { type: 'image/svg+xml;charset=utf-8' }),
          `${orderId}.svg`,
        );
      } else {
        setAssetError(err instanceof Error ? err.message : 'Could not download design');
      }
    } finally {
      setBusy(null);
    }
  };

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
      <JobSizeLine orderConfig={detail.orderConfig} />
      <JobQuoteLine orderConfig={detail.orderConfig} />
      <div className="rounded border border-slate-700 bg-white p-3">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={`Product preview for ${orderId}`}
            className="mx-auto max-h-80 w-full object-contain"
            data-testid="job-preview-image"
          />
        ) : (
          <p className="font-mono text-xs text-slate-500">No product preview stored.</p>
        )}
      </div>
      {assetError ? <p className="font-mono text-xs text-amber-400">{assetError}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!previewUrl || busy === 'preview'}
          onClick={() => void openPreview()}
          className="inline-flex min-h-10 items-center rounded border border-slate-600 px-3 font-mono text-xs hover:bg-slate-800 disabled:opacity-50"
          data-testid="job-open-preview"
        >
          Open preview
        </button>
        <button
          type="button"
          disabled={(!designUrl && !detail.hasDesign && !detail.designSvg) || busy === 'design'}
          onClick={() => void openDesign()}
          className="inline-flex min-h-10 items-center rounded border border-pink-500 px-3 font-mono text-xs text-pink-300 hover:bg-pink-500/10 disabled:opacity-50"
          data-testid="job-open-design"
        >
          Open design file
        </button>
        <button
          type="button"
          disabled={(!designUrl && !detail.hasDesign && !detail.designSvg) || busy === 'design'}
          onClick={() => void downloadDesign()}
          className="inline-flex min-h-10 items-center rounded bg-pink-500 px-3 font-mono text-xs text-gray-900 hover:bg-pink-600 disabled:opacity-50"
          data-testid="job-download-svg"
        >
          Download SVG
        </button>
      </div>
    </div>
  );
}

export function JobsBoard() {
  const [token, setToken] = useState(() => readTokenFromLocation());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [store, setStore] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [listEpoch, setListEpoch] = useState(0);
  const [filter, setFilter] = useState<JobFilter>('make');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listFulfillmentOrders(token || undefined)
      .then((result) => {
        if (cancelled) return;
        setOrders(result.orders);
        setStore(result.store || '');
        setError(null);
        setNeedsLogin(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Could not load jobs';
        setOrders([]);
        if (/unauthor/i.test(message)) {
          setNeedsLogin(true);
          setError(null);
          return;
        }
        setNeedsLogin(false);
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, listEpoch]);

  const signIn = async () => {
    setSigningIn(true);
    setLoginError(null);
    try {
      const result = await loginJobsAdmin(username.trim(), password);
      sessionStorage.setItem(TOKEN_KEY, result.token);
      setPassword('');
      setNeedsLogin(false);
      setLoading(true);
      setError(null);
      setToken(result.token);
      setListEpoch((n) => n + 1);
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setSigningIn(false);
    }
  };

  const signOut = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken('');
    setOrders([]);
    setNeedsLogin(true);
    setLoading(false);
    setError(null);
    setActionError(null);
  };

  const toMake = useMemo(() => orders.filter(isToMake), [orders]);
  const shipped = useMemo(
    () => orders.filter((order) => shopStatus(order) === 'shipped'),
    [orders],
  );
  const visible = filter === 'make' ? toMake : filter === 'shipped' ? shipped : orders;

  const markJob = async (orderId: string, fulfillmentStatus: 'new' | 'making' | 'shipped') => {
    setUpdatingId(orderId);
    setActionError(null);
    try {
      const result = await setFulfillmentStatus(orderId, fulfillmentStatus, token || undefined);
      setOrders((current) =>
        current.map((order) => (order.id === orderId ? { ...order, ...result.order } : order)),
      );
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Could not update job');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#0f111a] text-slate-200" data-testid="jobs-board">
      <div className="mx-auto w-full max-w-4xl px-4 pb-8">
        <div className="flex flex-wrap items-end justify-between gap-3 pt-6">
          <div>
            <p className="text-xs font-black tracking-widest text-pink-400 uppercase">
              West Vinyl Studio
            </p>
            <h1 className="text-2xl font-mono text-pink-500">Orders</h1>
            <p className="mt-1 max-w-xl text-sm text-slate-400">
              Paid vinyl and apparel jobs land here after Stripe. The queue starts on To make.
              Pending checkouts stay under All until they are paid or expire.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {token ? (
              <button
                type="button"
                onClick={signOut}
                className="inline-flex min-h-11 items-center rounded border border-slate-600 px-3 font-mono text-sm hover:bg-slate-800"
              >
                Sign out
              </button>
            ) : null}
            <a
              href="/"
              className="inline-flex min-h-11 items-center rounded border border-slate-600 px-3 font-mono text-sm hover:bg-slate-800"
            >
              Studio
            </a>
          </div>
        </div>

        {needsLogin ? (
          <form
            className="mt-6 space-y-3 rounded border border-slate-800 bg-[#181a25] p-4"
            data-testid="jobs-login"
            onSubmit={(event) => {
              event.preventDefault();
              void signIn();
            }}
          >
            <p className="font-mono text-sm text-slate-300">Sign in to open the jobs board.</p>
            <label className="block space-y-1 font-mono text-xs text-slate-400">
              <span>Username</span>
              <input
                name="username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </label>
            <label className="block space-y-1 font-mono text-xs text-slate-400">
              <span>Password</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </label>
            {loginError ? <p className="font-mono text-sm text-red-400">{loginError}</p> : null}
            <button
              type="submit"
              disabled={signingIn}
              className="min-h-11 rounded bg-pink-500 px-4 font-mono text-sm text-gray-900 hover:bg-pink-600 disabled:opacity-50"
            >
              {signingIn ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : null}

        {needsLogin ? null : (
        <div
          className="sticky top-0 z-20 -mx-4 mt-6 space-y-1 border-b border-slate-800 bg-[#0f111a] px-4 py-3 font-mono text-xs text-slate-500 shadow-[0_8px_16px_-8px_rgba(0,0,0,0.65)]"
          data-testid="jobs-board-filters"
          style={{ backgroundColor: '#0f111a' }}
        >
          {store ? (
            <p>
              Store: {describeStore(store)} · {toMake.length} to make · {shipped.length} shipped
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            {(
              [
                ['make', `To make (${toMake.length})`],
                ['shipped', `Shipped (${shipped.length})`],
                ['all', `All (${orders.length})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`min-h-9 rounded border px-3 font-mono text-xs ${
                  filter === id
                    ? 'border-pink-500 bg-pink-500/10 text-pink-300'
                    : 'border-slate-700 text-slate-400 hover:bg-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p>
            Production URL: <code className="text-slate-400">/admin/orders</code> (alias{' '}
            <code className="text-slate-400">/jobs</code>).
          </p>
        </div>
        )}

        {actionError ? <p className="mt-4 font-mono text-sm text-red-400">{actionError}</p> : null}

        {needsLogin ? null : loading ? (
          <p className="mt-4 font-mono text-sm text-slate-400">Loading jobs…</p>
        ) : error ? (
          <div className="mt-4 space-y-1">
            <p className="font-mono text-sm text-red-400">{error}</p>
          </div>
        ) : visible.length === 0 ? (
          <p className="mt-4 font-mono text-sm text-slate-400">
            {filter === 'make' ? 'Nothing to make right now.' : 'No jobs in this view.'}
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {visible.map((order) => {
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
                        {order.status === 'paid' || order.status === 'unverified' ? (
                          <span
                            className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase ${statusClass(shopStatus(order))}`}
                          >
                            {shopStatus(order)}
                          </span>
                        ) : null}
                        <span className="font-mono text-sm text-pink-400">
                          {describeOrderJob(order.orderConfig)}
                        </span>
                      </div>
                      <JobSizeLine orderConfig={order.orderConfig} />
                      <JobQuoteLine orderConfig={order.orderConfig} />
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
                    {isToMake(order) && shopStatus(order) === 'new' ? (
                      <button
                        type="button"
                        disabled={updatingId === order.id}
                        onClick={() => void markJob(order.id, 'making')}
                        className="min-h-10 rounded border border-orange-500 px-3 font-mono text-xs text-orange-300 hover:bg-orange-500/10 disabled:opacity-50"
                      >
                        Start making
                      </button>
                    ) : null}
                    {isToMake(order) ? (
                      <button
                        type="button"
                        disabled={updatingId === order.id}
                        onClick={() => void markJob(order.id, 'shipped')}
                        className="min-h-10 rounded border border-violet-500 px-3 font-mono text-xs text-violet-300 hover:bg-violet-500/10 disabled:opacity-50"
                      >
                        Mark shipped
                      </button>
                    ) : null}
                    {shopStatus(order) === 'shipped' ? (
                      <button
                        type="button"
                        disabled={updatingId === order.id}
                        onClick={() => void markJob(order.id, 'new')}
                        className="min-h-10 rounded border border-slate-600 px-3 font-mono text-xs hover:bg-slate-800 disabled:opacity-50"
                      >
                        Reopen
                      </button>
                    ) : null}
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
