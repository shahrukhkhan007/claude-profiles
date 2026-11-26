import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';

// Regression: Stop used `pkill -f <profile dir>`, which killed Claude's helper
// processes too, including the network service holding unflushed cookies. A
// login Claude had just refreshed could be lost, leaving a stale one that
// claude.ai rejects (403) → profile logged out on next launch.
const require = createRequire(import.meta.url);
delete process.env.CP_TEST;
const d = require('../engine/detail.js');

const MAIN = { pid: 10, args: '/Applications/Claude.app/Contents/MacOS/Claude --user-data-dir=/x' };
const HELPERS = [
  { pid: 11, args: '/Applications/Claude.app/Contents/Frameworks/Claude Helper.app/Contents/MacOS/Claude Helper --type=utility --utility-sub-type=network.mojom.NetworkService --user-data-dir=/x' },
  { pid: 12, args: '/Applications/Claude.app/Contents/Frameworks/Claude Helper (Renderer).app/Contents/MacOS/Claude Helper (Renderer) --type=renderer --user-data-dir=/x' },
];

test('main process is the one without --type=', () => {
  assert.equal(d.mainProc([...HELPERS, MAIN]).pid, 10);
  assert.equal(d.mainProc(HELPERS), null);
  const parsed = d.parseProcs('  10 /Applications/Claude.app/Contents/MacOS/Claude --user-data-dir=/Users/me/Library/Application Support/Claude-Work\n', ' ');
  assert.deepEqual(parsed, [{ pid: 10, args: '/Applications/Claude.app/Contents/MacOS/Claude --user-data-dir=/Users/me/Library/Application Support/Claude-Work' }]);
});

test('stop asks only the main process to quit, and never force-kills when it exits in time', async () => {
  const sent = [];
  let alive = [MAIN, ...HELPERS];
  const r = await d.stop({ dataDir: '/x' }, {
    platform: 'darwin', graceMs: 2000,
    list: () => alive,
    kill: (pid, sig) => { sent.push([pid, sig]); if (pid === 10) setTimeout(() => { alive = []; }, 300); }, // Claude quits itself + helpers
  });
  assert.deepEqual(sent, [[10, 'SIGTERM']], 'only the main process is signalled');
  assert.equal(r.graceful, true);
});

test('a hung profile is ended only after the grace period', async () => {
  const sent = [];
  const r = await d.stop({ dataDir: '/x' }, { platform: 'darwin', graceMs: 500, list: () => [MAIN, ...HELPERS], kill: (pid, sig) => sent.push([pid, sig]) });
  assert.deepEqual(sent[0], [10, 'SIGTERM'], 'polite quit first');
  assert.ok(sent.some(([, s]) => s === 'SIGKILL'), 'force only as a last resort');
  assert.equal(r.graceful, false);
});

test('nothing running → no signals', async () => {
  const sent = [];
  const r = await d.stop({ dataDir: '/x' }, { platform: 'darwin', list: () => [], kill: (p, s) => sent.push([p, s]) });
  assert.equal(sent.length, 0);
  assert.equal(r.wasRunning, false);
});
