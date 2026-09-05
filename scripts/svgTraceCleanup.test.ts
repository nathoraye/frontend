import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanupTracedSvg } from '../src/utils/svgTraceCleanup.ts';

test('cleanup keeps distinct fills and sets evenodd + viewBox', () => {
  const svg = `<svg width="40" height="40"><path fill="#DC1E28" d="M 2.22 2.22 L 12.66 2.22 L 12.66 12.88 Z"/><path fill="#1E5AD2" d="M 20 20 L 30 20 L 30 30 L 20 30 Z"/></svg>`;
  const out = cleanupTracedSvg(svg, 40, 40);
  assert.match(out, /viewBox="0 0 40 40"/);
  assert.match(out, /preserveAspectRatio="xMidYMid meet"/);
  assert.match(out, /fill="#DC1E28"/);
  assert.match(out, /fill="#1E5AD2"/);
  assert.match(out, /fill-rule="evenodd"/);
  assert.equal((out.match(/<path /g) || []).length, 2);
});

test('cleanup keeps a full-frame dark cutout layer', () => {
  const cutout = 'M 0 0 L 40 0 L 40 40 L 0 40 Z M 12 12 L 12 28 L 28 28 L 28 12 Z';
  const svg = `<svg width="40" height="40"><path fill="#141414" d="${cutout}"/></svg>`;
  const out = cleanupTracedSvg(svg, 40, 40);
  assert.match(out, /fill="#141414"/);
  assert.match(out, /M 0 0/);
});

test('cleanup drops full-frame paper but keeps coloured art', () => {
  const paper = 'M 0 0 L 40 0 L 40 40 L 0 40 Z';
  const art = 'M 10 10 L 20 10 L 20 20 L 10 20 Z';
  const svg = `<svg width="40" height="40">
    <path fill="#F5F5F0" d="${paper}"/>
    <path fill="#141414" d="${art}"/>
  </svg>`;
  const out = cleanupTracedSvg(svg, 40, 40);
  assert.equal((out.match(/<path /g) || []).length, 1);
  assert.match(out, /fill="#141414"/);
  assert.doesNotMatch(out, /fill="#F5F5F0"/);
});

test('cleanup keeps small drips instead of treating them as speckle', () => {
  const svg = `<svg width="80" height="80">
    <path fill="#141414" d="M 38 68 L 42 68 L 42 76 L 38 76 Z"/>
    <path fill="#DC1E28" d="M 10 10 L 30 10 L 30 24 L 10 24 Z"/>
  </svg>`;
  const out = cleanupTracedSvg(svg, 80, 80);
  assert.equal((out.match(/<path /g) || []).length, 2);
  assert.match(out, /M 38 68/);
});

test('cleanup concatenates disjoint same-colour blobs instead of evenodd-punching them', () => {
  const svg = `<svg width="40" height="40">
    <path fill="#00AA00" d="M 1 1 L 8 1 L 8 8 L 1 8 Z"/>
    <path fill="#00AA00" d="M 20 20 L 28 20 L 28 28 L 20 28 Z"/>
  </svg>`;
  const out = cleanupTracedSvg(svg, 40, 40);
  assert.equal((out.match(/<path /g) || []).length, 1);
  assert.match(out, /fill="#00AA00"/);
  assert.match(out, /M 1 1/);
  assert.match(out, /M 20 20/);
});

test('cleanup unions overlapping same-colour paths so evenodd cannot punch the overlap', () => {
  const svg = `<svg width="40" height="40">
    <path fill="#141414" d="M 0 0 L 20 0 L 20 20 L 0 20 Z"/>
    <path fill="#141414" d="M 10 10 L 30 10 L 30 30 L 10 30 Z"/>
  </svg>`;
  const out = cleanupTracedSvg(svg, 40, 40);
  assert.equal((out.match(/<path /g) || []).length, 1);
  const d = /d="([^"]+)"/.exec(out)?.[1] || '';
  const subpaths = d.split(/M/i).filter(Boolean).length;
  assert.equal(subpaths, 1, 'overlap must merge to one silhouette, not an evenodd hole');
});

test('cleanup drops mid-grey AA fringes that overlap darker ink', () => {
  const svg = `<svg width="60" height="60">
    <path fill="#787878" d="M 8 8 L 52 8 L 52 52 L 8 52 Z"/>
    <path fill="#141414" d="M 10 10 L 50 10 L 50 50 L 10 50 Z"/>
  </svg>`;
  const out = cleanupTracedSvg(svg, 60, 60);
  assert.doesNotMatch(out, /fill="#787878"/);
  assert.match(out, /fill="#141414"/);
});

test('cleanup keeps isolated grey that does not sit on darker ink', () => {
  const svg = `<svg width="60" height="60">
    <path fill="#787878" d="M 1 1 L 8 1 L 8 8 L 1 8 Z"/>
    <path fill="#141414" d="M 40 40 L 55 40 L 55 55 L 40 55 Z"/>
  </svg>`;
  const out = cleanupTracedSvg(svg, 60, 60);
  assert.match(out, /fill="#787878"/);
  assert.match(out, /fill="#141414"/);
});

test('cleanup rewrites a leading Lineto to Move so the path is not drawn from the origin', () => {
  const svg = `<svg width="80" height="80">
    <path fill="#141414" d="L25,9l-3,2l4-1l13,0Z"/>
    <path fill="#141414" d="M46,12 L50,12 L50,20 L46,20 Z L10,45l2,1l-1-4Z"/>
  </svg>`;
  const out = cleanupTracedSvg(svg, 80, 80);
  assert.match(out, /d="M25,9/);
  assert.doesNotMatch(out, /d="L/);
  assert.match(out, /Z M10,45/);
  assert.doesNotMatch(out, /Z L10,45/);
});

test('cleanup drops near-white quantized paper that would plug counters', () => {
  const holePlug = 'M 20 20 L 40 20 L 40 40 L 20 40 Z';
  const ring = 'M 10 10 L 50 10 L 50 50 L 10 50 Z M 20 20 L 20 40 L 40 40 L 40 20 Z';
  const svg = `<svg width="60" height="60">
    <path fill="#F1F1F1" d="${holePlug}"/>
    <path fill="#141414" d="${ring}"/>
  </svg>`;
  const out = cleanupTracedSvg(svg, 60, 60);
  assert.doesNotMatch(out, /fill="#F1F1F1"/);
  assert.match(out, /fill="#141414"/);
});
