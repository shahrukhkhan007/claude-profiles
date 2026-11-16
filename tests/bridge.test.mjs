import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Isolate HOME so bridge's BACKUP_ROOT / default projects never touch the real home.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-bridge-'));
process.env.HOME = TMP;
process.env.USERPROFILE = TMP;

const here = path.dirname(fileURLToPath(import.meta.url));
const bridge = await import(pathToFileURL(path.join(here, '..', 'engine', 'bridge.js')).href);

const APP = path.join(TMP, 'Library', 'Application Support', 'Claude-TEST');
const IDX = path.join(APP, 'claude-code-sessions', 'ACCT1', 'ORG1');
const PROJROOT = path.join(TMP, '.claude', 'projects');
const PROJ = path.join(PROJROOT, 'proj1');
fs.mkdirSync(IDX, { recursive: true });
fs.mkdirSync(PROJ, { recursive: true });
fs.writeFileSync(path.join(APP, 'config.json'), JSON.stringify({ lastKnownAccountUuid: 'ACCT1' }));
fs.writeFileSync(path.join(IDX, 'local_tmpl.json'), JSON.stringify({
  sessionId: 'local_old', cliSessionId: 'sess-existing', title: 'Old', createdAt: 111,
  lastActivityAt: 222, lastFocusedAt: 222, cwd: '/old', originCwd: '/old',
  workingDirectory: '/old', model: 'm', isArchived: false, extraField: 'keepme',
}, null, 2));
fs.writeFileSync(path.join(PROJ, 'sess-new.jsonl'),
  JSON.stringify({ cwd: '/Users/x/proj', timestamp: '2026-09-01T10:00:00Z', type: 'user', message: { model: 'claude-sonnet-x', content: 'Hello there, build me a thing' } }) + '\n');
fs.writeFileSync(path.join(PROJ, 'sess-existing.jsonl'),
  JSON.stringify({ type: 'user', message: { content: 'already here' } }) + '\n');
fs.writeFileSync(path.join(PROJ, 'sess-empty.jsonl'), '');

test('dry-run preview counts unregistered transcripts and writes nothing', () => {
  const pre = bridge.bridgeInto(APP, { apply: false, projectsDir: PROJROOT });
  assert.equal(pre.ok, true);
  assert.equal(pre.found, 2, 'empty transcript skipped');
  assert.equal(pre.already, 1);
  assert.equal(pre.todo, 1);
  assert.equal(pre.applied, false);
  assert.equal(fs.readdirSync(IDX).filter((f) => /^local_.*json$/.test(f)).length, 1);
});

test('apply registers the new session, backs up, is idempotent', () => {
  const res = bridge.bridgeInto(APP, { apply: true, projectsDir: PROJROOT });
  assert.equal(res.written, 1);
  assert.ok(res.backup && fs.existsSync(path.join(res.backup, 'local_tmpl.json')), 'backup has template');
  const files = fs.readdirSync(IDX).filter((f) => /^local_.*json$/.test(f));
  assert.equal(files.length, 2);
  const neu = files.map((f) => JSON.parse(fs.readFileSync(path.join(IDX, f), 'utf8'))).find((r) => r.cliSessionId === 'sess-new');
  assert.ok(neu, 'new registration present');
  assert.match(neu.sessionId, /^local_/);
  assert.equal(neu.title, 'Hello there, build me a thing');
  assert.equal(neu.isArchived, false);
  assert.equal(neu.cwd, '/Users/x/proj');
  assert.equal(neu.originCwd, '/Users/x/proj');
  assert.equal(neu.workingDirectory, '/Users/x/proj');
  assert.equal(neu.model, 'claude-sonnet-x');
  assert.equal(neu.extraField, 'keepme', 'template schema preserved');

  const again = bridge.bridgeInto(APP, { apply: true, projectsDir: PROJROOT });
  assert.equal(again.written, 0, 'idempotent');
});

test('missing data dir and no-sessions cases return errors, not throws', () => {
  const bad = bridge.bridgeInto(path.join(TMP, 'nope'), { apply: false, projectsDir: PROJROOT });
  assert.equal(bad.ok, false);
  const emptyApp = path.join(TMP, 'EmptyApp');
  fs.mkdirSync(emptyApp, { recursive: true });
  const none = bridge.bridgeInto(emptyApp, { apply: false, projectsDir: PROJROOT });
  assert.equal(none.ok, false);
});
