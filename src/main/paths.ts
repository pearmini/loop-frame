import fs from 'node:fs';
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

export function appIconPath(): string | null {
  return existingIcon('icon.png');
}

export function dockIconPath(): string | null {
  return existingIcon('icon-dock.png') ?? appIconPath();
}

function existingIcon(name: string): string | null {
  const file = path.join(app.getAppPath(), 'build', name);
  return fs.existsSync(file) ? file : null;
}
