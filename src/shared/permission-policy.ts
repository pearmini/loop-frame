import type { MediaKind } from './types';

export interface PermissionDecisionInput {
  permission: string;
  requestingOrigin: string | null;
  listedOrigins: readonly string[];
  mediaKinds: readonly MediaKind[];
  allowCamera: boolean;
  allowMicrophone: boolean;
}

export function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!parsed.hostname) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function frameOrigin(details: {
  requestingOrigin?: string | null;
  securityOrigin?: string | null;
  requestingUrl?: string | null;
}): string | null {
  return (
    normalizeOrigin(details.requestingUrl) ??
    normalizeOrigin(details.requestingOrigin) ??
    normalizeOrigin(details.securityOrigin)
  );
}

export function mediaKindsFrom(values: readonly string[] | undefined): MediaKind[] {
  if (!values || values.length === 0) return ['unknown'];
  return values.map((value) => (value === 'video' || value === 'audio' ? value : 'unknown'));
}

export function decidePermission(input: PermissionDecisionInput): boolean {
  const origin = normalizeOrigin(input.requestingOrigin);
  if (!origin) return false;
  const listed = input.listedOrigins.some((item) => normalizeOrigin(item) === origin);
  if (!listed) return false;

  const kinds = input.mediaKinds.length > 0 ? input.mediaKinds : ['unknown'];
  const audioRequested =
    input.permission === 'microphone' || input.permission === 'audioCapture' || kinds.includes('audio');
  const videoRequested =
    input.permission === 'camera' || input.permission === 'videoCapture' || kinds.includes('video');
  const mediaPermission =
    input.permission === 'media' ||
    input.permission === 'camera' ||
    input.permission === 'microphone' ||
    input.permission === 'audioCapture' ||
    input.permission === 'videoCapture';

  if (!mediaPermission) return false;
  if (audioRequested && !input.allowMicrophone) return false;
  if (videoRequested && !input.allowCamera) return false;
  if (videoRequested || audioRequested) return true;
  return false;
}
