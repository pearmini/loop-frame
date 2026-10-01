import { SETTINGS_VERSION, type Settings, type Site } from '../shared/types';
import { parseDurationInput, playBlockers, validateUrl } from '../shared/validate';

interface Row {
  id: string;
  url: string;
  durationText: string;
}

const sitesElement = required<HTMLUListElement>('#sites');
const emptySites = required<HTMLElement>('#empty-sites');
const addButton = required<HTMLButtonElement>('#add-site');
const defaultDurationInput = required<HTMLInputElement>('#default-duration');
const defaultDurationError = required<HTMLElement>('#default-duration-error');
const startOnLoginInput = required<HTMLInputElement>('#start-on-login');
const allowMicrophoneInput = required<HTMLInputElement>('#allow-microphone');
const playButton = required<HTMLButtonElement>('#play');
const playAnywayButton = required<HTMLButtonElement>('#play-anyway');
const formError = required<HTMLElement>('#form-error');
const cameraBanner = required<HTMLElement>('#camera-banner');
const cameraMessage = required<HTMLElement>('#camera-message');
const cameraRetry = required<HTMLButtonElement>('#camera-retry');
const startupStatus = required<HTMLElement>('#startup-status');

let rows: Row[] = [];
let saveTimer = 0;
let saveToken = 0;
let dragIndex = -1;

if (window.loopframe.platform === 'darwin') document.body.classList.add('darwin');

addButton.addEventListener('click', () => {
  rows.push({ id: newId(), url: '', durationText: '' });
  renderRows();
  const inputs = sitesElement.querySelectorAll<HTMLInputElement>('.site-url');
  inputs[inputs.length - 1]?.focus();
  scheduleSave();
});

defaultDurationInput.addEventListener('input', () => {
  showDefaultDurationError();
  updatePlayState();
  scheduleSave();
});

startOnLoginInput.addEventListener('change', () => {
  void saveNow();
});

allowMicrophoneInput.addEventListener('change', () => {
  void saveNow();
});

playButton.addEventListener('click', () => {
  void play(false);
});

playAnywayButton.addEventListener('click', () => {
  void play(true);
});

cameraRetry.addEventListener('click', () => {
  void refreshCamera(true);
});

sitesElement.addEventListener('dragstart', (event) => {
  const site = siteRow(event.target);
  if (!site) return;
  dragIndex = Number(site.dataset.index);
  event.dataTransfer?.setData('text/plain', String(dragIndex));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
});

sitesElement.addEventListener('dragover', (event) => {
  if (!siteRow(event.target)) return;
  event.preventDefault();
});

sitesElement.addEventListener('drop', (event) => {
  event.preventDefault();
  const site = siteRow(event.target);
  if (!site || dragIndex < 0) return;
  moveRow(dragIndex, Number(site.dataset.index));
  dragIndex = -1;
});

window.loopframe.onPlaybackStopped(() => {
  playAnywayButton.hidden = true;
  void refreshCamera(false);
});

void boot();

async function boot(): Promise<void> {
  try {
    applySettings(await window.loopframe.getSettings());
    renderRows();
    await refreshCamera(false);
    await refreshStartup();
  } catch (error) {
    formError.textContent = error instanceof Error ? error.message : 'Settings could not be loaded.';
  }
}

function applySettings(settings: Settings): void {
  rows = settings.sites.map((site) => ({
    id: site.id,
    url: site.url,
    durationText: site.durationSeconds === null ? '' : String(site.durationSeconds),
  }));
  defaultDurationInput.value = String(settings.defaultDurationSeconds);
  startOnLoginInput.checked = settings.startOnLogin;
  allowMicrophoneInput.checked = settings.allowMicrophone;
}

function renderRows(): void {
  sitesElement.replaceChildren();
  rows.forEach((row, index) => sitesElement.append(createRow(row, index)));
  emptySites.hidden = rows.length > 0;
  showDefaultDurationError();
  updatePlayState();
}

function createRow(row: Row, index: number): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'site';
  item.dataset.index = String(index);

  const handle = document.createElement('div');
  handle.className = 'handle';
  handle.draggable = true;
  handle.textContent = '⋮⋮';
  handle.title = 'Drag to reorder';

  const nudge = document.createElement('div');
  nudge.className = 'nudge';
  nudge.append(
    iconButton('↑', `Move website ${index + 1} up`, () => moveRow(index, index - 1)),
    iconButton('↓', `Move website ${index + 1} down`, () => moveRow(index, index + 1)),
  );

  const url = document.createElement('input');
  url.className = 'site-url';
  url.type = 'url';
  url.spellcheck = false;
  url.autocomplete = 'off';
  url.placeholder = 'https://';
  url.value = row.url;
  url.setAttribute('aria-label', `Website ${index + 1} address`);
  url.addEventListener('input', () => {
    row.url = url.value;
    showRowError(item, row);
    updatePlayState();
    scheduleSave();
  });

  const duration = document.createElement('input');
  duration.className = 'site-duration';
  duration.type = 'text';
  duration.inputMode = 'numeric';
  duration.autocomplete = 'off';
  duration.placeholder = 'Default';
  duration.value = row.durationText;
  duration.setAttribute('aria-label', `Website ${index + 1} duration in seconds`);
  duration.addEventListener('input', () => {
    row.durationText = duration.value;
    showRowError(item, row);
    updatePlayState();
    scheduleSave();
  });

  const remove = iconButton('Remove', `Remove website ${index + 1}`, () => {
    rows.splice(index, 1);
    renderRows();
    scheduleSave();
  });

  const error = document.createElement('p');
  error.className = 'row-error';

  item.append(handle, nudge, url, duration, remove, error);
  showRowError(item, row);
  return item;
}

function showRowError(item: HTMLElement, row: Row): void {
  const error = item.querySelector('.row-error');
  if (!error) return;
  const message = validateUrl(row.url) ?? parseDurationInput(row.durationText).error;
  error.textContent = message ?? '';
  item.classList.toggle('invalid', Boolean(message));
}

function showDefaultDurationError(): void {
  const parsed = parseDurationInput(defaultDurationInput.value);
  defaultDurationError.textContent = parsed.value === null && !parsed.error ? 'Enter a default duration.' : (parsed.error ?? '');
}

function moveRow(from: number, to: number): void {
  if (to < 0 || to >= rows.length || from === to) return;
  const [row] = rows.splice(from, 1);
  if (!row) return;
  rows.splice(to, 0, row);
  renderRows();
  scheduleSave();
}

function scheduleSave(): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void saveNow();
  }, 200);
}

async function saveNow(): Promise<boolean> {
  const token = ++saveToken;
  const draft = draftSettings();
  if (!draft.settings) {
    formError.textContent = draft.error ?? 'Fix the form before saving.';
    updatePlayState();
    return false;
  }
  const result = await window.loopframe.saveSettings(draft.settings);
  if (token !== saveToken) return result.ok;
  if (!result.ok) {
    formError.textContent = result.error;
    return false;
  }
  showStartup(result.startup.message);
  if (!currentBlockers().length) formError.textContent = '';
  updatePlayState();
  return true;
}

function draftSettings(): { settings: Settings | null; error: string | null } {
  const duration = parseDurationInput(defaultDurationInput.value);
  if (duration.error || duration.value === null) {
    return { settings: null, error: duration.error ?? 'Enter a default duration.' };
  }
  const sites: Site[] = [];
  for (const row of rows) {
    const parsed = parseDurationInput(row.durationText);
    if (parsed.error || (row.durationText.trim() && parsed.value === null)) {
      return { settings: null, error: parsed.error ?? 'Fix the highlighted durations.' };
    }
    sites.push({ id: row.id, url: row.url.trim(), durationSeconds: parsed.value });
  }
  return {
    settings: {
      version: SETTINGS_VERSION,
      defaultDurationSeconds: duration.value,
      startOnLogin: startOnLoginInput.checked,
      allowMicrophone: allowMicrophoneInput.checked,
      sites,
    },
    error: null,
  };
}

function currentBlockers(): string[] {
  const draft = draftSettings();
  if (!draft.settings) return [draft.error ?? 'Fix the form before playing.'];
  return playBlockers(draft.settings.sites, draft.settings.defaultDurationSeconds);
}

function updatePlayState(): void {
  const blockers = currentBlockers();
  playButton.disabled = blockers.length > 0;
  playButton.title = blockers[0] ?? 'Open the loop in full screen';
}

async function play(allowWithoutCamera: boolean): Promise<void> {
  playAnywayButton.hidden = true;
  const saved = await saveNow();
  if (!saved) return;
  const blockers = currentBlockers();
  if (blockers.length > 0) {
    formError.textContent = blockers[0] ?? '';
    return;
  }
  let result;
  try {
    result = await window.loopframe.play({ allowWithoutCamera });
  } catch (error) {
    formError.textContent = error instanceof Error ? error.message : 'Playback could not start.';
    return;
  }
  if (!result.ok) {
    formError.textContent = result.error;
    playAnywayButton.hidden = !result.cameraDenied;
    await refreshCamera(false);
    return;
  }
  formError.textContent = '';
}

async function refreshCamera(request: boolean): Promise<void> {
  const status = request ? await window.loopframe.requestCameraAccess() : await window.loopframe.getCameraStatus();
  const unsupportedNote =
    'Listed websites are allowed to use the camera inside Loopframe. The operating system can still deny the camera, and Loopframe cannot override that setting.';
  if (!status.supported) {
    cameraBanner.hidden = false;
    cameraMessage.textContent = unsupportedNote;
    cameraRetry.hidden = true;
    return;
  }
  cameraRetry.hidden = status.camera === 'granted';
  cameraBanner.hidden = !status.message;
  cameraMessage.textContent = status.message ?? '';
}

async function refreshStartup(): Promise<void> {
  const status = await window.loopframe.getStartupStatus();
  showStartup(status.message);
}

function showStartup(message: string | null): void {
  startupStatus.hidden = !message;
  startupStatus.textContent = message ?? '';
}

function iconButton(label: string, aria: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button';
  button.textContent = label;
  button.setAttribute('aria-label', aria);
  button.addEventListener('click', onClick);
  return button;
}

function siteRow(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  const site = target.closest('.site');
  return site instanceof HTMLElement ? site : null;
}

function newId(): string {
  const uuid = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (uuid) {
    try {
      return uuid();
    } catch {
      // file:// pages may not expose randomUUID.
    }
  }
  return `site-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element as T;
}
