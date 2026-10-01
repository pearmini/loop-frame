import type { Site } from './types';

export function wrapIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

export function nextIndex(index: number, count: number): number {
  return wrapIndex(index + 1, count);
}

export function previousIndex(index: number, count: number): number {
  return wrapIndex(index - 1, count);
}

export function resolveDurationSeconds(site: Site, defaultDurationSeconds: number): number {
  return site.durationSeconds ?? defaultDurationSeconds;
}
