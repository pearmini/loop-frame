import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { WebContentsView, systemPreferences, type BrowserWindow } from 'electron';
import { attachNavigationGuards } from './navigation';
import { permissionLog } from './permissions';
import type { PlaybackController } from './playback';
import { readSettingsFile, writeSettingsFile } from './settings-store';
import { listedOrigins } from '../shared/settings';
import { SETTINGS_VERSION, type Settings, type TimingConfig } from '../shared/types';
import { siteWebPreferences } from '../shared/web-preferences';

export const SELF_TEST_TIMING: TimingConfig = {
  loadTimeoutMs: 500,
  errorDisplayMs: 250,
  controlsHideMs: 400,
};

interface SelfTestContext {
  window: BrowserWindow;
  playback: PlaybackController;
  settingsFile: string;
}

interface FixtureServer {
  port: number;
  close: () => Promise<void>;
}

export async function runSelfTest(context: SelfTestContext): Promise<number> {
  const report: Record<string, unknown> = {};
  const servers: FixtureServer[] = [];
  let maxActive = 0;
  const watch = setInterval(() => {
    maxActive = Math.max(maxActive, context.playback.getSnapshot().active);
  }, 30);
  try {
    const landed = await startFixture((req, res) => {
      if (req.url === '/landed') return html(res, 'landed');
      res.writeHead(404);
      res.end();
    });
    servers.push(landed);
    const main = await startFixture((req, res, sockets) => {
      if (req.url === '/a' || req.url === '/b' || req.url === '/ok') return html(res, req.url);
      if (req.url === '/bounce') {
        res.writeHead(302, { Location: `http://127.0.0.1:${landed.port}/landed` });
        res.end();
        return;
      }
      if (req.url === '/drop') {
        req.socket.destroy();
        return;
      }
      if (req.url === '/hang') return;
      res.writeHead(404);
      res.end();
    });
    servers.push(main);

    const listed = `http://127.0.0.1:${main.port}/ok`;
    writeSettingsFile(context.settingsFile, settings([{ id: 'listed', url: listed, durationSeconds: null }]));
    await reload(context.window);
    await waitFor('settings to render', async () => {
      const value = await context.window.webContents.executeJavaScript(
        `document.querySelector('.site-url')?.value ?? ''`,
      );
      return value === listed;
    });
    const enabled = await context.window.webContents.executeJavaScript(
      `document.querySelector('#play')?.disabled === false`,
    );
    if (enabled !== true) throw new Error('Play stayed disabled for a valid website.');
    const isolated = await context.window.webContents.executeJavaScript(
      `({ requireType: typeof require, processType: typeof process, bridge: typeof window.loopframe })`,
    );
    if (isolated.requireType !== 'undefined' || isolated.processType !== 'undefined' || isolated.bridge !== 'object') {
      throw new Error(`Settings page is not isolated: ${JSON.stringify(isolated)}`);
    }
    const rejected = await context.window.webContents.executeJavaScript(
      `window.loopframe.saveSettings({ version: 1 })`,
    );
    if (!rejected || rejected.ok !== false) throw new Error('Invalid settings were accepted.');

    const saved = await context.window.webContents.executeJavaScript(
      `window.loopframe.saveSettings(${JSON.stringify(settings([{ id: 'listed', url: listed, durationSeconds: 5 }]))})`,
    );
    if (!saved?.ok || saved.settings.sites[0].durationSeconds !== 5) {
      throw new Error(`Settings did not round-trip through IPC: ${JSON.stringify(saved)}`);
    }

    await assertPermissions(context, main.port, landed.port, report);
    await assertNavigation(context, main.port, landed.port);
    await assertPlayback(context, main.port, report);
    report.maxActive = maxActive;
    if (maxActive > 1) throw new Error(`More than one website view was active (${maxActive}).`);
    console.log(JSON.stringify({ ok: true, ...report }, null, 2));
    return 0;
  } catch (error) {
    console.error(error);
    console.log(JSON.stringify({ ok: false, ...report, error: error instanceof Error ? error.message : String(error) }, null, 2));
    return 1;
  } finally {
    clearInterval(watch);
    context.playback.shutdown();
    await Promise.all(servers.map((server) => server.close()));
  }
}

async function assertPermissions(
  context: SelfTestContext,
  listedPort: number,
  otherPort: number,
  report: Record<string, unknown>,
): Promise<void> {
  const listed = `http://127.0.0.1:${listedPort}/ok`;
  const unlisted = `http://127.0.0.1:${otherPort}/landed`;
  writeSettingsFile(context.settingsFile, settings([{ id: 'listed', url: listed, durationSeconds: null }]));

  assertDenied(await probeMedia(context.window, unlisted, '{ video: true }'), 'Unlisted origin was granted camera access');
  assertDenied(await probeMedia(context.window, listed, '{ audio: true }'), 'Microphone was granted while disabled');
  assertDenied(
    await probeMedia(context.window, listed, '{ video: true, audio: true }'),
    'Combined camera and microphone request was granted',
  );

  const osCamera = process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('camera') : 'unsupported';
  report.osCamera = osCamera;
  const mayPrompt = process.platform === 'darwin' && (osCamera === 'not-determined' || osCamera === 'unknown');
  if (!mayPrompt) {
    const videoDecision = await probeMedia(context.window, listed, '{ video: true }');
    report.liveCameraAllow = videoDecision;
    if (!videoDecision.allows) {
      throw new Error(`Listed origin was not granted camera access: ${JSON.stringify(videoDecision.log)}`);
    }
  } else {
    report.liveCameraAllow = `skipped (${osCamera})`;
  }
}

async function assertNavigation(context: SelfTestContext, listedPort: number, otherPort: number): Promise<void> {
  writeSettingsFile(
    context.settingsFile,
    settings([{ id: 'listed', url: `http://127.0.0.1:${listedPort}/ok`, durationSeconds: null }]),
  );
  const view = attachProbe(context.window);
  let initialLoad = true;
  attachNavigationGuards(view.webContents, () => ({
    listedOrigins: listedOrigins([{ url: `http://127.0.0.1:${listedPort}/ok` }]),
    initialLoad,
  }));
  view.webContents.on('did-finish-load', () => {
    initialLoad = false;
  });
  view.webContents.on('did-fail-load', () => {
    initialLoad = false;
  });
  try {
    await view.webContents.loadURL(`http://127.0.0.1:${listedPort}/bounce`);
    const landed = view.webContents.getURL();
    if (!landed.startsWith(`http://127.0.0.1:${otherPort}/`)) {
      throw new Error(`Initial redirect did not display. Landed on ${landed}`);
    }
    permissionLog.length = 0;
    await view.webContents.executeJavaScript(mediaScript('{ video: true }'));
    if (permissionLog.some((entry) => entry.allow)) {
      throw new Error(`Redirect destination received camera access: ${JSON.stringify(permissionLog)}`);
    }
    const opened = await view.webContents.executeJavaScript(`window.open('https://example.com/')`);
    if (opened !== null) throw new Error('A new window was allowed.');
    await view.webContents.executeJavaScript(`location.assign('https://example.com/')`);
    await delay(250);
    if (view.webContents.getURL().includes('example.com')) {
      throw new Error('Navigation left the saved website list.');
    }
  } finally {
    destroyProbe(context.window, view);
  }
}

async function assertPlayback(
  context: SelfTestContext,
  port: number,
  report: Record<string, unknown>,
): Promise<void> {
  const playback = context.playback;
  writeSettingsFile(
    context.settingsFile,
    settings([
      { id: 'a', url: `http://127.0.0.1:${port}/a`, durationSeconds: 1 },
      { id: 'b', url: `http://127.0.0.1:${port}/b`, durationSeconds: 1 },
    ]),
  );
  const loopSettings = readBack(context.settingsFile);
  await playback.start(loopSettings, { fullscreen: false });
  await waitFor('first website', () => playback.getSnapshot().phase === 'showing' && playback.getSnapshot().index === 0);
  const blocked = await playback.runInSite(`window.open('https://example.com/') === null`);
  if (blocked !== true) throw new Error('Playback allowed a new window.');
  await playback.runInSite(`location.assign('https://example.com/')`);
  await delay(200);
  const current = playback.currentSiteUrl() ?? '';
  if (!current.includes('/a')) throw new Error(`Playback navigated away from the website: ${current}`);
  const beforeAdvance = playback.getSnapshot().closed;
  await waitFor('display timer to advance', () => playback.getSnapshot().closed > beforeAdvance, 5000);
  if (playback.getSnapshot().active !== 1) throw new Error('Playback lost its single website view while advancing.');
  playback.command('next');
  await waitFor('manual advance', () => playback.getSnapshot().phase === 'showing');
  playback.exit();
  await waitFor('playback to stop', () => playback.getSnapshot().phase === 'idle' && playback.getSnapshot().active === 0);
  const balanced = playback.getSnapshot();
  if (balanced.opened !== balanced.closed) {
    throw new Error(`Views leaked after exit: opened ${balanced.opened}, closed ${balanced.closed}`);
  }

  writeSettingsFile(context.settingsFile, settings([{ id: 'drop', url: `http://127.0.0.1:${port}/drop`, durationSeconds: 30 }]));
  const openedBeforeDrop = playback.getSnapshot().opened;
  await playback.start(readBack(context.settingsFile), { fullscreen: false });
  await waitFor('failed load', () => playback.getSnapshot().phase === 'error');
  if (!playback.getSnapshot().error) throw new Error('A failed website did not show an error.');
  await waitFor('error to advance', () => playback.getSnapshot().opened > openedBeforeDrop + 1, 4000);
  playback.exit();
  await waitFor('exit after failure', () => playback.getSnapshot().phase === 'idle');

  writeSettingsFile(context.settingsFile, settings([{ id: 'hang', url: `http://127.0.0.1:${port}/hang`, durationSeconds: 30 }]));
  await playback.start(readBack(context.settingsFile), { fullscreen: false });
  await waitFor('stalled load', () => playback.getSnapshot().phase === 'error', 4000);
  playback.exit();
  await waitFor('exit after stall', () => {
    const snapshot = playback.getSnapshot();
    return snapshot.phase === 'idle' && snapshot.opened === snapshot.closed && snapshot.active === 0;
  });

  let entered = false;
  const onEnter = () => {
    entered = true;
  };
  context.window.once('enter-full-screen', onEnter);
  writeSettingsFile(context.settingsFile, settings([{ id: 'a', url: `http://127.0.0.1:${port}/a`, durationSeconds: 30 }]));
  await playback.start(readBack(context.settingsFile), { fullscreen: true });
  await waitFor('fullscreen', () => entered, 3000).catch(() => undefined);
  if (!entered) {
    report.fullscreen = 'unavailable';
    playback.exit();
    await waitFor('exit without fullscreen', () => playback.getSnapshot().phase === 'idle');
    return;
  }
  playback.sendKey('Escape');
  await waitFor(
    'escape to leave fullscreen',
    () => playback.getSnapshot().phase === 'idle' && !context.window.isFullScreen(),
    4000,
  );
  report.fullscreen = 'exited';
}

async function probeMedia(
  window: BrowserWindow,
  url: string,
  constraints: string,
): Promise<{ result: unknown; allows: boolean; log: typeof permissionLog }> {
  const view = attachProbe(window);
  try {
    await view.webContents.loadURL(url);
    permissionLog.length = 0;
    const result = await Promise.race([
      view.webContents.executeJavaScript(mediaScript(constraints)),
      delay(4000).then(() => 'timeout'),
    ]);
    return { result, allows: permissionLog.some((entry) => entry.allow), log: permissionLog.slice() };
  } finally {
    destroyProbe(window, view);
  }
}

function attachProbe(window: BrowserWindow): WebContentsView {
  const view = new WebContentsView({ webPreferences: siteWebPreferences() });
  window.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 320, height: 180 });
  return view;
}

function destroyProbe(window: BrowserWindow, view: WebContentsView): void {
  if (!view.webContents.isDestroyed()) {
    view.webContents.removeAllListeners();
    view.webContents.stop();
    view.webContents.close();
  }
  if (!window.isDestroyed()) {
    try {
      window.contentView.removeChildView(view);
    } catch {
      // already detached
    }
  }
}

function mediaScript(constraints: string): string {
  return `navigator.mediaDevices.getUserMedia(${constraints}).then((stream) => {
    stream.getTracks().forEach((track) => track.stop());
    return 'started';
  }).catch((error) => error && error.name ? error.name : 'error')`;
}

function settings(sites: Settings['sites']): Settings {
  return {
    version: SETTINGS_VERSION,
    defaultDurationSeconds: 30,
    startOnLogin: false,
    allowCamera: true,
    allowMicrophone: false,
    sites,
  };
}

function readBack(file: string): Settings {
  return readSettingsFile(file);
}

function assertDenied(decision: { allows: boolean; log: unknown }, message: string): void {
  if (decision.allows || !Array.isArray(decision.log) || decision.log.length === 0) {
    throw new Error(`${message}: ${JSON.stringify(decision.log)}`);
  }
}

function html(response: ServerResponse, title: string): void {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html><title>${title}</title><p>${title}</p>`);
}

function startFixture(
  handler: (req: IncomingMessage, res: ServerResponse, sockets: Set<Socket>) => void,
): Promise<FixtureServer> {
  const sockets = new Set<Socket>();
  const server: Server = createServer((req, res) => handler(req, res, sockets));
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolve({
        port: address.port,
        close: () =>
          new Promise((done) => {
            for (const socket of sockets) socket.destroy();
            server.close(() => done());
          }),
      });
    });
  });
}

async function reload(window: BrowserWindow): Promise<void> {
  const loaded = new Promise<void>((resolve) => {
    window.webContents.once('did-finish-load', () => resolve());
  });
  await window.webContents.executeJavaScript('location.reload()');
  await loaded;
}

async function waitFor(label: string, predicate: () => boolean | Promise<boolean>, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await delay(40);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
