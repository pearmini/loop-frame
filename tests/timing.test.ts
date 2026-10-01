import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pauseDeadline, remainingDeadline, resumeDeadline, startDeadline } from '../src/shared/timing';

describe('deadlines', () => {
  it('pauses the remaining time and resumes from that point', () => {
    const started = startDeadline(1_000, 5_000);
    assert.equal(remainingDeadline(started, 2_500), 3_500);
    const paused = pauseDeadline(started, 2_500);
    assert.equal(paused.running, false);
    assert.equal(paused.remainingMs, 3_500);
    assert.equal(remainingDeadline(paused, 9_000), 3_500);
    const resumed = resumeDeadline(paused, 3_000);
    assert.equal(resumed.endsAt, 6_500);
    assert.deepEqual(pauseDeadline(paused, 4_000), paused);
  });

  it('does not report a negative remaining time', () => {
    const started = startDeadline(0, 100);
    assert.equal(pauseDeadline(started, 500).remainingMs, 0);
    assert.equal(remainingDeadline(started, 500), 0);
  });
});
