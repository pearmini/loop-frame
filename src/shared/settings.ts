import { isValidDuration, validateUrl } from './validate';
import {
  DEFAULT_DURATION_SECONDS,
  MAX_SITES,
  MAX_URL_LENGTH,
  SETTINGS_VERSION,
  type Settings,
  type Site,
} from './types';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

export function defaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,
    defaultDurationSeconds: DEFAULT_DURATION_SECONDS,
    startOnLogin: false,
    allowMicrophone: false,
    sites: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseSettings(value: unknown): Settings {
  if (!isRecord(value)) throw new Error('Settings are not in a recognizable format.');
  if (value.version !== SETTINGS_VERSION) throw new Error('Settings were saved by an unsupported version.');
  if (!isValidDuration(value.defaultDurationSeconds)) {
    throw new Error('The default duration is not a valid number of seconds.');
  }
  if (typeof value.startOnLogin !== 'boolean') throw new Error('The startup choice is missing.');
  if (typeof value.allowMicrophone !== 'boolean') throw new Error('The microphone choice is missing.');
  if (!Array.isArray(value.sites)) throw new Error('The website list is missing.');
  if (value.sites.length > MAX_SITES) throw new Error(`Only ${MAX_SITES} websites can be saved.`);

  const sites: Site[] = value.sites.map((site, index) => parseSite(site, index));
  const ids = new Set(sites.map((site) => site.id));
  if (ids.size !== sites.length) throw new Error('Each website needs its own id.');

  return {
    version: SETTINGS_VERSION,
    defaultDurationSeconds: value.defaultDurationSeconds,
    startOnLogin: value.startOnLogin,
    allowMicrophone: value.allowMicrophone,
    sites,
  };
}

function parseSite(value: unknown, index: number): Site {
  const label = `Website ${index + 1}`;
  if (!isRecord(value)) throw new Error(`${label} is not valid.`);
  if (typeof value.id !== 'string' || !ID_PATTERN.test(value.id)) {
    throw new Error(`${label} has an invalid id.`);
  }
  if (typeof value.url !== 'string' || value.url.length > MAX_URL_LENGTH) {
    throw new Error(`${label} has an address that cannot be saved.`);
  }
  if (value.durationSeconds !== null && !isValidDuration(value.durationSeconds)) {
    throw new Error(`${label} has a duration that cannot be saved.`);
  }
  return {
    id: value.id,
    url: value.url.trim(),
    durationSeconds: value.durationSeconds,
  };
}

export function listedOrigins(sites: readonly Pick<Site, 'url'>[]): string[] {
  const origins: string[] = [];
  for (const site of sites) {
    if (validateUrl(site.url) !== null) continue;
    const origin = new URL(site.url.trim()).origin;
    if (!origins.includes(origin)) origins.push(origin);
  }
  return origins;
}
