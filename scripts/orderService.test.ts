import assert from 'node:assert/strict';
import test from 'node:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  handleCreatePayPalOrder,
  handleListOrders,
  handleSubmitOrder,
} from '../api/_lib/orderService.js';

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

test('unverified local checkout creates and lists an order', async () => {
  const file = path.join(os.tmpdir(), `wvs-orders-${Date.now()}.json`);
  process.env.ALLOW_UNVERIFIED_ORDERS = '1';
  process.env.ALLOW_PUBLIC_ORDER_LIST = '1';
  process.env.ORDER_STORE = 'file';
  process.env.ORDERS_FILE = file;
  delete process.env.PAYPAL_CLIENT_ID;
  delete process.env.PAYPAL_CLIENT_SECRET;

  const created = await handleCreatePayPalOrder({
    orderConfig: { orderType: 'vinyl', quantity: 1 },
  });
  assert.ok(created.id.startsWith('LOCAL-'));
  assert.equal(created.unverified, true);
  assert.equal(created.amount, '18.98');

  const submitted = await handleSubmitOrder({
    paypalOrderId: created.id,
    customer,
    orderConfig: { orderType: 'vinyl', quantity: 1 },
    designSvg,
  });
  assert.equal(submitted.order.status, 'unverified');
  assert.equal(submitted.ordersCount, 1);

  const again = await handleSubmitOrder({
    paypalOrderId: created.id,
    customer,
    orderConfig: { orderType: 'vinyl', quantity: 1 },
    designSvg,
  });
  assert.equal(again.duplicate, true);
  assert.equal(again.ordersCount, 1);

  const listed = await handleListOrders({ headers: {} });
  assert.equal(listed.orders.length, 1);
  assert.equal(listed.orders[0].id, submitted.order.id);

  await fs.unlink(file).catch(() => {});
});

test('order list is gated without admin token', async () => {
  process.env.ALLOW_PUBLIC_ORDER_LIST = '0';
  process.env.ORDERS_ADMIN_TOKEN = 'secret-admin';
  await assert.rejects(
    () => handleListOrders({ headers: {} }),
    (err) => err.status === 401,
  );
  const listed = await handleListOrders({ headers: { authorization: 'Bearer secret-admin' } });
  assert.ok(Array.isArray(listed.orders));
});

test('submit rejects tiny design payloads', async () => {
  process.env.ALLOW_UNVERIFIED_ORDERS = '1';
  await assert.rejects(
    () =>
      handleSubmitOrder({
        paypalOrderId: 'LOCAL-1',
        customer,
        orderConfig: { orderType: 'vinyl', quantity: 1 },
        designSvg: '<svg/>',
      }),
    (err) => err.status === 400,
  );
});
