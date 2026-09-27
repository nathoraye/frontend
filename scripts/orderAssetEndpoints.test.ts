import assert from 'node:assert/strict';
import test from 'node:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  handleCreateCheckoutSession,
  handleGetOrder,
  handleGetOrderAsset,
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

const designSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20" fill="pink"/></svg>';
// 1x1 PNG
const designPreviewPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('jobs board can fetch design SVG and product preview as authenticated assets', async () => {
  const file = path.join(os.tmpdir(), `wvs-assets-${Date.now()}.json`);
  process.env.ALLOW_UNVERIFIED_ORDERS = '1';
  process.env.ALLOW_PUBLIC_ORDER_LIST = '1';
  process.env.ORDER_STORE = 'file';
  process.env.ORDERS_FILE = file;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.BLOB_STORE_ID;
  delete process.env.BLOB_READ_WRITE_TOKEN;

  const created = await handleCreateCheckoutSession({
    customer,
    orderConfig: { orderType: 'vinyl', quantity: 1 },
    designSvg,
    designPreviewPng,
    origin: 'http://localhost:5173',
  });

  assert.ok(created.orderId.startsWith('ord-'));

  const detail = await handleGetOrder({ headers: {} }, created.orderId);
  assert.equal(detail.order.hasDesign, true);
  assert.equal(detail.order.hasPreview, true);
  assert.match(detail.order.designSvg || '', /<svg/);
  assert.ok((detail.order.designPreviewPng || '').startsWith('data:image/png'));

  const design = await handleGetOrderAsset({ headers: {} }, created.orderId, 'design', {
    download: true,
  });
  assert.match(design.contentType, /svg/);
  assert.equal(design.fileName, `${created.orderId}.svg`);
  assert.match(design.body.toString('utf8'), /fill="pink"/);

  const preview = await handleGetOrderAsset({ headers: {} }, created.orderId, 'preview');
  assert.equal(preview.contentType, 'image/png');
  assert.equal(preview.fileName, `${created.orderId}-preview.png`);
  assert.ok(preview.body.length > 10);

  await fs.unlink(file).catch(() => {});
});
