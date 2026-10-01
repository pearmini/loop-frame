import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { readSettingsFile, writeSettingsFile } from '../src/main/settings-store';
import { defaultSettings, listedOrigins, parseSettings } from '../src/shared/settings';
import { SETTINGS_VERSION, type Settings } from '../src/shared/types';

const sample: Settings = {
  version: SETTINGS_VERSION,
  defaultDurationSeconds: 12,
  startOnLogin: true,
  allowCamera: true,
  allowMicrophone: false,
  sites: [
    { id: 'one', url: 'https://One.Example/a', durationSeconds: null },
    { id: 'two', url: 'https://one.example/b', durationSeconds: 4 },
  ],
};

describe('settings persistence', () => {
  it('round-trips a settings file', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'loopframe-settings-'));
    const file = path.join(directory, 'settings.json');
    writeSettingsFile(file, sample);
    assert.deepEqual(readSettingsFile(file), {
      ...sample,
      sites: [
        { id: 'one', url: 'https://One.Example/a', durationSeconds: null },
        { id: 'two', url: 'https://one.example/b', durationSeconds: 4 },
      ],
    });
  });

  it('falls back to defaults when the file is missing or corrupt', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'loopframe-settings-'));
    assert.deepEqual(readSettingsFile(path.join(directory, 'missing.json')), defaultSettings());
    const corrupt = path.join(directory, 'corrupt.json');
    fs.writeFileSync(corrupt, '{not json');
    assert.deepEqual(readSettingsFile(corrupt), defaultSettings());
    fs.writeFileSync(corrupt, JSON.stringify({ version: 2 }));
    assert.deepEqual(readSettingsFile(corrupt), defaultSettings());
  });

  it('keeps camera allowed when an older file has no camera choice', () => {
    const { allowCamera: _allowCamera, ...older } = sample;
    assert.equal(parseSettings(older).allowCamera, true);
  });

  it('rejects structurally invalid settings', () => {
    assert.throws(() => parseSettings({ version: 1, sites: [] }), /default duration|startup|microphone/i);
    assert.throws(() =>
      parseSettings({
        ...sample,
        sites: [
          { id: 'same', url: 'https://a.example', durationSeconds: null },
          { id: 'same', url: 'https://b.example', durationSeconds: null },
        ],
      }),
    );
  });

  it('collects camera origins only from valid saved addresses', () => {
    assert.deepEqual(
      listedOrigins([
        { url: 'https://One.Example/a' },
        { url: 'https://one.example/other' },
        { url: 'not a url' },
        { url: 'http://second.example' },
      ]),
      ['https://one.example', 'http://second.example'],
    );
  });
});
