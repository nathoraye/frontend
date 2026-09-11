import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyAndCapturePayPalOrder } from '../api/_lib/paypal.js';

test('verifyAndCapturePayPalOrder rejects amount mismatch', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/v1/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
    }
    if (url.includes('/v2/checkout/orders/') && (!init?.method || init.method === 'GET')) {
      return new Response(
        JSON.stringify({
          id: 'PAY-1',
          status: 'COMPLETED',
          purchase_units: [
            {
              payments: {
                captures: [{ id: 'CAP-1', amount: { currency_code: 'AUD', value: '1.00' } }],
              },
            },
          ],
        }),
        { status: 200 },
      );
    }
    return new Response('unexpected', { status: 500 });
  }) as typeof fetch;

  process.env.PAYPAL_CLIENT_ID = 'id';
  process.env.PAYPAL_CLIENT_SECRET = 'secret';

  try {
    await assert.rejects(
      () => verifyAndCapturePayPalOrder('PAY-1', 18.98),
      (err: Error & { status?: number }) =>
        err.status === 402 && /does not match expected/.test(err.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;
  }
});

test('verifyAndCapturePayPalOrder accepts matching COMPLETED capture', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/v1/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
    }
    if (url.includes('/capture')) {
      return new Response(
        JSON.stringify({
          id: 'PAY-2',
          status: 'COMPLETED',
          payer: { email_address: 'buyer@example.com' },
          purchase_units: [
            {
              payments: {
                captures: [{ id: 'CAP-2', amount: { currency_code: 'AUD', value: '18.98' } }],
              },
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (url.includes('/v2/checkout/orders/')) {
      return new Response(JSON.stringify({ id: 'PAY-2', status: 'APPROVED' }), { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  }) as typeof fetch;

  process.env.PAYPAL_CLIENT_ID = 'id';
  process.env.PAYPAL_CLIENT_SECRET = 'secret';

  try {
    const result = await verifyAndCapturePayPalOrder('PAY-2', 18.98);
    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.amount, 18.98);
    assert.equal(result.captureId, 'CAP-2');
    assert.equal(result.payerEmail, 'buyer@example.com');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;
  }
});
