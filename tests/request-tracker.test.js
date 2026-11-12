import test from 'node:test';
import assert from 'node:assert/strict';

import { createRequestTracker } from '../extension/lib/request-tracker.js';

test('invalidates older asynchronous requests', () => {
  const tracker = createRequestTracker();
  const first = tracker.begin();
  const second = tracker.begin();

  assert.equal(tracker.isCurrent(first), false);
  assert.equal(tracker.isCurrent(second), true);

  tracker.invalidate();
  assert.equal(tracker.isCurrent(second), false);
});
