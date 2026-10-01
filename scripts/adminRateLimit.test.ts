import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ordersHandler from '../api/orders.js';
import { handleAdminLogin, secretEqual } from '../api/_lib/adminSession.js';
import {
  ADMIN_AUTH_FAILURE_LIMIT,
  ADMIN_AUTH_FAILURE_WINDOW_MS,
  clearAdminAuthRateLimitMemoryForTests,
  registerAdminAuthFailure,
  resetAdminAuthRateLimitForTests,
  setAdminAuthDurableStoreForTests,
} from '../api/_lib/adminRateLimit.js';
import {
  handleCreateCheckoutSession,
  handleListOrders,
  handleSetFulfillment,
  handleStripeWebhookRequest,
} from '../api/_lib/orderService.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const customer = {
  fullName: 'Ada Vinyl',
  email: 'ada@example.com',
  street: '1 Cut Street',
  city: 'Sydney',
  state: 'NSW',
  postcode: '2000',
  country: 'Australia',
};

const designSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>';

function snapshotEnv(keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(prev: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(prev)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const ENV_KEYS = [
  'JOBS_ADMIN_USERNAME',
  'JOBS_ADMIN_PASSWORD',
  'ORDERS_ADMIN_TOKEN',
  'ALLOW_PUBLIC_ORDER_LIST',
  'ALLOW_UNVERIFIED_ORDERS',
  'ORDER_STORE',
  'ORDERS_FILE',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'BLOB_STORE_ID',
  'BLOB_READ_WRITE_TOKEN',
  'PUBLIC_APP_URL',
];

function mockRes() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
    end(body?: unknown) {
      this.body = body;
    },
  };
}

describe('admin auth rate limit', { concurrency: 1 }, () => {
  test('secret compare matches regardless of length and rejects mismatches', () => {
    assert.equal(secretEqual('secret-admin', 'secret-admin'), true);
    assert.equal(secretEqual('short', 'much-longer-secret-value'), false);
    assert.equal(secretEqual('secret-admin', 'secret-admin '), false);
  });

  test('robots.txt disallows the jobs board and still allows the public site', async () => {
    const robots = await fs.readFile(path.join(root, 'public/robots.txt'), 'utf8');
    const lines = robots.split(/\r?\n/).map((line) => line.trim());
    assert.ok(lines.includes('Allow: /'));
    assert.ok(lines.includes('Disallow: /admin/orders'));
    assert.ok(lines.includes('Disallow: /jobs'));
    assert.equal(lines.includes('Disallow: /'), false);
    const rootPage = await fs.readFile(path.join(root, 'src/RootPage.tsx'), 'utf8');
    assert.match(rootPage, /noindex, nofollow/);
    const vercel = JSON.parse(await fs.readFile(path.join(root, 'vercel.json'), 'utf8')) as {
      headers: { source: string; headers: { key: string; value: string }[] }[];
    };
    for (const source of ['/admin/orders', '/admin/orders/', '/jobs', '/jobs/']) {
      const entry = vercel.headers.find((item) => item.source === source);
      assert.ok(entry, source);
      assert.ok(
        entry.headers.some((header) => header.key === 'X-Robots-Tag' && header.value === 'noindex, nofollow'),
      );
    }
  });

  test('ten failed tokens return 401, the next returns 429, and a valid token still works', async () => {
    const file = path.join(os.tmpdir(), `wvs-rate-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
    const prev = snapshotEnv(ENV_KEYS);
    const ip = '203.0.113.10';
    const order = {
      id: 'ord-rate-1',
      createdAt: new Date().toISOString(),
      status: 'paid',
      amount: 18.98,
      currency: 'aud',
      customer,
      orderConfig: { orderType: 'vinyl', quantity: 1 },
      designSvg,
    };
    resetAdminAuthRateLimitForTests();
    process.env.ORDERS_ADMIN_TOKEN = 'secret-admin';
    process.env.JOBS_ADMIN_USERNAME = 'shop-admin';
    process.env.JOBS_ADMIN_PASSWORD = 'test-password-value';
    process.env.ALLOW_PUBLIC_ORDER_LIST = '0';
    process.env.ALLOW_UNVERIFIED_ORDERS = '1';
    process.env.ORDER_STORE = 'file';
    process.env.ORDERS_FILE = file;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.BLOB_STORE_ID;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    await fs.writeFile(file, JSON.stringify([order]), 'utf8');

    const wrong = { headers: { authorization: 'Bearer wrong-token', 'x-real-ip': ip } };
    try {
      for (let attempt = 0; attempt < ADMIN_AUTH_FAILURE_LIMIT; attempt += 1) {
        await assert.rejects(
          () => handleListOrders(wrong),
          (err: { status?: number }) => err.status === 401,
        );
      }
      const blocked = mockRes();
      await ordersHandler(
        { method: 'GET', headers: { authorization: 'Bearer wrong-token', 'x-real-ip': ip }, query: {} },
        blocked,
      );
      assert.equal(blocked.statusCode, 429);
      assert.match(String(blocked.body), /Too many failed attempts/);
      assert.ok(Number(blocked.headers['retry-after']) > 0);

      const listed = await handleListOrders({
        headers: { authorization: 'Bearer secret-admin', 'x-real-ip': ip },
      });
      assert.equal(listed.orders.length, 1);

      const shipped = await handleSetFulfillment(
        { headers: { authorization: 'Bearer secret-admin', 'x-real-ip': ip } },
        order.id,
        { fulfillmentStatus: 'making' },
      );
      assert.equal(shipped.order.fulfillmentStatus, 'making');

      await assert.rejects(
        () =>
          handleListOrders({
            headers: { authorization: 'Bearer wrong-token', 'x-real-ip': '203.0.113.11' },
          }),
        (err: { status?: number }) => err.status === 401,
      );

      await assert.rejects(
        () => handleAdminLogin({ username: 'shop-admin', password: 'nope' }, { headers: { 'x-real-ip': ip } }),
        (err: { status?: number }) => err.status === 429,
      );

      const session = await handleAdminLogin(
        { username: 'shop-admin', password: 'test-password-value' },
        { headers: { 'x-real-ip': ip } },
      );
      assert.equal(session.ok, true);
      assert.equal(typeof session.token, 'string');

      const checkout = await handleCreateCheckoutSession(
        {
          customer,
          orderConfig: { orderType: 'vinyl', quantity: 1 },
          designSvg,
          origin: 'http://localhost:5173',
        },
        { headers: { 'x-real-ip': ip } },
      );
      assert.equal(checkout.unverified, true);
      assert.match(checkout.url, /\/order\/success/);

      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_rate_limit';
      await assert.rejects(
        () => handleStripeWebhookRequest({ headers: { 'x-real-ip': ip } }, Buffer.from('{}')),
        (err: { status?: number }) => err.status === 400,
      );
    } finally {
      resetAdminAuthRateLimitForTests();
      restoreEnv(prev);
      await fs.unlink(file).catch(() => {});
    }
  });

  test('requests without a bearer token do not consume the failure budget', async () => {
    const file = path.join(os.tmpdir(), `wvs-rate-empty-${Date.now()}.json`);
    const prev = snapshotEnv(ENV_KEYS);
    resetAdminAuthRateLimitForTests();
    process.env.ORDERS_ADMIN_TOKEN = 'secret-admin';
    process.env.ALLOW_PUBLIC_ORDER_LIST = '0';
    process.env.ORDER_STORE = 'file';
    process.env.ORDERS_FILE = file;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.BLOB_STORE_ID;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    await fs.writeFile(file, '[]', 'utf8');
    const ip = '203.0.113.12';
    try {
      for (let attempt = 0; attempt < ADMIN_AUTH_FAILURE_LIMIT + 5; attempt += 1) {
        await assert.rejects(
          () => handleListOrders({ headers: { 'x-real-ip': ip } }),
          (err: { status?: number }) => err.status === 401,
        );
      }
      await assert.rejects(
        () => handleListOrders({ headers: { authorization: 'Bearer wrong-token', 'x-real-ip': ip } }),
        (err: { status?: number }) => err.status === 401,
      );
    } finally {
      resetAdminAuthRateLimitForTests();
      restoreEnv(prev);
      await fs.unlink(file).catch(() => {});
    }
  });

  test('the failure window expires and a durable store survives a new isolate', async () => {
    resetAdminAuthRateLimitForTests();
    const start = 1_700_000_000_000;
    const req = { headers: { 'x-real-ip': '203.0.113.30' } };
    try {
      for (let attempt = 0; attempt < ADMIN_AUTH_FAILURE_LIMIT; attempt += 1) {
        const result = await registerAdminAuthFailure(req, start);
        assert.equal(result.limited, false);
      }
      const blocked = await registerAdminAuthFailure(req, start + 1000);
      assert.equal(blocked.limited, true);
      assert.ok(blocked.retryAfterSeconds > 0);
      const reopened = await registerAdminAuthFailure(req, start + ADMIN_AUTH_FAILURE_WINDOW_MS + 1);
      assert.equal(reopened.limited, false);

      const disk = new Map<string, { count: number; resetAt: number }>();
      setAdminAuthDurableStoreForTests({
        async read(key: string) {
          return disk.get(key) ?? null;
        },
        async write(key: string, record: { count: number; resetAt: number }) {
          disk.set(key, { ...record });
        },
      });
      clearAdminAuthRateLimitMemoryForTests();
      const freshIp = { headers: { 'x-real-ip': '203.0.113.40' } };
      for (let attempt = 0; attempt < ADMIN_AUTH_FAILURE_LIMIT; attempt += 1) {
        await registerAdminAuthFailure(freshIp, start);
      }
      assert.equal(disk.size, 1);
      clearAdminAuthRateLimitMemoryForTests();
      const fromStore = await registerAdminAuthFailure(freshIp, start + 1000);
      assert.equal(fromStore.limited, true);
    } finally {
      resetAdminAuthRateLimitForTests();
    }
  });
});
