import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseDurationInput, playBlockers, siteLabel, validateDuration, validateUrl } from '../src/shared/validate';

describe('url validation', () => {
  it('accepts http and https addresses', () => {
    assert.equal(validateUrl('https://exhibition.example/install'), null);
    assert.equal(validateUrl('  http://localhost:3000/path  '), null);
  });

  it('explains empty, malformed, and non-web addresses', () => {
    assert.match(validateUrl('') ?? '', /Enter a website address/);
    assert.match(validateUrl('not a url') ?? '', /https:\/\/ or http:\/\//);
    assert.match(validateUrl('javascript:alert(1)') ?? '', /Only http/);
    assert.match(validateUrl('file:///tmp/page.html') ?? '', /Only http/);
  });

  it('parses duration overrides', () => {
    assert.deepEqual(parseDurationInput(''), { value: null, error: null });
    assert.deepEqual(parseDurationInput('15'), { value: 15, error: null });
    assert.equal(validateDuration(0), parseDurationInput('0').error);
    assert.match(parseDurationInput('1.5').error ?? '', /whole number/);
    assert.match(parseDurationInput('abc').error ?? '', /whole number/);
  });

  it('blocks playback until every row is valid', () => {
    assert.deepEqual(
      playBlockers([{ id: 'a', url: 'https://ok.example', durationSeconds: null }], 30),
      [],
    );
    assert.ok(playBlockers([], 30).some((issue) => /at least one/i.test(issue)));
    assert.ok(
      playBlockers([{ id: 'a', url: 'notaurl', durationSeconds: null }], 30).some((issue) => /highlighted/i.test(issue)),
    );
    assert.equal(siteLabel('https://gallery.example/room'), 'gallery.example');
  });
});
