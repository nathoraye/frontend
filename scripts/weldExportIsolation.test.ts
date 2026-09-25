import assert from 'node:assert/strict';
import test from 'node:test';
import { withSvgExportIsolation } from '../src/utils/weldExportIsolation.ts';

test('withSvgExportIsolation marks non-kept objects and restores flags', () => {
  const keep = { excludeFromExport: false as boolean | undefined };
  const other = { excludeFromExport: undefined as boolean | undefined };
  const already = { excludeFromExport: true as boolean | undefined };

  let sawOtherExcluded = false;
  let sawKeepIncluded = false;

  withSvgExportIsolation([keep, other, already], [keep], () => {
    sawOtherExcluded = other.excludeFromExport === true;
    sawKeepIncluded = keep.excludeFromExport === false;
    assert.equal(already.excludeFromExport, true);
  });

  assert.equal(sawOtherExcluded, true);
  assert.equal(sawKeepIncluded, true);
  assert.equal(keep.excludeFromExport, false);
  assert.equal(other.excludeFromExport, undefined);
  assert.equal(already.excludeFromExport, true);
});

test('withSvgExportIsolation restores even when export throws', () => {
  const other = { excludeFromExport: false as boolean | undefined };
  assert.throws(() => {
    withSvgExportIsolation([other], [], () => {
      throw new Error('export failed');
    });
  });
  assert.equal(other.excludeFromExport, false);
});
