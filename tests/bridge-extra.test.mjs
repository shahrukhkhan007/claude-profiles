import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-extra-'));
process.env.HOME = TMP;
process.env.USERPROFILE = TMP;
process.env.CP_TEST = '1';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => import(pathToFileURL(path.join(here, '..', 'engine', f)).href);
const bridge = await load('bridge.js');
const engine = await load('index.js');
const store = await load('instances.js');

// fixtures for bridge listing / selective import
const APP = path.join(TMP, 'Library', 'Application Support', 'Claude-X');
const IDX = path.join(APP, 'claude-code-sessions', 'ACCT1', 'ORG1');
const PROJROOT = path.join(TMP, '.claude', 'projects');
const PROJ = path.join(PROJROOT, 'proj1');
fs.mkdirSync(IDX, { recursive: true });
fs.mkdirSync(PROJ, { recursive: true });
fs.writeFileSync(path.join(APP, 'config.json'), JSON.stringify({ lastKnownAccountUuid: 'ACCT1' }));
fs.writeFileSync(path.join(IDX, 'local_tmpl.json'), JSON.stringify({ sessionId: 'local_old', cliSessionId: 'sess-x', title: 'X', cwd: '/o', isArchived: false }));
fs.writeFileSync(path.join(PROJ, 'sess-x.jsonl'), JSON.stringify({ type: 'user', message: { content: 'x' } }) + '\n');
fs.writeFileSync(path.join(PROJ, 'sess-a.jsonl'), JSON.stringify({ cwd: '/a', type: 'user', message: { content: 'Alpha task' } }) + '\n');
fs.writeFileSync(path.join(PROJ, 'sess-b.jsonl'), JSON.stringify({ cwd: '/b', type: 'user', message: { content: 'Beta task' } }) + '\n');

test('listSessions marks registered and lists all', () => {
  const L = bridge.listSessions(APP, { projectsDir: PROJROOT });
  assert.equal(L.ok, true);
  assert.equal(L.count, 3);
  const byId = Object.fromEntries(L.sessions.map((s) => [s.cliSessionId, s]));
  assert.equal(byId['sess-x'].registered, true);
  assert.equal(byId['sess-a'].registered, false);
  assert.equal(byId['sess-a'].title, 'Alpha task');
  assert.equal(byId['sess-a'].project, 'proj1');
});

test('selective import writes only the chosen sessions', () => {
  const r = bridge.bridgeInto(APP, { apply: true, projectsDir: PROJROOT, only: ['sess-a'] });
  assert.equal(r.written, 1);
  const regs = fs.readdirSync(IDX).filter((f) => /^local_.*json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(IDX, f), 'utf8')));
  assert.ok(regs.some((x) => x.cliSessionId === 'sess-a'), 'sess-a imported');
  assert.ok(!regs.some((x) => x.cliSessionId === 'sess-b'), 'sess-b not imported');
});

test('archive then restore flips the archived flag (simple profile)', () => {
  const inst = store.add({ name: 'ArchMe', mode: 'simple', color: 'blue' });
  engine.archiveInstance(inst.id);
  let got = store.get(inst.id);
  assert.equal(got.archived, true);
  assert.ok(got.archivedAt);
  engine.restoreInstance(inst.id);
  got = store.get(inst.id);
  assert.equal(got.archived, false);
});
