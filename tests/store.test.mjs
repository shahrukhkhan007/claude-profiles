import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const store = require.resolve('../engine/instances.js');

// Run store code in a child process with an isolated HOME so profiles.json is hermetic.
function run(js, home) {
  return execFileSync(process.execPath, ['-e', js],
    { env: { ...process.env, HOME: home, USERPROFILE: home, CP_TEST: '1' }, encoding: 'utf8' });
}

test('add / get / list / remove roundtrip', () => {
  const home = mkdtempSync(join(tmpdir(), 'cp-'));
  const out = run(`
    const s = require(${JSON.stringify(store)});
    const a = s.add({ name: 'Work', mode: 'simple', color: 'blue' });
    s.add({ name: 'Personal', mode: 'custom', color: 'green' });
    console.log(JSON.stringify({ count: s.list().length, name: s.get(a.id).name, dir: a.dataDir, id: a.id }));
    s.update(a.id, { launches: 3 });
    console.log(JSON.stringify({ launches: s.get(a.id).launches }));
    s.remove(a.id);
    console.log(JSON.stringify({ after: s.list().length, gone: s.get(a.id) }));
  `, home);
  const [l1, l2, l3] = out.trim().split('\n').map((x) => JSON.parse(x));
  assert.equal(l1.count, 2, 'two profiles added');
  assert.equal(l1.name, 'Work');
  assert.match(l1.dir, /Claude-Work$/, 'data dir derived from name');
  assert.equal(l2.launches, 3, 'update merges fields');
  assert.equal(l3.after, 1, 'remove drops one');
  assert.equal(l3.gone, null, 'removed profile is gone');
});

test('unique ids for two profiles', () => {
  const home = mkdtempSync(join(tmpdir(), 'cp-'));
  const out = run(`
    const s = require(${JSON.stringify(store)});
    console.log(s.add({ name: 'A' }).id !== s.add({ name: 'B' }).id);
  `, home);
  assert.equal(out.trim(), 'true');
});

test('add persists iconData + a durable icon file (regression: iconData was dropped)', () => {
  const home = mkdtempSync(join(tmpdir(), 'cp-'));
  const px = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const out = run(`
    const s = require(${JSON.stringify(store)});
    const fs = require('fs');
    const a = s.add({ name: 'Pic', mode: 'simple', color: 'blue', iconData: ${JSON.stringify(px)} });
    const g = s.get(a.id);
    console.log(JSON.stringify({ hasData: !!g.iconData, iconPath: g.iconPath, fileExists: !!(g.iconPath && fs.existsSync(g.iconPath)) }));
    const u = s.update(a.id, { iconData: ${JSON.stringify(px)} });
    console.log(JSON.stringify({ updHasData: !!u.iconData, updFile: !!(u.iconPath && fs.existsSync(u.iconPath)) }));
  `, home);
  const [l1, l2] = out.trim().split('\n').map((x) => JSON.parse(x));
  assert.equal(l1.hasData, true, 'iconData is persisted on add');
  assert.match(l1.iconPath, /icons[/\\].+\.png$/, 'a durable icon file path is stored');
  assert.equal(l1.fileExists, true, 'the icon file was written to disk');
  assert.equal(l2.updHasData, true, 'update persists iconData');
  assert.equal(l2.updFile, true, 'update rewrites the durable icon file');
});
