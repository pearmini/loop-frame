import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decideNavigation } from '../src/shared/navigation';

const listed = ['https://install.example'];

describe('navigation policy', () => {
  it('allows the initial redirect to display and keeps later moves on the list', () => {
    assert.equal(
      decideNavigation({
        url: 'https://elsewhere.example/landed',
        kind: 'redirect',
        listedOrigins: listed,
        initialLoad: true,
      }),
      'allow',
    );
    assert.equal(
      decideNavigation({
        url: 'https://elsewhere.example/later',
        kind: 'redirect',
        listedOrigins: listed,
        initialLoad: false,
      }),
      'deny',
    );
    assert.equal(
      decideNavigation({
        url: 'https://install.example/room',
        kind: 'navigate',
        listedOrigins: listed,
        initialLoad: false,
      }),
      'allow',
    );
    assert.equal(
      decideNavigation({
        url: 'https://elsewhere.example/',
        kind: 'navigate',
        listedOrigins: listed,
        initialLoad: false,
      }),
      'deny',
    );
  });

  it('blocks new windows and non-web destinations', () => {
    assert.equal(
      decideNavigation({
        url: 'https://install.example/popup',
        kind: 'window-open',
        listedOrigins: listed,
        initialLoad: true,
      }),
      'deny',
    );
    assert.equal(
      decideNavigation({
        url: 'javascript:alert(1)',
        kind: 'navigate',
        listedOrigins: listed,
        initialLoad: true,
      }),
      'deny',
    );
    assert.equal(
      decideNavigation({
        url: 'file:///tmp/page.html',
        kind: 'redirect',
        listedOrigins: listed,
        initialLoad: true,
      }),
      'deny',
    );
  });
});
