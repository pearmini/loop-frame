import { BrowserWindow } from 'electron';
import { localWebPreferences } from '../shared/web-preferences';
import { distPath, settingsHtmlPath } from './paths';

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 980,
    height: 820,
    minWidth: 760,
    minHeight: 640,
    show: false,
    backgroundColor: '#141311',
    title: 'Loopframe',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    autoHideMenuBar: true,
    webPreferences: localWebPreferences(distPath('preload', 'settings.js')),
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, deprecatedUrl) => {
    const url = event.url || deprecatedUrl;
    const current = window.webContents.getURL();
    if (current && url !== current) event.preventDefault();
  });

  return window;
}

export async function loadMainWindow(window: BrowserWindow): Promise<void> {
  await window.loadFile(settingsHtmlPath());
  if (!window.isDestroyed()) window.show();
}
