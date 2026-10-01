import { contextBridge, ipcRenderer } from 'electron';
import type { CameraStatus, PlayFailure, PlayRequest, PlaySuccess, SaveFailure, SaveResult, Settings, StartupStatus } from '../shared/types';

const api = {
  platform: process.platform,
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: Settings): Promise<SaveResult | SaveFailure> => ipcRenderer.invoke('settings:save', settings),
  play: (request: PlayRequest): Promise<PlaySuccess | PlayFailure> => ipcRenderer.invoke('playback:start', request),
  getCameraStatus: (): Promise<CameraStatus> => ipcRenderer.invoke('camera:status'),
  requestCameraAccess: (): Promise<CameraStatus> => ipcRenderer.invoke('camera:request'),
  getStartupStatus: (): Promise<StartupStatus> => ipcRenderer.invoke('startup:status'),
  onPlaybackStopped: (callback: () => void): (() => void) => {
    const listener = () => callback();
    ipcRenderer.on('playback:stopped', listener);
    return () => ipcRenderer.removeListener('playback:stopped', listener);
  },
};

contextBridge.exposeInMainWorld('loopframe', api);
