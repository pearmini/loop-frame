import type { WebContents } from 'electron';
import { decideNavigation } from '../shared/navigation';

export function attachNavigationGuards(
  contents: WebContents,
  getContext: () => { listedOrigins: readonly string[]; initialLoad: boolean },
): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, deprecatedUrl, _isInPlace, deprecatedMainFrame) => {
    guardNavigation(event, event.url || deprecatedUrl, event.isMainFrame ?? deprecatedMainFrame ?? true, 'navigate', getContext);
  });
  contents.on('will-redirect', (event, deprecatedUrl, _isInPlace, deprecatedMainFrame) => {
    guardNavigation(event, event.url || deprecatedUrl, event.isMainFrame ?? deprecatedMainFrame ?? true, 'redirect', getContext);
  });
}

function guardNavigation(
  event: { preventDefault: () => void },
  url: string,
  isMainFrame: boolean,
  kind: 'navigate' | 'redirect',
  getContext: () => { listedOrigins: readonly string[]; initialLoad: boolean },
): void {
  if (!isMainFrame) {
    if (!isWebUrl(url)) event.preventDefault();
    return;
  }
  if (decideNavigation({ url, kind, ...getContext() }) === 'deny') event.preventDefault();
}

function isWebUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
