import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import generateHandler from '../api/generate.js';
import stickerHandler from '../api/generate-sticker.js';
import { createArtwork } from '../api/_lib/imageGenerate.js';
import {
  buildPollinationsImageUrl,
  resetImageProviderForTests,
  setImageFetchForTests,
} from '../api/_lib/imageProvider.js';
import { flattenArtworkBytes } from '../api/_lib/imageFlatten.js';
import {
  IMAGE_PROMPT_MAX_LENGTH,
  VINYL_PROMPT_SUFFIX,
  isLogoPrompt,
  letteringFromPrompt,
  sanitizeImagePrompt,
  wrapVinylPrompt,
} from '../api/_lib/imagePrompt.js';
import { renderStencilWordmark } from '../api/_lib/imageWordmark.js';
import {
  IMAGE_QUOTA_LIMIT,
  clearImageQuotaMemoryForTests,
  readImageQuota,
  refundImageGeneration,
  reserveImageGeneration,
  resetImageQuotaForTests,
  setImageQuotaDurableStoreForTests,
} from '../api/_lib/imageQuota.js';

const SUFFIX = VINYL_PROMPT_SUFFIX;

function pngBytes() {
  const bytes = Buffer.alloc(48, 7);
  bytes[0] = 0x89;
  bytes[1] = 0x50;
  bytes[2] = 0x4e;
  bytes[3] = 0x47;
  bytes[4] = 0x0d;
  bytes[5] = 0x0a;
  bytes[6] = 0x1a;
  bytes[7] = 0x0a;
  return bytes;
}

function imageResponse(bytes: Buffer, ok = true, status = 200) {
  const copy = Uint8Array.from(bytes);
  return {
    ok,
    status,
    async arrayBuffer() {
      return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
    },
    async json() {
      return {};
    },
  };
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

function req(ip: string, body?: unknown, method = 'POST') {
  return { method, headers: { 'x-real-ip': ip }, body };
}

describe('artwork prompt, provider, and quota', { concurrency: 1 }, () => {
  test('vinyl wrapper uses the cut-ready suffix', () => {
    assert.match(VINYL_PROMPT_SUFFIX, /Solid flat black shapes only/);
    assert.match(VINYL_PROMPT_SUFFIX, /no text, no letters/);
    assert.equal(wrapVinylPrompt('a bold star'), `a bold star. ${SUFFIX}`);
    assert.equal(isLogoPrompt('a bold black cat head'), false);
    assert.equal(isLogoPrompt('a collection of cats'), false);
    assert.equal(isLogoPrompt('hunnid collection logo'), true);
    assert.equal(isLogoPrompt('west vinyl studio wordmark'), true);
    assert.equal(letteringFromPrompt('hunnid collection logo'), 'HUNNID COLLECTION');
    assert.equal(letteringFromPrompt('bold wordmark that says NORTH'), 'NORTH');
    assert.match(wrapVinylPrompt('hunnid collection logo'), /"HUNNID COLLECTION"/);
    assert.match(wrapVinylPrompt('hunnid collection logo'), /no face/);
    assert.doesNotMatch(wrapVinylPrompt('a bold black cat head'), /HUNNID|wordmark|no face/);
  });

  test('sanitizer trims, caps length, and blocks obvious abuse', () => {
    assert.equal(sanitizeImagePrompt('  bold \n star  '), 'bold star');
    assert.equal(sanitizeImagePrompt('a cute baby dinosaur'), 'a cute baby dinosaur');
    assert.equal(sanitizeImagePrompt('a'.repeat(IMAGE_PROMPT_MAX_LENGTH)), 'a'.repeat(IMAGE_PROMPT_MAX_LENGTH));

    for (const bad of ['', '   ', '...', 12, 'a'.repeat(IMAGE_PROMPT_MAX_LENGTH + 1), 'csam logo', 'child porn sticker', 'nude child']) {
      assert.throws(() => sanitizeImagePrompt(bad as string), (error: { status?: number }) => error.status === 400);
    }
  });

  test('pollinations url requests flux, size, nologo, seed, and referrer', () => {
    const url = new URL(buildPollinationsImageUrl(`a bold star, ${SUFFIX}`, 42));
    assert.equal(url.origin, 'https://image.pollinations.ai');
    assert.equal(decodeURIComponent(url.pathname.replace('/prompt/', '')), `a bold star, ${SUFFIX}`);
    assert.equal(url.searchParams.get('model'), 'flux');
    assert.equal(url.searchParams.get('width'), '1024');
    assert.equal(url.searchParams.get('height'), '1024');
    assert.equal(url.searchParams.get('nologo'), 'true');
    assert.equal(url.searchParams.get('enhance'), 'false');
    assert.equal(url.searchParams.get('seed'), '42');
    assert.equal(url.searchParams.get('referrer'), 'westvinylstudio.com');
  });

  test('five generations are allowed, the sixth is refused, and a new day opens the quota', async () => {
    resetImageQuotaForTests();
    const now = Date.UTC(2026, 9, 6, 15, 0, 0);
    const visitor = { headers: { 'x-real-ip': '203.0.113.20' } };
    try {
      for (let attempt = 0; attempt < IMAGE_QUOTA_LIMIT; attempt += 1) {
        const reserved = await reserveImageGeneration(visitor, now);
        assert.equal(reserved.ok, true);
        assert.equal(reserved.remaining, IMAGE_QUOTA_LIMIT - attempt - 1);
      }
      const blocked = await reserveImageGeneration(visitor, now);
      assert.equal(blocked.ok, false);
      assert.equal(blocked.remaining, 0);

      const other = await reserveImageGeneration({ headers: { 'x-real-ip': '203.0.113.21' } }, now);
      assert.equal(other.ok, true);
      assert.equal(other.remaining, IMAGE_QUOTA_LIMIT - 1);

      const nextDay = await reserveImageGeneration(visitor, blocked.resetAt);
      assert.equal(nextDay.ok, true);
      assert.equal(nextDay.remaining, IMAGE_QUOTA_LIMIT - 1);
    } finally {
      resetImageQuotaForTests();
    }
  });

  test('a provider failure refunds the slot, and the durable store survives a new isolate', async () => {
    resetImageQuotaForTests();
    const now = Date.UTC(2026, 9, 6, 8, 0, 0);
    const visitor = { headers: { 'x-real-ip': '203.0.113.30' } };
    const disk = new Map<string, { count: number; resetAt: number }>();
    try {
      await reserveImageGeneration(visitor, now);
      const refunded = await refundImageGeneration(visitor, now);
      assert.equal(refunded.remaining, IMAGE_QUOTA_LIMIT);
      const again = await refundImageGeneration(visitor, now);
      assert.equal(again.remaining, IMAGE_QUOTA_LIMIT);

      setImageQuotaDurableStoreForTests({
        async read(key: string) {
          return disk.get(key) ?? null;
        },
        async write(key: string, record: { count: number; resetAt: number }) {
          disk.set(key, { ...record });
        },
      });
      clearImageQuotaMemoryForTests();
      for (let attempt = 0; attempt < IMAGE_QUOTA_LIMIT; attempt += 1) {
        await reserveImageGeneration(visitor, now);
      }
      assert.equal(disk.size, 1);
      clearImageQuotaMemoryForTests();
      const fromStore = await reserveImageGeneration(visitor, now + 1000);
      assert.equal(fromStore.ok, false);
      const status = await readImageQuota(visitor, now + 1000);
      assert.equal(status.remaining, 0);
    } finally {
      resetImageQuotaForTests();
    }
  });

  test('the route returns an image, rejects bad prompts without spending quota, and stops at five', async () => {
    resetImageQuotaForTests();
    resetImageProviderForTests();
    const prevProvider = process.env.IMAGE_PROVIDER;
    delete process.env.IMAGE_PROVIDER;
    const calls: string[] = [];
    let failFluxOnce = true;
    const ip = '203.0.113.40';
    try {
      setImageFetchForTests(async (url: string) => {
        calls.push(String(url));
        assert.match(String(url), /image\.pollinations\.ai\/prompt\//);
        assert.match(String(url), /nologo=true/);
        assert.match(String(url), /enhance=false/);
        assert.match(String(url), /width=1024/);
        assert.match(String(url), /height=1024/);
        assert.match(String(url), /referrer=westvinylstudio\.com/);
        assert.match(decodeURIComponent(String(url)), new RegExp(SUFFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        if (failFluxOnce && String(url).includes('model=flux')) {
          failFluxOnce = false;
          return imageResponse(Buffer.alloc(0), false, 401);
        }
        return imageResponse(pngBytes());
      });

      const empty = mockRes();
      await generateHandler(req(ip, { prompt: '   ' }), empty);
      assert.equal(empty.statusCode, 400);
      assert.equal(calls.length, 0);

      const blocked = mockRes();
      await generateHandler(req(ip, { prompt: 'csam logo' }), blocked);
      assert.equal(blocked.statusCode, 400);
      assert.equal(calls.length, 0);
      assert.equal((await readImageQuota(req(ip))).remaining, IMAGE_QUOTA_LIMIT);

      const created = mockRes();
      await generateHandler(req(ip, { prompt: 'a bold star' }), created);
      assert.equal(created.statusCode, 200);
      const payload = created.body as { image: string; remaining: number; limit: number };
      assert.match(payload.image, /^data:image\/png;base64,/);
      assert.equal(payload.remaining, IMAGE_QUOTA_LIMIT - 1);
      assert.equal(payload.limit, IMAGE_QUOTA_LIMIT);
      assert.equal(calls.some((url) => url.includes('model=sana')), true);
      const callsBeforeRepeat = calls.length;

      for (let attempt = 0; attempt < IMAGE_QUOTA_LIMIT - 1; attempt += 1) {
        const next = mockRes();
        await generateHandler(req(ip, { prompt: 'a bold star' }), next);
        assert.equal(next.statusCode, 200);
      }
      const denied = mockRes();
      await generateHandler(req(ip, { prompt: 'a bold star' }), denied);
      assert.equal(denied.statusCode, 429);
      assert.match(String((denied.body as { error: string }).error), /5 free artwork generations/);
      assert.equal((denied.body as { remaining: number }).remaining, 0);
      assert.ok(Number(denied.headers['retry-after']) > 0);
      assert.equal(calls.length - callsBeforeRepeat, IMAGE_QUOTA_LIMIT - 1);

      const status = mockRes();
      await generateHandler(req(ip, undefined, 'GET'), status);
      assert.equal(status.statusCode, 200);
      assert.equal((status.body as { remaining: number }).remaining, 0);

      assert.equal(stickerHandler, generateHandler);
    } finally {
      if (prevProvider === undefined) delete process.env.IMAGE_PROVIDER;
      else process.env.IMAGE_PROVIDER = prevProvider;
      resetImageProviderForTests();
      resetImageQuotaForTests();
    }
  });

  test('a provider timeout is a friendly error and does not spend the daily slot', async () => {
    resetImageQuotaForTests();
    resetImageProviderForTests();
    const ip = '203.0.113.50';
    try {
      setImageFetchForTests(async () => {
        const error = new Error('timed out');
        error.name = 'TimeoutError';
        throw error;
      });
      const res = mockRes();
      await generateHandler(req(ip, { prompt: 'a bold star' }), res);
      assert.equal(res.statusCode, 502);
      assert.match(String((res.body as { error: string }).error), /took too long/);
      assert.equal((res.body as { remaining: number }).remaining, IMAGE_QUOTA_LIMIT);

      const quota = await readImageQuota(req(ip));
      assert.equal(quota.remaining, IMAGE_QUOTA_LIMIT);

      await assert.rejects(
        () => createArtwork('a bold star', req(ip)),
        (error: { status?: number; message?: string }) => error.status === 502 && /took too long/.test(String(error.message)),
      );
      assert.equal((await readImageQuota(req(ip))).remaining, IMAGE_QUOTA_LIMIT);
    } finally {
      resetImageProviderForTests();
      resetImageQuotaForTests();
    }
  });

  test('cloudflare is not used unless configured, and a missing setup does not spend quota', async () => {
    resetImageQuotaForTests();
    resetImageProviderForTests();
    const prevProvider = process.env.IMAGE_PROVIDER;
    const prevAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
    const prevToken = process.env.CLOUDFLARE_API_TOKEN;
    let called = false;
    try {
      process.env.IMAGE_PROVIDER = 'cloudflare';
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      delete process.env.CLOUDFLARE_API_TOKEN;
      setImageFetchForTests(async () => {
        called = true;
        return imageResponse(pngBytes());
      });
      await assert.rejects(
        () => createArtwork('a bold star', req('203.0.113.60')),
        (error: { status?: number; message?: string }) => error.status === 500 && /not configured/.test(String(error.message)),
      );
      assert.equal(called, false);
      assert.equal((await readImageQuota(req('203.0.113.60'))).remaining, IMAGE_QUOTA_LIMIT);
    } finally {
      if (prevProvider === undefined) delete process.env.IMAGE_PROVIDER;
      else process.env.IMAGE_PROVIDER = prevProvider;
      if (prevAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
      else process.env.CLOUDFLARE_ACCOUNT_ID = prevAccount;
      if (prevToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
      else process.env.CLOUDFLARE_API_TOKEN = prevToken;
      resetImageProviderForTests();
      resetImageQuotaForTests();
    }
  });

  test('a logo prompt is a local wordmark and does not call the image host', async () => {
    resetImageQuotaForTests();
    resetImageProviderForTests();
    const prevProvider = process.env.IMAGE_PROVIDER;
    delete process.env.IMAGE_PROVIDER;
    let called = false;
    try {
      setImageFetchForTests(async () => {
        called = true;
        return imageResponse(pngBytes());
      });
      const result = await createArtwork('hunnid collection logo', req('203.0.113.70'));
      assert.equal(called, false);
      assert.match(result.image, /^data:image\/png;base64,/);
      const png = PNG.sync.read(Buffer.from(result.image.replace(/^data:image\/png;base64,/, ''), 'base64'));
      assert.equal(png.width, 1024);
      assert.equal(png.data[0], 255);
      let ink = 0;
      for (let i = 0; i < png.data.length; i += 4) if (png.data[i] === 0) ink += 1;
      assert.ok(ink > 1000, `wordmark should have black ink (${ink})`);
      const direct = renderStencilWordmark('HUNNID COLLECTION');
      assert.equal(direct.contentType, 'image/png');
    } finally {
      if (prevProvider === undefined) delete process.env.IMAGE_PROVIDER;
      else process.env.IMAGE_PROVIDER = prevProvider;
      resetImageProviderForTests();
      resetImageQuotaForTests();
    }
  });

  test('flatten snaps a gray jpeg to black ink on white paper', () => {
    const width = 24;
    const height = 24;
    const data = Buffer.alloc(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 210;
      data[i + 1] = 210;
      data[i + 2] = 210;
      data[i + 3] = 255;
    }
    for (let y = 8; y < 16; y += 1) {
      for (let x = 8; x < 16; x += 1) {
        const i = (y * width + x) * 4;
        data[i] = 30;
        data[i + 1] = 30;
        data[i + 2] = 30;
      }
    }
    for (const [x, y] of [[20, 22], [21, 22], [22, 23], [2, 2], [3, 2], [2, 3]]) {
      const i = (y * width + x) * 4;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
    }
    // A stroke that enters the corner from the main shape must stay.
    for (let y = 14; y <= 23; y += 1) {
      const i = (y * width + 14) * 4;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
    }
    const encoded = jpeg.encode({ data, width, height }, 90);
    const flat = flattenArtworkBytes(Buffer.from(encoded.data), 'image/jpeg');
    assert.equal(flat.contentType, 'image/png');
    const png = PNG.sync.read(flat.bytes);
    assert.deepEqual([png.data[0], png.data[1], png.data[2]], [255, 255, 255]);
    const center = ((12 * width) + 12) * 4;
    assert.deepEqual([png.data[center], png.data[center + 1], png.data[center + 2]], [0, 0, 0]);
    const speck = ((22 * width) + 20) * 4;
    assert.equal(png.data[speck], 255);
    const stray = ((2 * width) + 2) * 4;
    assert.equal(png.data[stray], 255);
    const joined = ((22 * width) + 14) * 4;
    assert.equal(png.data[joined], 0);
  });
});
