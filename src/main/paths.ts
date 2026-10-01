import path from 'node:path';
import { app } from 'electron';

export function distPath(...parts: string[]): string {
  return path.join(__dirname, '..', ...parts);
}

export function settingsFilePath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function settingsHtmlPath(): string {
  return distPath('renderer', 'index.html');
}

export function controlsHtmlPath(): string {
  return distPath('renderer', 'controls.html');
}
