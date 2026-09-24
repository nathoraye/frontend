export function OrderCancelPage() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('orderId');

  return (
    <div className="min-h-[100dvh] bg-[#0f111a] px-4 py-10 text-slate-200">
      <div className="mx-auto w-full max-w-lg space-y-6 rounded-lg border border-slate-800 bg-[#181a25] p-6">
        <p className="text-xs font-black tracking-widest text-pink-400 uppercase">West Vinyl Studio</p>
        <h1 className="text-2xl font-mono text-pink-500">Checkout cancelled</h1>
        <p className="font-mono text-sm text-slate-300">
          No payment was taken. The design is still on your studio mat — you can start checkout
          again when you are ready.
        </p>
        {orderId ? (
          <p className="font-mono text-xs text-slate-500">
            Pending job {orderId} stays unpaid until you complete Stripe Checkout.
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <a
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded bg-pink-500 px-4 font-mono text-sm text-gray-900 hover:bg-pink-600"
          >
            Back to studio
          </a>
          <a
            href="/terms"
            className="inline-flex min-h-11 items-center justify-center rounded border border-slate-600 px-4 font-mono text-sm hover:bg-slate-800"
          >
            Shipping and returns
          </a>
        </div>
      </div>
    </div>
  );
}

export default OrderCancelPage;
