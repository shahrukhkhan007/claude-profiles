import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('slug normalizes profile names', () => {
  const { slug } = require('../engine/custom.js');
  assert.equal(slug('Work'), 'Work');
  assert.equal(slug('My Work!!'), 'My-Work');
  assert.equal(slug('  spaced  name '), 'spaced-name');
  assert.equal(slug(''), 'profile');
});

test('updateAvailable: custom macOS only, when versions differ', () => {
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  const { updateAvailable } = require('../engine/index.js');
  assert.equal(updateAvailable({ mode: 'custom', claudeVersionAtBuild: '1.0' }, '1.1'), true);
  assert.equal(updateAvailable({ mode: 'custom', claudeVersionAtBuild: '1.1' }, '1.1'), false);
  assert.equal(updateAvailable({ mode: 'simple', claudeVersionAtBuild: '1.0' }, '1.1'), false);
  assert.equal(updateAvailable({ mode: 'custom' }, '1.1'), false);
});

test('clone entitlements keep device access (mic for dictation) and drop team-bound keys', () => {
  const { cloneEntitlementKeys } = require('../engine/custom.js');
  const keys = cloneEntitlementKeys({
    'com.apple.application-identifier': 'TEAM.com.anthropic.claudefordesktop',
    'com.apple.developer.team-identifier': 'TEAM',
    'keychain-access-groups': ['TEAM.x'],
    'com.apple.security.device.audio-input': true,
    'com.apple.security.device.camera': true,
    'com.apple.security.cs.allow-jit': true,
  });
  assert.ok(keys.includes('com.apple.security.device.audio-input'));
  assert.ok(keys.includes('com.apple.security.device.camera'));
  assert.ok(keys.includes('com.apple.security.cs.disable-library-validation'));
  assert.ok(!keys.some((k) => /application-identifier|developer|keychain/.test(k)));
  assert.ok(cloneEntitlementKeys(null).includes('com.apple.security.device.audio-input'), 'fallback still grants mic');
});

test('updateAvailable flags clones signed before the mic-entitlement fix', () => {
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  const { updateAvailable } = require('../engine/index.js');
  assert.equal(updateAvailable({ mode: 'custom', bundlePath: '/A.app', claudeVersionAtBuild: '1.1' }, '1.1'), true);
  assert.equal(updateAvailable({ mode: 'custom', bundlePath: '/A.app', signVersion: 2, claudeVersionAtBuild: '1.1' }, '1.1'), false);
});
