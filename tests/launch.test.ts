import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { cameraGuidance } from '../src/shared/camera-guidance';
import {
  LOGIN_APPROVAL_MESSAGE,
  LOGIN_LIMITATION,
  linuxDesktopEntry,
  planLoginRegistration,
  shellQuote,
  shouldAutoplay,
} from '../src/shared/launch';
import { START_LOOP_ARG } from '../src/shared/types';
import { siteWebPreferences } from '../src/shared/web-preferences';

describe('launch behavior', () => {
  it('starts playback only for a login launch when that choice is saved', () => {
    assert.equal(
      shouldAutoplay({ argv: ['Loopframe'], wasOpenedAtLogin: false, startOnLogin: true }),
      false,
    );
    assert.equal(
      shouldAutoplay({ argv: ['Loopframe'], wasOpenedAtLogin: true, startOnLogin: true }),
      true,
    );
    assert.equal(
      shouldAutoplay({ argv: ['Loopframe', START_LOOP_ARG], wasOpenedAtLogin: false, startOnLogin: true }),
      true,
    );
    assert.equal(
      shouldAutoplay({ argv: ['Loopframe', START_LOOP_ARG], wasOpenedAtLogin: true, startOnLogin: false }),
      false,
    );
  });

  it('registers login launch per platform without treating a dev checkout as the installed app', () => {
    assert.deepEqual(planLoginRegistration({ platform: 'darwin', packaged: false, enabled: true }), {
      kind: 'skip',
      message: null,
    });
    assert.deepEqual(planLoginRegistration({ platform: 'darwin', packaged: true, enabled: true }), {
      kind: 'electron',
      openAtLogin: true,
    });
    assert.deepEqual(planLoginRegistration({ platform: 'win32', packaged: true, enabled: true }), {
      kind: 'electron',
      openAtLogin: true,
      args: [START_LOOP_ARG],
    });
    assert.deepEqual(planLoginRegistration({ platform: 'linux', packaged: true, enabled: false }), {
      kind: 'xdg',
      enabled: false,
    });
    const entry = linuxDesktopEntry(shellQuote('/Applications/Loopframe.app/Contents/MacOS/Loopframe'));
    assert.match(entry, new RegExp(START_LOOP_ARG));
    assert.match(LOGIN_APPROVAL_MESSAGE, /System Settings/);
    assert.match(LOGIN_LIMITATION, /when you log in to this account/);
  });
});

describe('camera guidance', () => {
  it('explains a macOS denial without claiming it can be bypassed', () => {
    const message = cameraGuidance('denied', true) ?? '';
    assert.match(message, /System Settings/);
    assert.match(message, /Privacy & Security/);
    assert.match(message, /cannot bypass/);
    assert.match(cameraGuidance('not-determined', true) ?? '', /cannot skip the system prompt/);
    assert.equal(cameraGuidance('granted', true), null);
  });
});

describe('web preferences', () => {
  it('keeps website views sandboxed and without a preload', () => {
    const preferences = siteWebPreferences();
    assert.equal(preferences.nodeIntegration, false);
    assert.equal(preferences.contextIsolation, true);
    assert.equal(preferences.sandbox, true);
    assert.equal(preferences.webSecurity, true);
    assert.equal(preferences.preload, undefined);
  });

  it('keeps the login explanation in the settings page', () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'src/renderer/index.html'), 'utf8');
    assert.match(html, /Start loop when computer starts/);
    assert.ok(html.includes(LOGIN_LIMITATION));
  });
});
