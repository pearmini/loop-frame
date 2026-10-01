import {
  MAX_DURATION_SECONDS,
  MAX_URL_LENGTH,
  MIN_DURATION_SECONDS,
  type Site,
} from './types';

export function validateUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return 'Enter a website address.';
  if (trimmed.length > MAX_URL_LENGTH) return 'That address is too long.';
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return 'Enter a full address starting with https:// or http://.';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Only http:// and https:// addresses can be played.';
  }
  if (!parsed.hostname) return 'That address is missing a host name.';
  return null;
}

export function validateDuration(value: number | null): string | null {
  if (value === null) return null;
  if (!isValidDuration(value)) {
    return `Use a whole number of seconds from ${MIN_DURATION_SECONDS} to ${MAX_DURATION_SECONDS}.`;
  }
  return null;
}

export function isValidDuration(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_DURATION_SECONDS &&
    value <= MAX_DURATION_SECONDS
  );
}

export function parseDurationInput(raw: string): { value: number | null; error: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null, error: null };
  if (!/^\d+$/.test(trimmed)) {
    return { value: null, error: validateDuration(Number.NaN) };
  }
  const value = Number(trimmed);
  return { value, error: validateDuration(value) };
}

export function siteLabel(url: string): string {
  const error = validateUrl(url);
  if (error) return url.trim() || 'Website';
  return new URL(url.trim()).hostname;
}

export function playBlockers(sites: Site[], defaultDurationSeconds: number): string[] {
  const blockers: string[] = [];
  if (!isValidDuration(defaultDurationSeconds)) {
    blockers.push('Set a valid default duration.');
  }
  if (sites.length === 0) blockers.push('Add at least one website.');
  if (sites.some((site) => validateUrl(site.url) !== null)) {
    blockers.push('Fix the highlighted website addresses before playing.');
  }
  if (sites.some((site) => validateDuration(site.durationSeconds) !== null)) {
    blockers.push('Fix the highlighted durations before playing.');
  }
  return blockers;
}
