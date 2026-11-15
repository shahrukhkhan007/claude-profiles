import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Regression: imported sessions must keep the name Claude shows for them
// (the transcript's last `custom-title`), not the first user message.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-titles-'));
process.env.HOME = TMP;
process.env.USERPROFILE = TMP;
const here = path.dirname(fileURLToPath(import.meta.url));
const bridge = await import(pathToFileURL(path.join(here, '..', 'engine', 'bridge.js')).href);

const APP = path.join(TMP, 'Target');
const IDX = path.join(APP, 'claude-code-sessions', 'ACCT', 'ORG');
const OTHER = path.join(TMP, 'Other');
const OIDX = path.join(OTHER, 'claude-code-sessions', 'A2', 'O2');
const ROOT = path.join(TMP, '.claude', 'projects');
const PROJ = path.join(ROOT, 'p');
for (const d of [IDX, OIDX, PROJ]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(APP, 'config.json'), JSON.stringify({ lastKnownAccountUuid: 'ACCT' }));
fs.writeFileSync(path.join(IDX, 'local_t.json'), JSON.stringify({ sessionId: 'local_t', cliSessionId: 'tmpl', title: 'T', cwd: '/x', isArchived: false }));
const L = (o) => JSON.stringify(o) + '\n';
fs.writeFileSync(path.join(PROJ, 'named.jsonl'),
  L({ type: 'user', cwd: '/w', message: { content: 'please look at the approvals module' } }) +
  L({ type: 'custom-title', customTitle: 'Old name', sessionId: 'named' }) +
  L({ type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }] } }) +
  L({ type: 'custom-title', customTitle: 'Approval engine', sessionId: 'named' }));
fs.writeFileSync(path.join(PROJ, 'hinted.jsonl'), L({ type: 'user', message: { content: 'first prompt text' } }));
fs.writeFileSync(path.join(PROJ, 'plain.jsonl'), L({ type: 'user', message: { content: 'just a prompt' } }));
fs.writeFileSync(path.join(OIDX, 'local_h.json'), JSON.stringify({ sessionId: 'local_h', cliSessionId: 'hinted', title: 'Renamed in main', lastActivityAt: 5 }));

const regs = () => Object.fromEntries(fs.readdirSync(IDX).map((f) => JSON.parse(fs.readFileSync(path.join(IDX, f), 'utf8'))).map((r) => [r.cliSessionId, r]));

test('sessionName returns the last custom-title', () => {
  const lines = fs.readFileSync(path.join(PROJ, 'named.jsonl'), 'utf8').split('\n');
  assert.equal(bridge.sessionName(lines), 'Approval engine');
});

test('list + import keep original names (transcript > other profile > first message)', () => {
  const hints = bridge.titleHints([OTHER]);
  assert.equal(hints.hinted, 'Renamed in main');
  const list = bridge.listSessions(APP, { projectsDir: ROOT, titleHints: hints });
  const byId = Object.fromEntries(list.sessions.map((s) => [s.cliSessionId, s]));
  assert.equal(byId.named.title, 'Approval engine');
  assert.equal(byId.hinted.title, 'Renamed in main');
  assert.equal(byId.plain.title, 'just a prompt');
  const r = bridge.bridgeInto(APP, { apply: true, projectsDir: ROOT, titleHints: hints });
  assert.equal(r.written, 3);
  const g = regs();
  assert.equal(g.named.title, 'Approval engine');
  assert.equal(g.hinted.title, 'Renamed in main');
  assert.equal(g.plain.title, 'just a prompt');
});

test('a rename after import shows as an update and refresh applies it', () => {
  fs.appendFileSync(path.join(PROJ, 'named.jsonl'), L({ type: 'custom-title', customTitle: 'Approval engine v2', sessionId: 'named' }));
  const list = bridge.listSessions(APP, { projectsDir: ROOT });
  assert.equal(list.sessions.find((s) => s.cliSessionId === 'named').status, 'stale');
  bridge.bridgeInto(APP, { apply: true, projectsDir: ROOT, only: ['named'] });
  assert.equal(regs().named.title, 'Approval engine v2');
});
