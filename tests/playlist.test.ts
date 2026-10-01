import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nextIndex, previousIndex, resolveDurationSeconds, wrapIndex } from '../src/shared/playlist';

describe('playlist', () => {
  it('wraps in both directions', () => {
    assert.equal(nextIndex(2, 3), 0);
    assert.equal(previousIndex(0, 3), 2);
    assert.equal(wrapIndex(-1, 3), 2);
    assert.equal(nextIndex(0, 0), 0);
  });

  it('uses the default duration when a website has no override', () => {
    assert.equal(resolveDurationSeconds({ id: 'a', url: 'https://a.example', durationSeconds: null }, 30), 30);
    assert.equal(resolveDurationSeconds({ id: 'a', url: 'https://a.example', durationSeconds: 8 }, 30), 8);
  });
});
