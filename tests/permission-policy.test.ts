import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decidePermission, frameOrigin, normalizeOrigin } from '../src/shared/permission-policy';

const listed = ['https://install.example/path'];

function decide(
  overrides: Partial<Parameters<typeof decidePermission>[0]>,
): boolean {
  return decidePermission({
    permission: 'media',
    requestingOrigin: 'https://install.example/room',
    listedOrigins: listed,
    mediaKinds: ['video'],
    allowMicrophone: false,
    ...overrides,
  });
}

describe('camera permission policy', () => {
  it('allows video only for a saved origin', () => {
    assert.equal(decide({}), true);
    assert.equal(decide({ permission: 'camera', mediaKinds: ['unknown'] }), true);
    assert.equal(decide({ requestingOrigin: 'https://other.example' }), false);
    assert.equal(decide({ requestingOrigin: null }), false);
    assert.equal(decide({ requestingOrigin: 'file:///tmp/page.html' }), false);
  });

  it('uses the requesting frame origin rather than another page', () => {
    assert.equal(
      decide({
        requestingOrigin: 'https://advertiser.example/frame',
        mediaKinds: ['video'],
      }),
      false,
    );
  });

  it('denies microphone access unless it is enabled', () => {
    assert.equal(decide({ mediaKinds: ['audio'] }), false);
    assert.equal(decide({ permission: 'microphone', mediaKinds: ['unknown'] }), false);
    assert.equal(decide({ mediaKinds: ['video', 'audio'] }), false);
    assert.equal(decide({ mediaKinds: ['audio'], allowMicrophone: true }), true);
    assert.equal(decide({ mediaKinds: ['video', 'audio'], allowMicrophone: true }), true);
  });

  it('denies permissions other than camera and optional microphone', () => {
    for (const permission of ['geolocation', 'notifications', 'display-capture', 'midi', 'pointerLock', 'fullscreen']) {
      assert.equal(decide({ permission, mediaKinds: ['video'] }), false, permission);
    }
  });

  it('does not grant an unspecified media check', () => {
    assert.equal(decide({ mediaKinds: ['unknown'] }), false);
    assert.equal(decide({ mediaKinds: [] }), false);
  });

  it('prefers the requesting frame url when choosing an origin', () => {
    assert.equal(normalizeOrigin('HTTPS://Install.Example:443/room'), 'https://install.example');
    assert.equal(
      frameOrigin({
        requestingUrl: 'https://frame.example/embed',
        requestingOrigin: 'https://install.example',
        securityOrigin: 'https://install.example',
      }),
      'https://frame.example',
    );
    assert.equal(
      frameOrigin({
        requestingOrigin: 'https://frame.example',
        securityOrigin: 'https://install.example',
      }),
      'https://frame.example',
    );
  });
});
