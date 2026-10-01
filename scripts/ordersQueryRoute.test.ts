import assert from 'node:assert/strict';
import test from 'node:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ordersHandler from '../api/orders.js';
import { handleCreateCheckoutSession } from '../api/_lib/orderService.js';

const customer = {
  fullName: 'Ada Vinyl',
  email: 'ada@example.com',
  street: '1 Cut Street',
  city: 'Sydney',
  state: 'NSW',
  postcode: '2000',
  country: 'Australia',
};

const designSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20" fill="pink"/></svg>';
const designPreviewPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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

test('GET /api/orders?id=&asset=design returns the SVG, not HTML', async () => {
  const file = path.join(os.tmpdir(), `wvs-query-route-${Date.now()}.json`);
  process.env.ALLOW_UNVERIFIED_ORDERS = '1';
  process.env.ALLOW_PUBLIC_ORDER_LIST = '1';
  process.env.ORDER_STORE = 'file';
  process.env.ORDERS_FILE = file;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.BLOB_STORE_ID;
  delete process.env.BLOB_READ_WRITE_TOKEN;

  const created = await handleCreateCheckoutSession({
    customer,
    orderConfig: {
      orderType: 'vinyl',
      productType: 'decal',
      widthCm: 10,
      heightCm: 10,
      designType: 'graphic',
      shippingOption: 'untracked',
      quantity: 1,
    },
    designSvg,
    designPreviewPng,
    origin: 'http://localhost:5173',
  });

  const detail = mockRes();
  await ordersHandler(
    { method: 'GET', headers: {}, query: { id: created.orderId } },
    detail,
  );
  assert.equal(detail.statusCode, 200);
  assert.match(String(detail.headers['content-type']), /json/);
  const parsed = JSON.parse(String(detail.body)) as { order: { designSvg: string } };
  assert.match(parsed.order.designSvg, /fill="pink"/);

  const design = mockRes();
  await ordersHandler(
    {
      method: 'GET',
      headers: {},
      query: { id: created.orderId, asset: 'design', download: '1' },
    },
    design,
  );
  assert.equal(design.statusCode, 200);
  assert.match(String(design.headers['content-type']), /svg/);
  assert.equal(String(design.headers['content-type']).includes('text/html'), false);
  assert.match(Buffer.from(design.body as Uint8Array).toString('utf8'), /<svg/);

  const preview = mockRes();
  await ordersHandler(
    { method: 'GET', headers: {}, query: { id: created.orderId, asset: 'preview' } },
    preview,
  );
  assert.equal(preview.statusCode, 200);
  assert.match(String(preview.headers['content-type']), /png/);
  assert.ok(Buffer.from(preview.body as Uint8Array).length > 10);

  await fs.unlink(file).catch(() => {});
});
