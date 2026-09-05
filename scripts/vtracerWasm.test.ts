import assert from 'node:assert/strict';
import test from 'node:test';
import {
  binarizeRgba,
  mapUiConfigToVtracer,
  vtracerConfigToServerParams,
  DEFAULT_TRACING_UI,
} from '../src/utils/vtracerConfig.ts';

test('curveFit 0 locks polygon mode and floors curve_fitting_error at 0.1', () => {
  const cfg = mapUiConfigToVtracer({ ...DEFAULT_TRACING_UI, curveFit: 0 });
  assert.equal(cfg.mode, 'polygon');
  assert.equal(cfg.layering, 'cutout');
  assert.equal(cfg.path_omit_size, 16);
  assert.equal(cfg.curve_fitting_error, 0.1);
  const server = vtracerConfigToServerParams(cfg);
  assert.equal(server.curveFit, 0);
  assert.equal(server.filterSpeckle, 16);
});

test('curveFit 100 maps to spline with curve_fitting_error 2.0', () => {
  const cfg = mapUiConfigToVtracer({ ...DEFAULT_TRACING_UI, curveFit: 100, maxColors: 8, cornerThreshold: 45 });
  assert.equal(cfg.mode, 'spline');
  assert.equal(cfg.curve_fitting_error, 2);
  assert.equal(cfg.color_count, 8);
  assert.equal(cfg.corner_threshold, 45);
  const server = vtracerConfigToServerParams(cfg);
  assert.equal(server.curveFit, 10);
  assert.equal(server.maxColors, 8);
  assert.equal(server.cornerThreshold, 45);
});

test('curveFit 50 maps to spline with curve_fitting_error 1.0', () => {
  const cfg = mapUiConfigToVtracer({ ...DEFAULT_TRACING_UI, curveFit: 50 });
  assert.equal(cfg.mode, 'spline');
  assert.equal(cfg.curve_fitting_error, 1);
  assert.equal(vtracerConfigToServerParams(cfg).curveFit, 5);
});

test('BT.601 binarisation writes ink/paper without touching alpha', () => {
  const data = new Uint8ClampedArray([
    0, 0, 0, 200,       // black, alpha 200 → ink
    255, 255, 255, 255, // white → paper
    80, 80, 80, 128,    // grey below 128 → ink
    200, 200, 200, 64,  // light grey above 128 → paper
  ]);
  binarizeRgba(data, 128);
  assert.deepEqual([...data.subarray(0, 4)], [0, 0, 0, 200]);
  assert.deepEqual([...data.subarray(4, 8)], [255, 255, 255, 255]);
  assert.deepEqual([...data.subarray(8, 12)], [0, 0, 0, 128]);
  assert.deepEqual([...data.subarray(12, 16)], [255, 255, 255, 64]);
});
