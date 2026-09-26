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
