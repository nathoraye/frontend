import assert from 'node:assert/strict';
import { test } from 'node:test';
import handler from '../api/departments.js';
import { DEPARTMENTS } from '../src/config/departments.ts';

function response() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: {} as { collection?: unknown; error?: string },
    setHeader(name: string, value: string) { this.headers[name] = value; },
    status(code: number) { this.statusCode = code; return this; },
    json(body: typeof this.body) { this.body = body; },
  };
}

test('departments have unique routing handles and badge tags', () => {
  assert.equal(new Set(DEPARTMENTS.map(d => d.handle)).size, 3);
  assert.equal(new Set(DEPARTMENTS.map(d => d.badgeTag)).size, 3);
  assert.deepEqual(DEPARTMENTS.map(d => d.badgeTag), ['dept:custom', 'dept:crafts', 'dept:finds']);
});

test('collection endpoint validates inputs, proxies products and fails safely', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network request'); });
  const previous = { ...process.env };
  t.after(() => { process.env = previous; });
  process.env.SHOPIFY_STORE_DOMAIN = '';
  process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN = '';
  process.env.SHOPIFY_STOREFRONT_API_VERSION = '';
  const call = async (handle: string, method = 'GET') => {
    const res = response();
    await handler({ url: `/api/departments?handle=${handle}`, method }, res);
    return res;
  };
  assert.equal((await call('arbitrary')).statusCode, 400);
  assert.equal((await call(DEPARTMENTS[0].handle, 'POST')).statusCode, 405);
  assert.equal((await call(DEPARTMENTS[0].handle)).statusCode, 503);
  process.env.SHOPIFY_STORE_DOMAIN = 'example.myshopify.com';
  process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN = 'fixture-token';
  process.env.SHOPIFY_STOREFRONT_API_VERSION = '2026-10';
  for (const department of DEPARTMENTS) {
    const collection = { id: 'collection', title: department.name, description: '', products: { edges: [] } };
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(url, 'https://example.myshopify.com/api/2026-10/graphql.json');
      assert.equal(options.headers['X-Shopify-Storefront-Access-Token'], 'fixture-token');
      const body = JSON.parse(options.body);
      assert.equal(body.variables.handle, department.handle);
      assert.match(body.query, /products\(first: 12\)/);
      return { ok: true, json: async () => ({ data: { collection } }) };
    });
    const res = await call(department.handle);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { collection });
    assert.equal(res.headers['Cache-Control'], 'no-store');
  }
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ data: { collection: null } }) }));
  assert.deepEqual((await call(DEPARTMENTS[2].handle)).body, { collection: null });
  for (const payload of [{ errors: [{ message: 'private upstream detail' }] }, {}]) {
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => payload }));
    const res = await call(DEPARTMENTS[0].handle);
    assert.equal(res.statusCode, 502);
    assert.doesNotMatch(JSON.stringify(res.body), /fixture-token|private upstream/);
  }
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false }));
  assert.equal((await call(DEPARTMENTS[0].handle)).statusCode, 502);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Timeout'); });
  assert.equal((await call(DEPARTMENTS[0].handle)).statusCode, 502);
  process.env.SHOPIFY_STORE_DOMAIN = 'example.com/path';
  assert.equal((await call(DEPARTMENTS[0].handle)).statusCode, 503);
});
