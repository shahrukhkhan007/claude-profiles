import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cp = require('child_process');

// Pretend we're on macOS and capture spawn() instead of really launching.
Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
let lastSpawn = '';
cp.spawn = (cmd, args) => { lastSpawn = cmd + ' ' + (args || []).join(' '); return { unref() {} }; };

const detail = require('../engine/detail');
const store = require('../engine/instances');
store.update = () => {};                 // don't touch profiles.json
const { launch } = require('../engine/launch');

test('running profile is focused, not duplicated', () => {
  detail.pidFor = () => 4242;
  let fronted = false;
  detail.bringToFront = () => { fronted = true; return { ok: true }; };
  lastSpawn = '';
  launch({ id: 'a', dataDir: '/tmp/Claude-test', mode: 'simple' });
  assert.equal(fronted, true, 'should focus the running instance');
  assert.equal(lastSpawn, '', 'should NOT spawn a new instance');
});

test('stopped simple profile launches exactly one instance', () => {
  detail.pidFor = () => null;
  lastSpawn = '';
  launch({ id: 'b', dataDir: '/tmp/Claude-x', mode: 'simple' });
  assert.equal(lastSpawn, 'open -n -a Claude --args --user-data-dir=/tmp/Claude-x');
});

test('stopped custom profile launches its own bundle', () => {
  detail.pidFor = () => null;
  lastSpawn = '';
  launch({ id: 'c', dataDir: '/tmp/Claude-work', mode: 'custom', bundlePath: '/Applications/Claude Work.app' });
  assert.equal(lastSpawn, 'open -n /Applications/Claude Work.app --args --user-data-dir=/tmp/Claude-work');
});
