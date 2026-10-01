import { app, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { cameraGuidance } from '../shared/camera-guidance';
import { parseSettings } from '../shared/settings';
import type { PlayFailure, PlayRequest, PlaySuccess, PlaybackCommand } from '../shared/types';
import { playBlockers } from '../shared/validate';
import { ensureMediaAccess, readCameraStatus } from './camera';
import { currentStartupStatus, syncLoginItem } from './login-item';
import { controlsHtmlPath, settingsHtmlPath } from './paths';
import type { PlaybackController } from './playback';
import { readSettingsFile, writeSettingsFile } from './settings-store';

export interface AppServices {
  playback: PlaybackController;
  settingsFile: string;
}

const COMMANDS: readonly PlaybackCommand[] = ['pause', 'resume', 'next', 'previous', 'exit'];

export function registerIpc(services: AppServices): void {
  ipcMain.handle('settings:get', (event) => {
    assertSender(event, settingsHtmlPath());
    return readSettingsFile(services.settingsFile);
  });

  ipcMain.handle('settings:save', (event, payload: unknown) => {
    assertSender(event, settingsHtmlPath());
    try {
      const settings = parseSettings(payload);
      writeSettingsFile(services.settingsFile, settings);
      const startup = syncLoginItem(settings.startOnLogin);
      return { ok: true as const, settings, startup };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : 'Settings could not be saved.',
      };
    }
  });

  ipcMain.handle('playback:start', (event, payload: unknown) => {
    assertSender(event, settingsHtmlPath());
    return startPlayback(services, parsePlayRequest(payload), 'manual');
  });

  ipcMain.handle('camera:status', (event) => {
    assertSender(event, settingsHtmlPath());
    return readCameraStatus(readSettingsFile(services.settingsFile));
  });

  ipcMain.handle('camera:request', async (event) => {
    assertSender(event, settingsHtmlPath());
    const settings = readSettingsFile(services.settingsFile);
    if (process.platform === 'darwin') {
      if (settings.allowCamera) await ensureMediaAccess('camera');
      if (settings.allowMicrophone) await ensureMediaAccess('microphone');
    }
    return readCameraStatus(settings);
  });

  ipcMain.handle('startup:status', (event) => {
    assertSender(event, settingsHtmlPath());
    return currentStartupStatus(readSettingsFile(services.settingsFile).startOnLogin);
  });

  ipcMain.on('playback:command', (event, command: unknown) => {
    assertSender(event, controlsHtmlPath());
    if (!isCommand(command)) return;
    services.playback.command(command);
  });
}

export async function startPlayback(
  services: AppServices,
  request: PlayRequest,
  mode: 'manual' | 'login',
): Promise<PlaySuccess | PlayFailure> {
  const settings = readSettingsFile(services.settingsFile);
  const blockers = playBlockers(settings.sites, settings.defaultDurationSeconds);
  if (blockers.length > 0) return { ok: false, error: blockers[0] ?? 'Add a website before playing.', cameraDenied: false };

  if (process.platform === 'darwin') {
    if (settings.allowCamera) {
      const camera = await ensureMediaAccess('camera');
      const denied = camera === 'denied' || camera === 'restricted' || camera === 'unknown';
      if (mode === 'manual' && denied && !request.allowWithoutCamera) {
        return {
          ok: false,
          error: cameraGuidance(camera, app.isPackaged) ?? 'Camera access is unavailable.',
          cameraDenied: true,
        };
      }
    }
    if (settings.allowMicrophone) await ensureMediaAccess('microphone');
  }

  await services.playback.start(settings);
  return { ok: true };
}

export function assertSender(event: IpcMainInvokeEvent | IpcMainEvent, htmlFile: string): void {
  const frameUrl = event.senderFrame?.url;
  if (!frameUrl) throw new Error('Forbidden');
  const parsed = new URL(frameUrl);
  if (parsed.protocol !== 'file:' || parsed.search || parsed.hash) throw new Error('Forbidden');
  if (path.resolve(fileURLToPath(frameUrl)) !== path.resolve(htmlFile)) throw new Error('Forbidden');
}

function parsePlayRequest(payload: unknown): PlayRequest {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('Playback request is invalid.');
  }
  const allowWithoutCamera = (payload as { allowWithoutCamera?: unknown }).allowWithoutCamera;
  if (typeof allowWithoutCamera !== 'boolean') throw new Error('Playback request is invalid.');
  return { allowWithoutCamera };
}

function isCommand(value: unknown): value is PlaybackCommand {
  return typeof value === 'string' && COMMANDS.includes(value as PlaybackCommand);
}
