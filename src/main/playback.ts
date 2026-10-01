import { BrowserWindow, WebContentsView, screen, type WebContents } from 'electron';
import { attachNavigationGuards } from './navigation';
import { distPath } from './paths';
import { listedOrigins } from '../shared/settings';
import { createEngine, reduce, type EngineEvent, type EngineState } from '../shared/playback-engine';
import { resolveDurationSeconds } from '../shared/playlist';
import { siteLabel } from '../shared/validate';
import type { PlaybackCommand, PlaybackViewState, Settings, Site, TimingConfig } from '../shared/types';
import { localWebPreferences, siteWebPreferences } from '../shared/web-preferences';

export interface PlaybackDependencies {
  timing: TimingConfig;
  onExit: () => void;
}

interface ArmedTimer {
  kind: 'load' | 'display' | 'error';
  generation: number;
  remainingMs: number;
  endsAt: number;
  event: 'load-timeout' | 'display-elapsed' | 'error-elapsed';
}

export interface PlaybackSnapshot {
  phase: EngineState['phase'];
  index: number;
  generation: number;
  opened: number;
  closed: number;
  active: number;
  error: string | null;
}

/**
 * One website view is live at a time. Closing it drops the renderer, which
 * releases the camera and any timers inside that page. The next visit loads
 * the project again, so in-page state does not survive a loop. Keeping every
 * site mounted would make returns instant, and would also keep cameras,
 * memory, and background work alive for the whole playlist.
 */
export class PlaybackController {
  private engine: EngineState = createEngine(0);
  private sites: Site[] = [];
  private durationsMs: number[] = [];
  private site: WebContentsView | null = null;
  private controls: WebContentsView | null = null;
  private backdrop: WebContentsView | null = null;
  private armed: ArmedTimer | null = null;
  private timer: NodeJS.Timeout | null = null;
  private hideTimer: NodeJS.Timeout | null = null;
  private cursorTimer: NodeJS.Timeout | null = null;
  private clockTimer: NodeJS.Timeout | null = null;
  private queue: EngineEvent[] = [];
  private draining = false;
  private errorText: string | null = null;
  private chromeVisible = false;
  private lastCursor: { x: number; y: number } | null = null;
  private startPromise: Promise<void> | null = null;
  readonly stats = { opened: 0, closed: 0 };

  constructor(
    private readonly window: BrowserWindow,
    private readonly deps: PlaybackDependencies,
  ) {
    this.bindKeys(window.webContents);
    window.on('resize', () => this.layout());
    window.on('enter-full-screen', () => this.layout());
    window.on('leave-full-screen', () => {
      this.layout();
      this.handleLeaveFullScreen();
    });
    window.on('close', () => this.shutdown());
  }

  start(settings: Settings, options?: { fullscreen?: boolean }): Promise<void> {
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.startInner(settings, options?.fullscreen !== false).finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  exit(): void {
    if (this.engine.phase === 'idle' && !this.backdrop) return;
    this.dispatch({ type: 'exit' });
    if (!this.window.isDestroyed() && this.window.isFullScreen()) this.window.setFullScreen(false);
    this.deps.onExit();
  }

  shutdown(): void {
    this.stopLoops();
    this.clearArmed();
    if (this.engine.phase !== 'idle') this.dispatch({ type: 'exit' });
    else this.destroyStage();
  }

  command(name: PlaybackCommand): void {
    if (name === 'exit') this.exit();
    else this.dispatch({ type: name });
  }

  handleLeaveFullScreen(): void {
    if (this.engine.phase === 'idle') return;
    this.exit();
  }

  layout(): void {
    if (this.window.isDestroyed()) return;
    const [width, height] = this.window.getContentSize();
    const full = { x: 0, y: 0, width, height };
    this.backdrop?.setBounds(full);
    this.site?.setBounds(full);
    if (!this.controls) return;
    const margin = 20;
    const barHeight = this.chromeVisible ? 76 : 0;
    const errorHeight = this.errorText ? 64 : 0;
    const gap = barHeight > 0 && errorHeight > 0 ? 8 : 0;
    const total = barHeight + errorHeight + gap;
    if (total === 0) {
      this.controls.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      return;
    }
    this.controls.setBounds({
      x: margin,
      y: Math.max(0, height - total - margin),
      width: Math.max(0, width - margin * 2),
      height: total,
    });
  }

  getSnapshot(): PlaybackSnapshot {
    return {
      phase: this.engine.phase,
      index: this.engine.index,
      generation: this.engine.generation,
      opened: this.stats.opened,
      closed: this.stats.closed,
      active: this.site ? 1 : 0,
      error: this.errorText,
    };
  }

  currentSiteUrl(): string | null {
    if (!this.site || this.site.webContents.isDestroyed()) return null;
    return this.site.webContents.getURL();
  }

  runInSite(script: string): Promise<unknown> {
    if (!this.site || this.site.webContents.isDestroyed()) {
      return Promise.reject(new Error('No website is open.'));
    }
    return this.site.webContents.executeJavaScript(script);
  }

  sendKey(key: string): void {
    const contents = this.site && !this.site.webContents.isDestroyed() ? this.site.webContents : this.window.webContents;
    if (contents.isDestroyed()) return;
    contents.focus();
    contents.sendInputEvent({ type: 'keyDown', keyCode: key });
    contents.sendInputEvent({ type: 'keyUp', keyCode: key });
  }

  private async startInner(settings: Settings, fullscreen: boolean): Promise<void> {
    if (this.engine.phase !== 'idle') this.dispatch({ type: 'exit' });
    this.sites = settings.sites;
    this.durationsMs = settings.sites.map(
      (site) => resolveDurationSeconds(site, settings.defaultDurationSeconds) * 1000,
    );
    this.engine = createEngine(settings.sites.length);
    await this.createStage();
    if (this.window.isDestroyed()) return;
    if (fullscreen) this.window.setFullScreen(true);
    this.dispatch({ type: 'start' });
    this.revealChrome();
    this.startLoops();
  }

  private async createStage(): Promise<void> {
    this.destroyStage();
    this.backdrop = new WebContentsView({ webPreferences: siteWebPreferences() });
    this.window.contentView.addChildView(this.backdrop);
    await this.backdrop.webContents.loadFile(distPath('renderer', 'backdrop.html'));

    this.controls = new WebContentsView({
      webPreferences: localWebPreferences(distPath('preload', 'controls.js')),
    });
    this.window.contentView.addChildView(this.controls);
    this.bindKeys(this.controls.webContents);
    await this.controls.webContents.loadFile(distPath('renderer', 'controls.html'));
    this.stack();
    this.layout();
  }

  private dispatch(event: EngineEvent): void {
    this.queue.push(event);
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const next = this.queue.shift();
        if (!next) break;
        const result = reduce(this.engine, next);
        this.engine = result.state;
        for (const effect of result.effects) this.apply(effect);
      }
    } finally {
      this.draining = false;
    }
    this.layout();
    this.publish();
  }

  private apply(effect: ReturnType<typeof reduce>['effects'][number]): void {
    switch (effect.type) {
      case 'clear-timers':
        this.clearArmed();
        break;
      case 'close-active-view':
        this.closeSite();
        break;
      case 'clear-error':
        this.errorText = null;
        break;
      case 'show-error': {
        const site = this.sites[effect.index];
        const label = site ? siteLabel(site.url) : 'this website';
        this.errorText = `Couldn't open ${label}. Continuing to the next website.`;
        break;
      }
      case 'start-load-timer':
        this.arm('load', effect.generation, this.deps.timing.loadTimeoutMs, 'load-timeout');
        break;
      case 'start-display-timer':
        this.arm('display', effect.generation, this.durationsMs[this.engine.index] ?? 0, 'display-elapsed');
        break;
      case 'start-error-timer':
        this.arm('error', effect.generation, this.deps.timing.errorDisplayMs, 'error-elapsed');
        break;
      case 'open-view':
        this.openSite(effect.index, effect.generation);
        break;
      case 'pause-timer':
        this.pauseArmed();
        this.chromeVisible = true;
        if (this.hideTimer) clearTimeout(this.hideTimer);
        this.hideTimer = null;
        break;
      case 'resume-timer':
        this.resumeArmed();
        this.revealChrome();
        break;
      case 'exit-playback':
        this.errorText = null;
        this.chromeVisible = false;
        this.stopLoops();
        this.destroyStage();
        break;
      default:
        break;
    }
  }

  private openSite(index: number, generation: number): void {
    const site = this.sites[index];
    if (!site || this.window.isDestroyed()) {
      this.dispatch({ type: 'load-failed', generation });
      return;
    }
    const view = new WebContentsView({ webPreferences: siteWebPreferences() });
    this.site = view;
    this.stats.opened += 1;
    this.window.contentView.addChildView(view);
    this.stack();
    this.layout();
    const contents = view.webContents;
    contents.setBackgroundThrottling(false);
    let initialLoad = true;
    const finishInitial = () => {
      initialLoad = false;
    };
    attachNavigationGuards(contents, () => ({
      listedOrigins: listedOrigins(this.sites),
      initialLoad,
    }));
    contents.on('did-finish-load', () => {
      finishInitial();
      if (!contents.isDestroyed()) contents.focus();
      this.dispatch({ type: 'loaded', generation });
    });
    contents.on('did-fail-load', (_event, errorCode, _description, _validatedURL, isMainFrame) => {
      if (isMainFrame === false || errorCode === -3) return;
      finishInitial();
      this.dispatch({ type: 'load-failed', generation });
    });
    contents.on('render-process-gone', () => {
      this.dispatch({ type: 'page-crashed', generation });
    });
    this.bindKeys(contents);
    void contents.loadURL(site.url).catch(() => {
      // did-fail-load advances the loop while this view is still current.
    });
  }

  private closeSite(): void {
    if (!this.site) return;
    this.destroyView(this.site, true);
    this.site = null;
  }

  private destroyStage(): void {
    this.closeSite();
    if (this.controls) this.destroyView(this.controls, false);
    this.controls = null;
    if (this.backdrop) this.destroyView(this.backdrop, false);
    this.backdrop = null;
  }

  private destroyView(view: WebContentsView, countSite: boolean): void {
    if (countSite) this.stats.closed += 1;
    const contents = view.webContents;
    if (!contents.isDestroyed()) {
      contents.removeAllListeners();
      contents.stop();
      contents.close();
    }
    if (!this.window.isDestroyed()) {
      try {
        this.window.contentView.removeChildView(view);
      } catch {
        // The view was already detached.
      }
    }
  }

  private stack(): void {
    if (this.window.isDestroyed()) return;
    for (const view of [this.backdrop, this.site, this.controls]) {
      if (!view) continue;
      try {
        this.window.contentView.removeChildView(view);
      } catch {
        // Attach it below.
      }
      this.window.contentView.addChildView(view);
    }
  }

  private arm(kind: ArmedTimer['kind'], generation: number, ms: number, event: ArmedTimer['event']): void {
    this.clearTimerOnly();
    const remainingMs = Math.max(0, ms);
    this.armed = { kind, generation, remainingMs, endsAt: Date.now() + remainingMs, event };
    this.timer = setTimeout(() => {
      this.timer = null;
      this.dispatch({ type: event, generation });
    }, remainingMs);
  }

  private pauseArmed(): void {
    if (!this.armed || !this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    this.armed = { ...this.armed, remainingMs: Math.max(0, this.armed.endsAt - Date.now()), endsAt: 0 };
  }

  private resumeArmed(): void {
    if (!this.armed || this.timer) return;
    this.arm(this.armed.kind, this.armed.generation, this.armed.remainingMs, this.armed.event);
  }

  private clearArmed(): void {
    this.clearTimerOnly();
    this.armed = null;
  }

  private clearTimerOnly(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private remainingMs(): number | null {
    if (!this.armed || this.armed.kind !== 'display') return null;
    if (!this.timer) return this.armed.remainingMs;
    return Math.max(0, this.armed.endsAt - Date.now());
  }

  private revealChrome(): void {
    this.chromeVisible = true;
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
    if (!this.engine.paused && this.engine.phase !== 'idle') {
      this.hideTimer = setTimeout(() => {
        this.hideTimer = null;
        if (this.engine.phase === 'idle') return;
        this.chromeVisible = false;
        this.layout();
        this.publish();
      }, this.deps.timing.controlsHideMs);
    }
    this.layout();
    this.publish();
  }

  private startLoops(): void {
    this.stopLoops();
    this.cursorTimer = setInterval(() => this.trackCursor(), 200);
    this.clockTimer = setInterval(() => this.publish(), 250);
  }

  private stopLoops(): void {
    if (this.cursorTimer) clearInterval(this.cursorTimer);
    if (this.clockTimer) clearInterval(this.clockTimer);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.cursorTimer = null;
    this.clockTimer = null;
    this.hideTimer = null;
  }

  private trackCursor(): void {
    if (this.engine.phase === 'idle' || this.engine.paused || this.window.isDestroyed()) return;
    const point = screen.getCursorScreenPoint();
    const bounds = this.window.getBounds();
    const inside =
      point.x >= bounds.x &&
      point.x < bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y < bounds.y + bounds.height;
    const previous = this.lastCursor;
    this.lastCursor = point;
    if (!inside || !previous) return;
    if (Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y) < 3) return;
    this.revealChrome();
  }

  private publish(): void {
    if (!this.controls || this.controls.webContents.isDestroyed()) return;
    const count = this.sites.length;
    const site = this.sites[this.engine.index];
    const remaining = this.remainingMs();
    const state: PlaybackViewState = {
      paused: this.engine.paused,
      label: site ? siteLabel(site.url) : '',
      position: count > 0 && this.engine.phase !== 'idle' ? `${this.engine.index + 1} / ${count}` : '',
      remainingLabel: remaining === null ? '' : `${Math.max(0, Math.ceil(remaining / 1000))}s`,
      error: this.errorText,
      chromeVisible: this.chromeVisible,
    };
    this.controls.webContents.send('playback:state', state);
  }

  private bindKeys(contents: WebContents): void {
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || this.engine.phase === 'idle') return;
      if (input.key === 'Escape') {
        event.preventDefault();
        this.exit();
        return;
      }
      if (input.key === 'ArrowRight') {
        event.preventDefault();
        this.dispatch({ type: 'next' });
      } else if (input.key === 'ArrowLeft') {
        event.preventDefault();
        this.dispatch({ type: 'previous' });
      }
    });
  }
}
