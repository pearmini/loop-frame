export const SETTINGS_VERSION = 1;
export const DEFAULT_DURATION_SECONDS = 30;
export const MIN_DURATION_SECONDS = 1;
export const MAX_DURATION_SECONDS = 24 * 60 * 60;
export const MAX_SITES = 100;
export const MAX_URL_LENGTH = 2048;
export const LOAD_TIMEOUT_MS = 20_000;
export const ERROR_DISPLAY_MS = 3_000;
export const CONTROLS_HIDE_MS = 2_500;
export const START_LOOP_ARG = '--start-loop';

export interface Site {
  id: string;
  url: string;
  durationSeconds: number | null;
}

export interface Settings {
  version: typeof SETTINGS_VERSION;
  defaultDurationSeconds: number;
  startOnLogin: boolean;
  allowCamera: boolean;
  allowMicrophone: boolean;
  sites: Site[];
}

export interface TimingConfig {
  loadTimeoutMs: number;
  errorDisplayMs: number;
  controlsHideMs: number;
}

export const DEFAULT_TIMING: TimingConfig = {
  loadTimeoutMs: LOAD_TIMEOUT_MS,
  errorDisplayMs: ERROR_DISPLAY_MS,
  controlsHideMs: CONTROLS_HIDE_MS,
};

export type MediaKind = 'video' | 'audio' | 'unknown';

export type MediaAccessStatus =
  | 'not-determined'
  | 'granted'
  | 'denied'
  | 'restricted'
  | 'unknown'
  | 'unsupported';

export interface CameraStatus {
  supported: boolean;
  camera: MediaAccessStatus;
  microphone: MediaAccessStatus;
  message: string | null;
  packaged: boolean;
}

export interface StartupStatus {
  ok: boolean;
  registered: boolean;
  status: string | null;
  message: string | null;
}

export interface PlaybackViewState {
  paused: boolean;
  label: string;
  position: string;
  remainingLabel: string;
  error: string | null;
  chromeVisible: boolean;
}

export type PlaybackCommand = 'pause' | 'resume' | 'next' | 'previous' | 'exit';

export interface PlayRequest {
  allowWithoutCamera: boolean;
}

export interface SaveResult {
  ok: true;
  settings: Settings;
  startup: StartupStatus;
}

export interface SaveFailure {
  ok: false;
  error: string;
}

export interface PlaySuccess {
  ok: true;
}

export interface PlayFailure {
  ok: false;
  error: string;
  cameraDenied: boolean;
}
