import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-stale-'));
process.env.HOME = TMP;
process.env.USERPROFILE = TMP;
const here = path.dirname(fileURLToPath(import.meta.url));
const bridge = await import(pathToFileURL(path.join(here, '..', 'engine', 'bridge.js')).href);

const APP = path.join(TMP, 'Library', 'Application Support', 'Claude-T');
const IDX = path.join(APP, 'claude-code-sessions', 'ACCT1', 'ORG1');
const PROJROOT = path.join(TMP, '.claude', 'projects');
const PROJ = path.join(PROJROOT, 'proj1');
fs.mkdirSync(IDX, { recursive: true });
fs.mkdirSync(PROJ, { recursive: true });
fs.writeFileSync(path.join(APP, 'config.json'), JSON.stringify({ lastKnownAccountUuid: 'ACCT1' }));
fs.writeFileSync(path.join(PROJ, 'sess-stale.jsonl'), JSON.stringify({ type: 'user', message: { content: 'New title for stale' } }) + '\n');
fs.writeFileSync(path.join(PROJ, 'sess-cur.jsonl'), JSON.stringify({ type: 'user', message: { content: 'Current' } }) + '\n');
fs.writeFileSync(path.join(PROJ, 'sess-new.jsonl'), JSON.stringify({ type: 'user', message: { content: 'New' } }) + '\n');
// stale registration: ancient lastActivityAt
fs.writeFileSync(path.join(IDX, 'local_stale.json'), JSON.stringify({ sessionId: 'local_s', cliSessionId: 'sess-stale', title: 'OLD', lastActivityAt: 1000, lastFocusedAt: 1000, cwd: '/x', isArchived: false }));
// current registration: lastActivityAt matches transcript mtime
const m = Math.round(fs.statSync(path.join(PROJ, 'sess-cur.jsonl')).mtimeMs);
fs.writeFileSync(path.join(IDX, 'local_cur.json'), JSON.stringify({ sessionId: 'local_c', cliSessionId: 'sess-cur', title: 'Current', lastActivityAt: m, lastFocusedAt: m, cwd: '/x', isArchived: false }));

test('listSessions classifies new / stale / current', () => {
  const L = bridge.listSessions(APP, { projectsDir: PROJROOT });
  const by = Object.fromEntries(L.sessions.map((s) => [s.cliSessionId, s.status]));
  assert.equal(by['sess-new'], 'new');
  assert.equal(by['sess-stale'], 'stale');
  assert.equal(by['sess-cur'], 'current');
});

test('refresh updates a stale registration in place, not a new file', () => {
  const r = bridge.bridgeInto(APP, { apply: true, projectsDir: PROJROOT, only: ['sess-stale'] });
  assert.equal(r.refreshed, 1);
  assert.equal(r.written, 0);
  const upd = JSON.parse(fs.readFileSync(path.join(IDX, 'local_stale.json'), 'utf8'));
  assert.equal(upd.title, 'New title for stale');
  assert.ok(upd.lastActivityAt > 1000);
  const L = bridge.listSessions(APP, { projectsDir: PROJROOT });
  assert.equal(Object.fromEntries(L.sessions.map((s) => [s.cliSessionId, s.status]))['sess-stale'], 'current');
});
