import fs from 'node:fs';
import path from 'node:path';
import { defaultSettings, parseSettings } from '../shared/settings';
import type { Settings } from '../shared/types';

export function readSettingsFile(filePath: string): Settings {
  try {
    return parseSettings(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    if (!missing) console.error('Loopframe could not read saved settings. Using defaults.', error);
    return defaultSettings();
  }
}

export function writeSettingsFile(filePath: string, settings: Settings): void {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`);
  fs.renameSync(temporary, filePath);
}
