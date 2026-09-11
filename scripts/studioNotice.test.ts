import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dismissStudioNotice,
  notifyStudio,
  resetStudioNotices,
  subscribeStudioNotices,
} from '../src/utils/studioNotice.ts';

test('notices publish, cap at three, and dismiss', () => {
  resetStudioNotices();
  const seen: number[] = [];
  const stop = subscribeStudioNotices((list) => {
    seen.push(list.length);
  });
  notifyStudio({ tone: 'error', title: 'A' });
  notifyStudio({ tone: 'warning', title: 'B' });
  const third = notifyStudio({ tone: 'info', title: 'C' });
  notifyStudio({ tone: 'success', title: 'D' });
  dismissStudioNotice(third.id);
  stop();
  const last = seen[seen.length - 1];
  resetStudioNotices();
  assert.ok(seen.includes(3));
  assert.equal(last, 2);
});
