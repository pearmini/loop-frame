import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { PlaybackCommand, PlaybackViewState } from '../shared/types';

const api = {
  command: (command: PlaybackCommand): void => {
    ipcRenderer.send('playback:command', command);
  },
  onState: (callback: (state: PlaybackViewState) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, state: PlaybackViewState) => callback(state);
    ipcRenderer.on('playback:state', listener);
    return () => ipcRenderer.removeListener('playback:state', listener);
  },
};

contextBridge.exposeInMainWorld('loopframeControls', api);
