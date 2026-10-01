import { app, systemPreferences } from 'electron';
import { cameraGuidance, microphoneGuidance } from '../shared/camera-guidance';
import type { CameraStatus, MediaAccessStatus } from '../shared/types';

export function readCameraStatus(options: { allowCamera: boolean; allowMicrophone: boolean }): CameraStatus {
  const supported = process.platform === 'darwin';
  const camera = supported && options.allowCamera ? readStatus('camera') : 'unsupported';
  const microphone = supported && options.allowMicrophone ? readStatus('microphone') : 'unsupported';
  const cameraMessage = supported && options.allowCamera ? cameraGuidance(camera, app.isPackaged) : null;
  const micMessage = supported && options.allowMicrophone ? microphoneGuidance(microphone, app.isPackaged) : null;
  const message = [cameraMessage, micMessage].filter((item): item is string => Boolean(item)).join(' ');
  return {
    supported,
    camera,
    microphone,
    message: message || null,
    packaged: app.isPackaged,
  };
}

export async function ensureMediaAccess(media: 'camera' | 'microphone'): Promise<MediaAccessStatus> {
  if (process.platform !== 'darwin') return 'unsupported';
  const current = readStatus(media);
  if (current !== 'not-determined') return current;
  const granted = await systemPreferences.askForMediaAccess(media);
  return granted ? 'granted' : readStatus(media);
}

function readStatus(media: 'camera' | 'microphone'): MediaAccessStatus {
  const status = systemPreferences.getMediaAccessStatus(media);
  if (
    status === 'not-determined' ||
    status === 'granted' ||
    status === 'denied' ||
    status === 'restricted' ||
    status === 'unknown'
  ) {
    return status;
  }
  return 'unknown';
}
