import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanupTracedSvg } from '../src/utils/svgTraceCleanup.ts';
import { vinylTraceOptions } from '../src/utils/traceOptions.ts';

test('cleanup converts quadratics to cubics, rounds coords, and sets evenodd', () => {
  const svg = `<svg width="20" height="20"><path fill="rgb(0,0,0)" stroke="rgb(0,0,0)" stroke-width="1" d="M 0.333 0.333 Q 10.12 0.04 19.77 10.666 Z"/></svg>`;
  const out = cleanupTracedSvg(svg, 20, 20);
  assert.match(out, /viewBox="0 0 20 20"/);
  assert.match(out, /fill-rule="evenodd"/);
  assert.match(out, /\bC\b/);
  assert.doesNotMatch(out, /\bQ\b/);
  assert.doesNotMatch(out, /stroke-width="1"/);
  assert.doesNotMatch(out, /\d+\.\d{2,}/);
});

test('cleanup drops white paper paths, duplicates, and empty d', () => {
  const d = 'M 2 2 L 18 2 L 18 18 L 2 18 Z';
  const svg = `<svg>
    <path fill="rgb(255,255,255)" d="${d}"/>
    <path fill="rgb(0,0,0)" d="${d}"/>
    <path fill="rgb(0,0,0)" d="${d}"/>
    <path fill="rgb(0,0,0)" d="M 1 1 Z"/>
  </svg>`;
  const out = cleanupTracedSvg(svg, 20, 20);
  const count = (out.match(/<path /g) || []).length;
  assert.equal(count, 1);
});

test('vinyl options prefer smooth fits and no stroke halo', () => {
  const opts = vinylTraceOptions(5);
  assert.ok(Number(opts.ltres) >= 1);
  assert.ok(Number(opts.qtres) >= 1);
  assert.ok(Number(opts.pathomit) >= 12);
  assert.equal(opts.strokewidth, 0);
  assert.equal(opts.linefilter, true);
  assert.equal(opts.roundcoords, 1);
  assert.equal(opts.viewbox, true);
});

test('higher smoothness increases curve-fit tolerance', () => {
  const tight = vinylTraceOptions(1);
  const loose = vinylTraceOptions(10);
  assert.ok(Number(loose.ltres) > Number(tight.ltres));
  assert.ok(Number(loose.qtres) > Number(tight.qtres));
});

test('cleanup drops speckles that are tiny relative to the canvas', () => {
  const svg = `<svg>
    <path fill="rgb(0,0,0)" d="M 1 1 L 4 1 L 4 4 L 1 4 Z"/>
    <path fill="rgb(0,0,0)" d="M 40 40 L 200 40 L 200 200 L 40 200 Z"/>
  </svg>`;
  const out = cleanupTracedSvg(svg, 480, 480);
  assert.equal((out.match(/<path /g) || []).length, 1);
  assert.match(out, /M 40 40/);
});
