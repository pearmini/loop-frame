import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import {
  autostartFilePath,
  linuxDesktopEntry,
  LOGIN_APPROVAL_MESSAGE,
  planLoginRegistration,
  shellQuote,
} from '../shared/launch';
import type { StartupStatus } from '../shared/types';

export function syncLoginItem(enabled: boolean): StartupStatus {
  const plan = planLoginRegistration({
    platform: process.platform,
    packaged: app.isPackaged,
    enabled,
  });
  if (plan.kind === 'skip') {
    return { ok: true, registered: false, status: null, message: enabled ? plan.message : null };
  }
  if (plan.kind === 'xdg') return writeLinuxAutostart(plan.enabled);
  try {
    if (plan.args) app.setLoginItemSettings({ openAtLogin: plan.openAtLogin, args: plan.args });
    else app.setLoginItemSettings({ openAtLogin: plan.openAtLogin });
    return electronLoginStatus(plan.args);
  } catch (error) {
    return {
      ok: false,
      registered: false,
      status: null,
      message: error instanceof Error ? error.message : 'Loopframe could not change login startup.',
    };
  }
}

export function currentStartupStatus(enabled: boolean): StartupStatus {
  const plan = planLoginRegistration({
    platform: process.platform,
    packaged: app.isPackaged,
    enabled,
  });
  if (plan.kind === 'skip') {
    return { ok: true, registered: false, status: null, message: enabled ? plan.message : null };
  }
  if (plan.kind === 'xdg') {
    const registered = fs.existsSync(autostartFilePath(os.homedir()));
    return {
      ok: true,
      registered,
      status: registered ? 'enabled' : 'not-registered',
      message: null,
    };
  }
  return electronLoginStatus(plan.args);
}

function electronLoginStatus(args?: string[]): StartupStatus {
  const settings = args ? app.getLoginItemSettings({ args }) : app.getLoginItemSettings();
  const status = typeof settings.status === 'string' ? settings.status : null;
  return {
    ok: true,
    registered: settings.openAtLogin,
    status,
    message: status === 'requires-approval' ? LOGIN_APPROVAL_MESSAGE : null,
  };
}

function writeLinuxAutostart(enabled: boolean): StartupStatus {
  const file = autostartFilePath(os.homedir());
  if (!enabled) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return { ok: true, registered: false, status: 'not-registered', message: null };
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, linuxDesktopEntry(shellQuote(process.execPath)));
  return { ok: true, registered: true, status: 'enabled', message: null };
}
