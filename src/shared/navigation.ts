export type NavigationKind = 'redirect' | 'navigate' | 'window-open';

export function decideNavigation(input: {
  url: string;
  kind: NavigationKind;
  listedOrigins: readonly string[];
  initialLoad: boolean;
}): 'allow' | 'deny' {
  if (input.kind === 'window-open') return 'deny';
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return 'deny';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'deny';
  if (input.kind === 'redirect' && input.initialLoad) return 'allow';
  return input.listedOrigins.includes(parsed.origin) ? 'allow' : 'deny';
}
