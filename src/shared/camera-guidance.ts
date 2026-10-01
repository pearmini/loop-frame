import type { MediaAccessStatus } from './types';

export function cameraGuidance(status: MediaAccessStatus, packaged: boolean): string | null {
  if (status === 'granted' || status === 'unsupported') return null;
  if (status === 'not-determined') {
    const identity = packaged
      ? 'macOS will show one system prompt for Loopframe.'
      : 'In development, macOS asks for the Electron app, not a packaged Loopframe.';
    return `${identity} Listed websites will not show their own camera popups after the system allows access. Loopframe cannot skip the system prompt.`;
  }
  if (status === 'restricted') {
    return 'Camera access is restricted on this Mac by a device policy or parental control. Loopframe cannot override that. Change the restriction, then choose Retry.';
  }
  if (status === 'denied') {
    const appName = packaged ? 'Loopframe' : 'Electron';
    return `Camera access is off for ${appName}. Open System Settings → Privacy & Security → Camera, enable ${appName}, then choose Retry. Loopframe cannot bypass this system setting.`;
  }
  return 'Loopframe could not read the macOS camera setting. Choose Retry, or play without camera access.';
}

export function microphoneGuidance(status: MediaAccessStatus, packaged: boolean): string | null {
  if (status === 'granted' || status === 'unsupported' || status === 'not-determined') return null;
  const appName = packaged ? 'Loopframe' : 'Electron';
  if (status === 'denied' || status === 'restricted') {
    return `Microphone access is off for ${appName}. Open System Settings → Privacy & Security → Microphone and enable ${appName}. Listed websites can still use the camera.`;
  }
  return null;
}
