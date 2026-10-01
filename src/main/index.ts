import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shouldAutoplay } from '../shared/launch';
import { START_LOOP_ARG, DEFAULT_TIMING } from '../shared/types';
import { registerIpc, startPlayback, type AppServices } from './ipc';
import { syncLoginItem } from './login-item';
import { settingsFilePath } from './paths';
import { PlaybackController } from './playback';
import { installPermissionHandlers } from './permissions';
import { readSettingsFile } from './settings-store';
import { runSelfTest, SELF_TEST_TIMING } from './self-test';
import { createMainWindow, loadMainWindow } from './window';

// Lets exhibition pages start their own media. This does not grant camera
// permission and does not turn on fake capture devices.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const selfTest = process.argv.includes('--self-test');

if (selfTest) {
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'loopframe-self-test-')));
}

if (!selfTest && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void app.whenReady().then(boot).catch((error: unknown) => {
    console.error(error);
    app.exit(1);
  });
}

async function boot(): Promise<void> {
  if (process.platform === 'win32') app.setAppUserModelId('com.loopframe.app');
  app.setName('Loopframe');

  const settingsFile = settingsFilePath();
  installPermissionHandlers(() => readSettingsFile(settingsFile));
  if (!selfTest && app.isPackaged) syncLoginItem(readSettingsFile(settingsFile).startOnLogin);

  const window = createMainWindow();
  const playback = new PlaybackController(window, {
    timing: selfTest ? SELF_TEST_TIMING : DEFAULT_TIMING,
    onExit: () => {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send('playback:stopped');
      }
    },
  });
  const services: AppServices = { playback, settingsFile };
  registerIpc(services);
  await loadMainWindow(window);

  app.on('second-instance', (_event, argv) => {
    if (window.isDestroyed()) return;
    if (argv.includes(START_LOOP_ARG)) {
      void startPlayback(services, { allowWithoutCamera: true }, 'login');
      return;
    }
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });

  if (selfTest) {
    const code = await runSelfTest({ window, playback, settingsFile });
    app.exit(code);
    return;
  }

  const settings = readSettingsFile(settingsFile);
  const openedAtLogin = app.getLoginItemSettings().wasOpenedAtLogin === true;
  if (
    shouldAutoplay({
      argv: process.argv,
      wasOpenedAtLogin: openedAtLogin,
      startOnLogin: settings.startOnLogin,
    })
  ) {
    await startPlayback(services, { allowWithoutCamera: true }, 'login');
  }
}

app.on('window-all-closed', () => {
  app.quit();
});
