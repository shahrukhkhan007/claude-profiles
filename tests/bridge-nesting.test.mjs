import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Regressions from v0.3.0 feedback: child sessions showed flat, sessions with
// rewinds showed up several times, and template fields (parent link, PRs,
// permission grants) leaked onto unrelated imported sessions.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-nest-'));
process.env.HOME = TMP;
process.env.USERPROFILE = TMP;
const here = path.dirname(fileURLToPath(import.meta.url));
const bridge = await import(pathToFileURL(path.join(here, '..', 'engine', 'bridge.js')).href);

const MAIN = path.join(TMP, 'Main');
const MIDX = path.join(MAIN, 'claude-code-sessions', 'A1', 'O1');
const PROF = path.join(TMP, 'Profile');
const PIDX = path.join(PROF, 'claude-code-sessions', 'A2', 'O2');
const ROOT = path.join(TMP, '.claude', 'projects');
const PROJ = path.join(ROOT, 'proj');
for (const d of [MIDX, PIDX, PROJ]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(PROF, 'config.json'), JSON.stringify({ lastKnownAccountUuid: 'A2' }));
const W = (dir, name, obj) => fs.writeFileSync(path.join(dir, name), JSON.stringify(obj, null, 2));
const L = (o) => JSON.stringify(o) + '\n';
const T = (cli, title) => fs.writeFileSync(path.join(PROJ, cli + '.jsonl'), L({ type: 'user', cwd: '/w', message: { content: 'hi ' + cli } }) + L({ type: 'custom-title', customTitle: title }));

// Main Claude: a parent session (rewound twice → two earlier transcript segments) and its child.
W(MIDX, 'local_parent.json', { sessionId: 'local_parent', cliSessionId: 'p-now', title: 'Approval engine', cwd: '/w', priorCliSessionIds: ['p-old1', 'p-old2'], lastActivityAt: 10, alwaysAllowedReasons: ['x'], sessionPermissionUpdates: [{ allow: 'Bash(rm:*)' }], enabledMcpTools: ['main-account-tool'] });
W(MIDX, 'local_child.json', { sessionId: 'local_child', cliSessionId: 'c-now', title: 'Fix timesheets', cwd: '/w', spawnedFrom: { sessionId: 'local_parent', taskId: 't1' }, prs: [{ n: 596 }], lastActivityAt: 20 });
for (const [c, t] of [['p-now', 'Approval engine'], ['p-old1', 'Approval engine'], ['p-old2', 'Approval engine'], ['c-now', 'Fix timesheets'], ['plain', 'Plain one']]) T(c, t);
// Target profile: its own session is the template; it carries per-session state that must not leak.
W(PIDX, 'local_own.json', { sessionId: 'local_own', cliSessionId: 'own', title: 'Own', cwd: '/o', spawnedFrom: { sessionId: 'local_zzz' }, prs: [{ n: 1 }], branch: 'feat/x', sessionPermissionUpdates: [{ allow: 'Bash(*)' }], enabledMcpTools: ['profile-tool'], extraField: 'keep' });

const sources = () => bridge.sourceRegistrations([MAIN]); // like index.js: other dirs only
const regs = () => Object.fromEntries(fs.readdirSync(PIDX).map((f) => JSON.parse(fs.readFileSync(path.join(PIDX, f), 'utf8'))).map((r) => [r.cliSessionId, r]));

test('earlier transcript segments are not listed as separate sessions; children know their parent', () => {
  const list = bridge.listSessions(PROF, { projectsDir: ROOT, sources: sources() });
  const ids = list.sessions.map((s) => s.cliSessionId).sort();
  assert.deepEqual(ids, ['c-now', 'own', 'p-now', 'plain'].filter((c) => c !== 'own' || fs.existsSync(path.join(PROJ, 'own.jsonl'))).sort());
  assert.equal(list.sessions.find((s) => s.cliSessionId === 'c-now').parentCli, 'p-now');
});

test('importing a child brings its parent and keeps the original ids so it nests', () => {
  const r = bridge.bridgeInto(PROF, { apply: true, projectsDir: ROOT, sources: sources(), only: ['c-now'] });
  assert.equal(r.written, 2, 'child + auto-included parent');
  const g = regs();
  assert.equal(g['p-now'].sessionId, 'local_parent');
  assert.equal(g['c-now'].sessionId, 'local_child');
  assert.equal(g['c-now'].spawnedFrom.sessionId, 'local_parent', 'parent link intact');
  assert.deepEqual(g['c-now'].prs, [{ n: 596 }], 'its own PRs kept');
  assert.equal(g['p-now'].title, 'Approval engine');
});

test('permission grants never carry over; connectors come from the target account', () => {
  const g = regs();
  assert.deepEqual(g['p-now'].sessionPermissionUpdates, []);
  assert.deepEqual(g['p-now'].alwaysAllowedReasons, []);
  assert.deepEqual(g['p-now'].enabledMcpTools, ['profile-tool']);
});

test('template-built sessions do not inherit another session\'s parent, PRs, branch or grants', () => {
  bridge.bridgeInto(PROF, { apply: true, projectsDir: ROOT, sources: sources(), only: ['plain'] });
  const p = regs().plain;
  assert.equal(p.spawnedFrom, undefined);
  assert.equal(p.prs, undefined);
  assert.equal(p.branch, undefined);
  assert.deepEqual(p.sessionPermissionUpdates, []);
  assert.equal(p.extraField, 'keep', 'unknown non-session fields still follow the template');
  assert.notEqual(p.sessionId, 'local_own');
});

test('older broken imports (random ids + duplicate segments) are flagged and repaired', () => {
  // Simulate a v0.3.0 import: parent under a random id, plus an earlier segment registered on its own.
  for (const f of fs.readdirSync(PIDX)) { const r = JSON.parse(fs.readFileSync(path.join(PIDX, f), 'utf8')); if (['p-now', 'c-now'].includes(r.cliSessionId)) fs.unlinkSync(path.join(PIDX, f)); }
  W(PIDX, 'local_rand1.json', { sessionId: 'local_rand1', cliSessionId: 'p-now', title: 'Approval engine', lastActivityAt: 99 });
  W(PIDX, 'local_rand2.json', { sessionId: 'local_rand2', cliSessionId: 'p-old1', title: 'Approval engine', lastActivityAt: 99 });
  const list = bridge.listSessions(PROF, { projectsDir: ROOT, sources: sources() });
  const p = list.sessions.find((s) => s.cliSessionId === 'p-now');
  assert.equal(p.status, 'stale');
  assert.equal(p.repair, true);
  assert.equal(p.duplicates, 1);
  const r = bridge.bridgeInto(PROF, { apply: true, projectsDir: ROOT, sources: sources(), only: ['p-now'] });
  assert.deepEqual(r.errors, []); assert.equal(r.repaired, 1);
  assert.equal(r.removedDuplicates, 1);
  const g = regs();
  assert.equal(g['p-now'].sessionId, 'local_parent');
  assert.equal(g['p-old1'], undefined, 'duplicate segment removed');
  assert.ok(fs.existsSync(path.join(r.backup, 'local_rand2.json')), 'backed up before removal');
  assert.equal(bridge.listSessions(PROF, { projectsDir: ROOT, sources: sources() }).sessions.find((s) => s.cliSessionId === 'p-now').status, 'current');
});
