import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { handleTraceRequest } from '../api/trace.js';
import { DEFAULT_COLOR_TRACE, buildTraceQuery, TRACE_REQUEST_BODY_LIMIT, traceHttpError } from '../src/utils/traceParams.ts';
import {
  decodePngToRgba,
  encodePngRgba,
  isPng,
  TRACE_REQUEST_BODY_LIMIT as SERVER_BODY_LIMIT,
  traceImageBuffer,
  traceRgba,
} from '../traceColor.mjs';

function paint(
  w: number,
  h: number,
  fn: (x: number, y: number) => [number, number, number, number?],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b, a = 255] = fn(x, y);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return data;
}

function mockRes() {
  return {
    statusCode: 0,
    payload: null as unknown,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) { this.headers[k] = v; },
    status(n: number) { this.statusCode = n; return this; },
    json(p: unknown) { this.payload = p; return this; },
    writeHead(status: number, headers?: Record<string, string>) {
      this.statusCode = status;
      Object.assign(this.headers, headers ?? {});
    },
    end(s?: string) { if (s) this.payload = JSON.parse(s); },
  };
}

function mockReq(opts: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body: Buffer;
}) {
  const req = Readable.from([opts.body]) as Readable & {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  req.method = opts.method ?? 'POST';
  req.url = opts.url ?? '/api/trace';
  req.headers = opts.headers ?? { 'content-type': 'application/json' };
  return req;
}

test('raw RGBA JSON at the 1000px cap exceeds Vercel’s 4.5 MB body limit', () => {
  const width = 1000;
  const height = 1000;
  const rawBytes = width * height * 4;
  const base64Bytes = Math.ceil(rawBytes / 3) * 4;
  const jsonBytes = base64Bytes + '{"rgba":"","width":1000,"height":1000}'.length;
  assert.ok(jsonBytes > TRACE_REQUEST_BODY_LIMIT, `expected RGBA JSON ${jsonBytes} > ${TRACE_REQUEST_BODY_LIMIT}`);
  assert.equal(TRACE_REQUEST_BODY_LIMIT, SERVER_BODY_LIMIT);
});

test('PNG of a 1000×1000 vinyl-like graphic stays under the body limit', () => {
  const w = 1000;
  const h = 1000;
  const rgba = paint(w, h, (x, y) => {
    if (x > 80 && x < 920 && y > 220 && y < 780) return [18, 18, 18];
    if (x > 140 && x < 860 && y > 280 && y < 720) return [220, 24, 40];
    return [250, 250, 248];
  });
  const png = encodePngRgba(rgba, w, h);
  assert.ok(isPng(png));
  assert.ok(png.length < TRACE_REQUEST_BODY_LIMIT, `PNG ${png.length} should fit under ${TRACE_REQUEST_BODY_LIMIT}`);
  const jsonRgba = JSON.stringify({
    rgba: Buffer.from(rgba).toString('base64'),
    width: w,
    height: h,
  });
  assert.ok(jsonRgba.length > TRACE_REQUEST_BODY_LIMIT);
  assert.ok(png.length * 20 < jsonRgba.length);
});

test('PNG encode/decode round-trips opaque pixels', () => {
  const w = 12;
  const h = 8;
  const rgba = paint(w, h, (x, y) => [x * 20, y * 30, 40, 255]);
  const decoded = decodePngToRgba(encodePngRgba(rgba, w, h));
  assert.equal(decoded.width, w);
  assert.equal(decoded.height, h);
  assert.deepEqual([...decoded.rgba], [...rgba]);
});

test('traceImageBuffer on PNG uses the colour-prep path', () => {
  const w = 80;
  const h = 80;
  const rgba = paint(w, h, (x, y) => {
    const r = Math.hypot(x - 40, y - 32);
    if (r < 22 && r > 10) return [20, 20, 20];
    if (x > 8 && x < 28 && y > 8 && y < 24) return [220, 30, 40];
    return [245, 245, 240];
  });
  const fromPixels = traceRgba(rgba, w, h, DEFAULT_COLOR_TRACE);
  const fromPng = traceImageBuffer(encodePngRgba(rgba, w, h), DEFAULT_COLOR_TRACE);
  assert.match(fromPng, /<path /);
  assert.equal(fromPng, fromPixels);
});

test('buildTraceQuery serializes knobs and palette', () => {
  const qs = buildTraceQuery({
    maxColors: 6,
    cornerThreshold: 45,
    curveFit: 2,
    filterSpeckle: 1,
    palette: ['#000000', '#fe0000'],
  });
  const params = new URLSearchParams(qs);
  assert.equal(params.get('maxColors'), '6');
  assert.equal(params.get('cornerThreshold'), '45');
  assert.equal(params.get('curveFit'), '2');
  assert.equal(params.get('filterSpeckle'), '1');
  assert.equal(params.get('palette'), '#000000,#fe0000');
});

test('traceHttpError maps 413 to a user-facing size message', () => {
  assert.match(traceHttpError(413).message, /too large/i);
  assert.equal(traceHttpError(500, 'nope').message, 'nope');
  assert.equal(traceHttpError(502).message, 'Trace request failed (502)');
});

test('POST /api/trace accepts a PNG body with query knobs', async () => {
  const w = 64;
  const h = 64;
  const rgba = paint(w, h, (x, y) => {
    const d = Math.hypot(x - 32, y - 32);
    return d < 18 ? [16, 16, 16] : [248, 248, 246];
  });
  const png = encodePngRgba(rgba, w, h);
  const req = mockReq({
    url: `/api/trace?${buildTraceQuery(DEFAULT_COLOR_TRACE)}`,
    headers: { 'content-type': 'image/png' },
    body: png,
  });
  const res = mockRes();
  await handleTraceRequest(req, res);
  assert.equal(res.statusCode, 200);
  const payload = res.payload as { svg?: string; width?: number; height?: number };
  assert.equal(typeof payload.svg, 'string');
  assert.match(String(payload.svg), /<path /);
  assert.ok((payload.width ?? 0) >= w);
  assert.ok((payload.height ?? 0) >= h);
});

test('POST /api/trace still accepts a small JSON data URL', async () => {
  const w = 48;
  const h = 48;
  const rgba = paint(w, h, (x) => (x < 24 ? [12, 12, 12] : [240, 240, 238]));
  const png = encodePngRgba(rgba, w, h);
  const req = mockReq({
    url: '/api/trace',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify({
      image: `data:image/png;base64,${png.toString('base64')}`,
      maxColors: 4,
      cornerThreshold: 90,
      curveFit: 4,
      filterSpeckle: 0,
    })),
  });
  const res = mockRes();
  await handleTraceRequest(req, res);
  assert.equal(res.statusCode, 200);
  assert.match(String((res.payload as { svg: string }).svg), /<path /);
});

test('oversized PNG body returns 413', async () => {
  const req = mockReq({
    url: '/api/trace?maxColors=4',
    headers: { 'content-type': 'image/png' },
    body: Buffer.alloc(TRACE_REQUEST_BODY_LIMIT + 1, 1),
  });
  const res = mockRes();
  await handleTraceRequest(req, res);
  assert.equal(res.statusCode, 413);
  assert.equal((res.payload as { error: string }).error, 'Trace payload too large.');
});
