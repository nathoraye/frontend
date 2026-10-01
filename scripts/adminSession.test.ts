import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handleAdminLogin, issueSessionToken, sessionTokenValid } from '../api/_lib/adminSession.js';
import { handleListOrders, handleSetFulfillment } from '../api/_lib/orderService.js';

const customer = {
  fullName: 'Ada Vinyl',
  email: 'ada@example.com',
  street: '1 Cut Street',
  city: 'Sydney',
  state: 'NSW',
  postcode: '2000',
  country: 'Australia',
};

function snapshotEnv(keys) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(prev) {
  for (const [key, value] of Object.entries(prev)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe('jobs admin session', { concurrency: 1 }, () => {
test('shop password issues a session and does not accept the password as a bearer', async () => {
  const file = path.join(os.tmpdir(), `wvs-admin-session-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  const prev = snapshotEnv([
    'JOBS_ADMIN_USERNAME',
    'JOBS_ADMIN_PASSWORD',
    'ORDERS_ADMIN_TOKEN',
    'ALLOW_PUBLIC_ORDER_LIST',
    'ALLOW_UNVERIFIED_ORDERS',
    'ORDER_STORE',
    'ORDERS_FILE',
    'STRIPE_SECRET_KEY',
    'BLOB_STORE_ID',
    'BLOB_READ_WRITE_TOKEN',
  ]);
  process.env.JOBS_ADMIN_USERNAME = 'shop-admin';
  process.env.JOBS_ADMIN_PASSWORD = 'test-password-value';
  process.env.ORDERS_ADMIN_TOKEN = 'server-token-not-the-password';
  process.env.ALLOW_PUBLIC_ORDER_LIST = '0';
  process.env.ALLOW_UNVERIFIED_ORDERS = '0';
  process.env.ORDER_STORE = 'file';
  process.env.ORDERS_FILE = file;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.BLOB_STORE_ID;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  await fs.writeFile(file, '[]', 'utf8');

  try {
    await assert.rejects(
      async () => handleListOrders({ headers: {} }),
      (err) => err.status === 401,
    );
    await assert.rejects(
      async () => handleAdminLogin({ username: 'shop-admin', password: 'nope' }),
      (err) => err.status === 401 && err.message === 'Wrong username or password',
    );
    await assert.rejects(
      async () => handleAdminLogin({ username: 'someone-else', password: 'test-password-value' }),
      (err) => err.status === 401,
    );

    const session = await handleAdminLogin({
      username: '  shop-admin  ',
      password: 'test-password-value',
    });
    assert.equal(session.ok, true);
    assert.equal(session.token.includes('test-password-value'), false);
    assert.equal(session.token.includes('server-token-not-the-password'), false);
    assert.equal(sessionTokenValid(session.token), true);

    const listed = await handleListOrders({
      headers: { authorization: `Bearer ${session.token}` },
    });
    assert.ok(Array.isArray(listed.orders));

    await assert.rejects(
      () =>
        handleListOrders({
          headers: { authorization: 'Bearer test-password-value' },
        }),
      (err) => err.status === 401,
    );

    const expired = issueSessionToken('shop-admin', Date.now() - 20 * 24 * 60 * 60 * 1000);
    assert.equal(sessionTokenValid(expired), false);

    const tampered = `${session.token.slice(0, -1)}${session.token.endsWith('a') ? 'b' : 'a'}`;
    assert.equal(sessionTokenValid(tampered), false);

    const legacy = await handleListOrders({
      headers: { authorization: 'Bearer server-token-not-the-password' },
    });
    assert.ok(Array.isArray(legacy.orders));
  } finally {
    restoreEnv(prev);
    await fs.unlink(file).catch(() => {});
  }
});

test('fulfillment updates accept the signed session', async () => {
  const file = path.join(os.tmpdir(), `wvs-admin-fulfill-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  const prev = snapshotEnv([
    'JOBS_ADMIN_USERNAME',
    'JOBS_ADMIN_PASSWORD',
    'ORDERS_ADMIN_TOKEN',
    'ALLOW_PUBLIC_ORDER_LIST',
    'ORDER_STORE',
    'ORDERS_FILE',
    'BLOB_STORE_ID',
    'BLOB_READ_WRITE_TOKEN',
  ]);
  process.env.JOBS_ADMIN_USERNAME = 'shop-admin';
  process.env.JOBS_ADMIN_PASSWORD = 'test-password-value';
  process.env.ORDERS_ADMIN_TOKEN = 'server-token-not-the-password';
  process.env.ALLOW_PUBLIC_ORDER_LIST = '0';
  process.env.ORDER_STORE = 'file';
  process.env.ORDERS_FILE = file;
  delete process.env.BLOB_STORE_ID;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  const order = {
    id: 'ord-session-1',
    createdAt: new Date().toISOString(),
    status: 'paid',
    amount: 18.98,
    currency: 'aud',
    customer,
    orderConfig: { orderType: 'vinyl', quantity: 1 },
    designSvg: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>',
  };
  await fs.writeFile(file, JSON.stringify([order]), 'utf8');

  try {
    const session = await handleAdminLogin({ username: 'shop-admin', password: 'test-password-value' });
    const shipped = await handleSetFulfillment(
      { headers: { authorization: `Bearer ${session.token}` } },
      order.id,
      { fulfillmentStatus: 'shipped' },
    );
    assert.equal(shipped.order.fulfillmentStatus, 'shipped');
  } finally {
    restoreEnv(prev);
    await fs.unlink(file).catch(() => {});
  }
});

test('login stays closed when the shop username or password is unset', async () => {
  const prev = snapshotEnv(['JOBS_ADMIN_USERNAME', 'JOBS_ADMIN_PASSWORD', 'ORDERS_ADMIN_TOKEN']);
  delete process.env.JOBS_ADMIN_USERNAME;
  delete process.env.JOBS_ADMIN_PASSWORD;
  process.env.ORDERS_ADMIN_TOKEN = 'server-token-not-the-password';
  try {
    await assert.rejects(
      () => handleAdminLogin({ username: 'shop-admin', password: 'test-password-value' }),
      (err) => err.status === 503 && /not set up/i.test(err.message),
    );
  } finally {
    restoreEnv(prev);
  }
});
});
