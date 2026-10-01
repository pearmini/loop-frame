export interface SecureWebPreferences {
  nodeIntegration: false;
  contextIsolation: true;
  sandbox: true;
  webSecurity: true;
  backgroundThrottling: false;
  preload?: string;
}

export function siteWebPreferences(): SecureWebPreferences {
  return {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    backgroundThrottling: false,
  };
}

export function localWebPreferences(preload: string): SecureWebPreferences {
  return {
    ...siteWebPreferences(),
    preload,
  };
}
