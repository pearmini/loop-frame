import { START_LOOP_ARG } from './types';

export const LOGIN_LIMITATION =
  'This opens Loopframe when you log in to this account. It does not start the computer or run before anyone logs in.';

export const UNPACKAGED_LOGIN_MESSAGE =
  'The choice is saved on this computer. Login launch registers after Loopframe is installed. A development checkout is left unchanged so it does not register the Electron shell.';

export const LINUX_PACKAGED_REQUIRED =
  'Install the packaged Loopframe app to open it when you log in. A development checkout does not have a stable launch command.';

export const LOGIN_APPROVAL_MESSAGE =
  'macOS needs approval before Loopframe can open at login. Go to System Settings → General → Login Items and allow Loopframe.';

export interface AutoplayInput {
  argv: readonly string[];
  wasOpenedAtLogin: boolean;
  startOnLogin: boolean;
}

export function shouldAutoplay(input: AutoplayInput): boolean {
  if (!input.startOnLogin) return false;
  return input.wasOpenedAtLogin || input.argv.includes(START_LOOP_ARG);
}

export type LoginPlan =
  | { kind: 'skip'; message: string }
  | { kind: 'electron'; openAtLogin: boolean; args?: string[] }
  | { kind: 'xdg'; enabled: boolean };

export function planLoginRegistration(input: {
  platform: string;
  packaged: boolean;
  enabled: boolean;
}): LoginPlan {
  if (input.platform === 'linux') {
    if (!input.packaged) return { kind: 'skip', message: LINUX_PACKAGED_REQUIRED };
    return { kind: 'xdg', enabled: input.enabled };
  }
  if (input.platform !== 'darwin' && input.platform !== 'win32') {
    return { kind: 'skip', message: 'This system cannot register Loopframe to open at login.' };
  }
  if (!input.packaged) return { kind: 'skip', message: UNPACKAGED_LOGIN_MESSAGE };
  if (input.platform === 'win32') {
    return {
      kind: 'electron',
      openAtLogin: input.enabled,
      args: input.enabled ? [START_LOOP_ARG] : [],
    };
  }
  return { kind: 'electron', openAtLogin: input.enabled };
}

export function linuxDesktopEntry(execLine: string): string {
  return `[Desktop Entry]
Type=Application
Version=1.0
Name=Loopframe
Comment=Open Loopframe exhibition playback at login
Exec=${execLine} ${START_LOOP_ARG}
Terminal=false
Categories=Utility;
X-GNOME-Autostart-enabled=true
`;
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function autostartFilePath(home: string): string {
  return `${home}/.config/autostart/loopframe.desktop`;
}
