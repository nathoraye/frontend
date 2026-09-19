import assert from 'node:assert/strict';
import test from 'node:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  orderStoreAuthMode,
  orderStoreLocation,
  probeOrderStore,
} from '../api/_lib/orderStore.js';

test('BLOB_STORE_ID selects blob mode without requiring RW token', async () => {
  const prev = {
    ORDER_STORE: process.env.ORDER_STORE,
    BLOB_STORE_ID: process.env.BLOB_STORE_ID,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    ORDERS_FILE: process.env.ORDERS_FILE,
  };

  try {
    delete process.env.ORDER_STORE;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    process.env.BLOB_STORE_ID = 'store_testBlobOidc';

    assert.equal(orderStoreLocation(), 'vercel-blob:west-vinyl-orders.json');
    assert.equal(orderStoreAuthMode(), 'oidc-or-store-id');
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('file store probe succeeds for local ORDER_STORE=file', async () => {
  const file = path.join(os.tmpdir(), `wvs-blob-probe-${Date.now()}.json`);
  const prev = {
    ORDER_STORE: process.env.ORDER_STORE,
    ORDERS_FILE: process.env.ORDERS_FILE,
    BLOB_STORE_ID: process.env.BLOB_STORE_ID,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  };

  try {
    process.env.ORDER_STORE = 'file';
    process.env.ORDERS_FILE = file;
    delete process.env.BLOB_STORE_ID;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    await fs.writeFile(file, '[]', 'utf8');

    const probe = await probeOrderStore();
    assert.equal(probe.ok, true);
    assert.equal(probe.mode, 'file');
    assert.equal(orderStoreAuthMode(), 'file');
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.unlink(file).catch(() => {});
  }
});
