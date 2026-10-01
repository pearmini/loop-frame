import { session } from 'electron';
import { decidePermission, frameOrigin, mediaKindsFrom } from '../shared/permission-policy';
import { listedOrigins } from '../shared/settings';
import type { Settings } from '../shared/types';

export interface PermissionTrace {
  kind: 'request' | 'check';
  permission: string;
  origin: string | null;
  allow: boolean;
  media: string;
}

export const permissionLog: PermissionTrace[] = [];

export function installPermissionHandlers(getSettings: () => Settings): void {
  const partition = session.defaultSession;

  partition.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    const settings = getSettings();
    const origin = frameOrigin({
      securityOrigin: 'securityOrigin' in details ? details.securityOrigin : null,
      requestingUrl: details.requestingUrl,
    });
    const mediaTypes = 'mediaTypes' in details ? details.mediaTypes : undefined;
    const allow = decidePermission({
      permission,
      requestingOrigin: origin,
      listedOrigins: listedOrigins(settings.sites),
      mediaKinds: mediaKindsFrom(mediaTypes),
      allowMicrophone: settings.allowMicrophone,
    });
    permissionLog.push({
      kind: 'request',
      permission,
      origin,
      allow,
      media: (mediaTypes ?? []).join(',') || 'unknown',
    });
    callback(allow);
  });

  partition.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) => {
    const settings = getSettings();
    const origin = frameOrigin({
      requestingOrigin,
      securityOrigin: details.securityOrigin,
      requestingUrl: details.requestingUrl,
    });
    const allow = decidePermission({
      permission,
      requestingOrigin: origin,
      listedOrigins: listedOrigins(settings.sites),
      mediaKinds: mediaKindsFrom(details.mediaType ? [details.mediaType] : undefined),
      allowMicrophone: settings.allowMicrophone,
    });
    permissionLog.push({
      kind: 'check',
      permission,
      origin,
      allow,
      media: details.mediaType ?? 'unknown',
    });
    return allow;
  });
}
