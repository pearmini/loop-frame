import type { CameraStatus, PlaybackCommand, PlaybackViewState, PlayFailure, PlayRequest, PlaySuccess, SaveFailure, SaveResult, Settings, StartupStatus } from '../shared/types';

export interface SettingsBridge {
  platform: string;
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<SaveResult | SaveFailure>;
  play(request: PlayRequest): Promise<PlaySuccess | PlayFailure>;
  getCameraStatus(): Promise<CameraStatus>;
  requestCameraAccess(): Promise<CameraStatus>;
  getStartupStatus(): Promise<StartupStatus>;
  onPlaybackStopped(callback: () => void): () => void;
}

export interface ControlsBridge {
  command(command: PlaybackCommand): void;
  onState(callback: (state: PlaybackViewState) => void): () => void;
}

declare global {
  interface Window {
    loopframe: SettingsBridge;
    loopframeControls: ControlsBridge;
  }
}
