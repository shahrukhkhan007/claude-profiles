'use strict';
// Node port of claude-session-bridge (MVP): make a profile's Claude desktop
// sidebar show the local Claude Code sessions on this machine.
//
// How Claude stores sessions: the conversation transcripts live (by default) in
// the SHARED ~/.claude/projects/**/*.jsonl and carry NO account tag. What makes
// a session appear in a given account/profile's sidebar is a tiny per-account
// "registration" JSON written under <dataDir>/claude-code-sessions/.../local_*.json.
// This module only ADDS those registration files for transcripts that aren't yet
// registered in the target profile, using an existing registration as the field
// template, and it backs up the target folder first. It never touches transcripts.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const HOME = os.homedir();
const DEFAULT_PROJECTS = path.join(HOME, '.claude', 'projects');
const BACKUP_ROOT = path.join(HOME, '.claude_session_bridge_backups');

function safeIsDir(p) { try { return fs.statSync(p).isDirectory(); } catch (_) { return false; } }
function mtime(p) { try { return fs.statSync(p).mtimeMs; } catch (_) { return 0; } }
function listDirs(dir) { try { return fs.readdirSync(dir).map((n) => path.join(dir, n)).filter(safeIsDir); } catch (_) { return []; } }
function listDirs2(dir) { const out = []; for (const d of listDirs(dir)) out.push(...listDirs(d)); return out; }
function globLocal(dir) { try { return fs.readdirSync(dir).filter((n) => /^local_.*\.json$/.test(n)).map((n) => path.join(dir, n)); } catch (_) { return []; } }
function readJson(file) {
  try { let t = fs.readFileSync(file, 'utf8'); if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1); return JSON.parse(t); } catch (_) { return null; }
}

// Every dir named 'claude-code-sessions*' (up to 3 levels deep) that holds
// local_*.json registrations, or is a leaf dir. Layouts vary by app version.
function findIndexDirs(appSupport) {
  let roots = [];
  try {
    roots = fs.readdirSync(appSupport)
      .filter((n) => n.startsWith('claude-code-sessions'))
      .map((n) => path.join(appSupport, n))
      .filter(safeIsDir)
      .sort();
  } catch (_) { roots = []; }
  const indexDirs = [];
  const seen = new Set();
  for (const root of roots) {
    const candidates = [root, ...listDirs(root), ...listDirs2(root)];
    for (const d of candidates) {
      if (!safeIsDir(d)) continue;
      const hasLocal = globLocal(d).length > 0;
      const hasSubdir = listDirs(d).length > 0;
      if ((hasLocal || !hasSubdir) && !seen.has(d)) { seen.add(d); indexDirs.push(d); }
    }
  }
  return { roots, indexDirs };
}

function currentAccountUuid(appSupport) {
  for (const name of ['config.json', 'Preferences', 'settings.json']) {
    const data = readJson(path.join(appSupport, name));
    if (data && typeof data === 'object') {
      for (const key of ['lastKnownAccountUuid', 'accountUuid', 'activeAccountUuid']) {
        if (data[key]) return { acct: String(data[key]), src: name };
      }
    }
  }
  return { acct: null, src: null };
}

function loadRegistrations(dir) {
  const regs = {};
  for (const f of globLocal(dir)) {
    const data = readJson(f);
    if (!data) continue;
    const cli = data.cliSessionId || data.sessionId;
    if (cli) regs[String(cli)] = f;
  }
  return regs;
}

function existingRegData(dirs) {
  const map = {};
  for (const d of dirs) {
    for (const f of globLocal(d)) {
      const data = readJson(f);
      if (!data) continue;
      const cli = data.cliSessionId || data.sessionId;
      if (!cli || (cli in map)) continue;
      map[String(cli)] = { file: f, lastActivityAt: data.lastActivityAt || 0, title: data.title || '', data };
    }
  }
  return map;
}

function refreshRegistration(file, meta) {
  const cur = readJson(file);
  if (!cur) return false;
  cur.title = meta.title;
  cur.lastActivityAt = meta.lastActivityAt;
  cur.lastFocusedAt = meta.lastActivityAt || cur.lastFocusedAt;
  if (meta.cwd) { cur.cwd = meta.cwd; cur.originCwd = meta.cwd; if ('workingDirectory' in cur) cur.workingDirectory = meta.cwd; }
  if (meta.model) cur.model = meta.model;
  try { fs.writeFileSync(file, JSON.stringify(cur, null, 2), 'utf8'); return true; } catch (_) { return false; }
}

function existingAcross(dirs) {
  const seen = {};
  for (const d of dirs) { const r = loadRegistrations(d); for (const cli of Object.keys(r)) if (!(cli in seen)) seen[cli] = r[cli]; }
  return seen;
}

// Richest existing registration anywhere, used as the field schema template.
function bestTemplate(indexDirs) {
  // Prefer the profile's own sessions; imported copies are only a fallback.
  let best = null;
  let bestImported = null;
  for (const d of indexDirs) {
    for (const f of globLocal(d)) {
      const data = readJson(f);
      if (!data) continue;
      const imported = data.importedBy === 'claude-profiles';
      const cur = imported ? bestImported : best;
      if (cur === null || Object.keys(data).length > Object.keys(cur).length) {
        if (imported) bestImported = data; else best = data;
      }
    }
  }
  return best || bestImported;
}

function cleanUserText(raw) {
  if (!raw) return null;
  let s = String(raw);
  s = s.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, ' ');
  s = s.replace(/<command-[^>]*>[\s\S]*?<\/command-[^>]*>/gi, ' ');
  s = s.replace(/<[^>]+>/g, ' ');
  for (const line of s.split('\n')) { const t = line.trim(); if (t) return t; }
  return null;
}

function extractText(msg) {
  if (!msg || typeof msg !== 'object') return null;
  const c = msg.content;
  if (typeof c === 'string') return cleanUserText(c);
  if (Array.isArray(c)) {
    const parts = c.filter((p) => p && typeof p === 'object' && p.type === 'text').map((p) => p.text || '');
    return cleanUserText(parts.join('\n'));
  }
  return null;
}

function toMs(ts) {
  try {
    if (typeof ts === 'number') return Math.round(ts > 1e12 ? ts : ts * 1000);
    const ms = new Date(String(ts)).getTime();
    return Number.isFinite(ms) ? ms : null;
  } catch (_) { return null; }
}

// Pull title/cwd/model/createdAt from the first lines of a transcript.
function transcriptMeta(jsonlPath, maxLines = 200) {
  let st; try { st = fs.statSync(jsonlPath); } catch (_) { return null; }
  const stem = path.basename(jsonlPath).replace(/\.jsonl$/, '');
  const meta = { cliSessionId: stem, cwd: null, title: null, model: null, createdAt: null, lastActivityAt: Math.round(st.mtimeMs) };
  let content; try { content = fs.readFileSync(jsonlPath, 'utf8'); } catch (_) { return null; }
  const lines = content.split('\n');
  for (let i = 0; i < lines.length && i < maxLines; i++) {
    let line = lines[i].trim(); // trim() also strips a leading BOM
    if (!line) continue;
    let entry; try { entry = JSON.parse(line); } catch (_) { continue; }
    if (meta.cwd === null && entry.cwd) meta.cwd = entry.cwd;
    if (meta.createdAt === null && entry.timestamp) meta.createdAt = toMs(entry.timestamp);
    const msg = (entry.message && typeof entry.message === 'object') ? entry.message : {};
    if (meta.model === null && msg.model) meta.model = msg.model;
    if (meta.title === null && entry.type === 'user') { const text = extractText(msg); if (text) meta.title = text.slice(0, 70); }
    if (meta.cwd !== null && meta.title !== null && meta.model !== null && meta.createdAt !== null) break;
  }
  if (meta.createdAt === null) meta.createdAt = Math.round(st.ctimeMs || st.mtimeMs);
  // The name Claude shows in its sidebar is stored in the transcript as a
  // `custom-title` entry (rewritten on every rename, so the LAST one wins). The
  // first user message is only a fallback for transcripts that have no name.
  const named = sessionName(lines);
  meta.firstMessage = meta.title;
  if (named) meta.title = named.slice(0, 120);
  meta.named = !!named;
  if (!meta.title) meta.title = `Recovered session ${stem.slice(0, 8)}`;
  return meta;
}

// Last session name recorded in a transcript: `custom-title` (Claude desktop /
// `/rename`), then `agent-name`, then legacy `summary` entries.
function sessionName(lines) {
  const found = { 'custom-title': null, 'agent-name': null, summary: null };
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (!l || (l.indexOf('custom-title') < 0 && l.indexOf('agent-name') < 0 && l.indexOf('"summary"') < 0)) continue;
    let e; try { e = JSON.parse(l.trim()); } catch (_) { continue; }
    if (!e || !(e.type in found) || found[e.type]) continue;
    const v = e.type === 'custom-title' ? e.customTitle : e.type === 'agent-name' ? e.agentName : e.summary;
    if (typeof v === 'string' && v.trim()) found[e.type] = v.trim();
    if (found['custom-title']) break;
  }
  return found['custom-title'] || found['agent-name'] || found.summary || null;
}

// Keys that describe ONE session's own state and history (its parent link, PRs,
// branches, worktree, turn bookkeeping…). They must never be copied from a
// template session onto a different session — doing so made imported sessions
// claim another session's parent, PRs and branches.
const SESSION_KEYS = new Set([
  'spawnedFrom', 'forkedFromSessionId', 'btwLoweredFrom', 'devIntents', 'devIntentTriggers',
  'sideSessionStartsSinceUserMessage', 'sideSessionReportOwed', 'sideSessionNotes', 'priorErrorMark',
  'scratchFilesLeftIn', 'scratchPromptRecents', 'lastTurnStopped', 'lastTurnCutShort', 'lastTurnReport',
  'lastTurnEdgeAt', 'lastAssistantUuid', 'lastAssistantCliSessionId', 'latestUserFrameAt', 'writtenBranches',
  'writtenRepositories', 'resolvedBackgroundTaskSuggestions', 'autoFixNoticeSent', 'setupTools',
  'publishedArtifacts', 'priorCliSessionIds', 'priorCliSessionLeftAt', 'rewindEdges', 'transcriptModelStates',
  'worktreePath', 'worktreeName', 'sourceBranch', 'branch', 'startChain', 'gitAnchors', 'gitAnchorsLookupOnly',
  'gitAnchorsFolderRealpath', 'peerReceipts', 'peerMessaged', 'prs', 'folderPlace', 'titleTurn', 'indexedAt',
  'pendingSystemReminder', 'turnWrapUp', 'shellFolders', 'postTurnSummary', 'postTurnSummaryFor',
  'completedTurns', 'toolSurfaceSnapshot', 'promptAppendSnapshot', 'interruptedAwaitingPerson', 'importedBy',
]);
// Per-session "always allow" permission grants. Always start empty on import:
// a grant the user gave in one session must never silently apply elsewhere.
const GRANT_KEYS = { alwaysAllowedReasons: [], sessionPermissionUpdates: [] };
// Bound to the account/workspace (connectors, environments): take these from
// the target profile's own sessions, not from another account.
const ACCOUNT_KEYS = ['enabledMcpTools', 'remoteMcpServersConfig', 'startedFromEnvironmentId', 'envScopeId', 'autoChosenInApp'];
const IMPORTED_BY = 'claude-profiles';

const clone = (o) => JSON.parse(JSON.stringify(o));

// The registrations other Claude data dirs (main Claude + other profiles) hold
// for each session, so an import can reproduce the session exactly: same
// internal id (keeps parent/child links working), same name and metadata.
// Also collects transcript ids that are only EARLIER SEGMENTS of a session
// (Claude starts a new transcript after a rewind/compaction and lists the old
// ones in priorCliSessionIds); those must not be imported as separate sessions.
function sourceRegistrations(dataDirs) {
  const byCli = {};
  const bySessionId = {};
  const priorOf = {}; // prior cli -> owning cli
  for (const dir of dataDirs || []) {
    if (!dir || !safeIsDir(dir)) continue;
    for (const d of findIndexDirs(dir).indexDirs) {
      for (const f of globLocal(d)) {
        const data = readJson(f);
        const cli = data && data.cliSessionId;
        if (!cli || data.importedBy === IMPORTED_BY) continue; // only original sessions are sources
        // First data dir wins (callers list main Claude first): that's the original,
        // not a copy another profile got from an older import.
        if (!byCli[cli]) byCli[cli] = data;
      }
    }
  }
  for (const [cli, data] of Object.entries(byCli)) {
    if (data.sessionId) bySessionId[data.sessionId] = cli;
    for (const p of data.priorCliSessionIds || []) priorOf[String(p)] = cli;
  }
  return { byCli, bySessionId, priorOf };
}

// Titles other Claude data dirs already show for each session, keyed by cliSessionId.
function titleHints(dataDirs) {
  const { byCli } = sourceRegistrations(dataDirs);
  const map = {};
  for (const [cli, data] of Object.entries(byCli)) if (data.title) map[cli] = String(data.title);
  return map;
}

function hintsFrom(opts) {
  if (opts.titleHints) return opts.titleHints;
  const map = {};
  for (const [cli, data] of Object.entries((opts.sources && opts.sources.byCli) || {})) if (data.title) map[cli] = String(data.title);
  return map;
}

// The parent session's transcript id, when this session was started from another.
function parentCliOf(source, sources) {
  const sid = source && source.spawnedFrom && source.spawnedFrom.sessionId;
  return (sid && sources && sources.bySessionId[sid]) || null;
}

// Final title: transcript name > another profile's sidebar name > first message.
function resolveTitle(meta, hints) {
  if (meta.named) return meta.title;
  const h = hints && hints[meta.cliSessionId];
  return h || meta.title;
}

function buildRegistration(template, meta, source) {
  const nowMs = Date.now();
  let reg;
  if (source) {
    // Reproduce the original session (same id, parent link, metadata)…
    reg = clone(source);
    // …but with this account's connectors/environment, not the source account's.
    for (const k of ACCOUNT_KEYS) {
      if (template && k in template) reg[k] = clone(template[k]);
      else delete reg[k];
    }
  } else {
    reg = template ? clone(template) : {};
    for (const k of Object.keys(reg)) if (SESSION_KEYS.has(k)) delete reg[k];
    reg.sessionId = `local_${crypto.randomUUID()}`;
  }
  for (const [k, v] of Object.entries(GRANT_KEYS)) if (k in reg || !source) reg[k] = clone(v);
  reg.cliSessionId = meta.cliSessionId;
  reg.title = meta.title;
  reg.createdAt = (source && source.createdAt) || meta.createdAt;
  reg.lastActivityAt = Math.max((source && source.lastActivityAt) || 0, meta.lastActivityAt || 0);
  reg.lastFocusedAt = reg.lastActivityAt || nowMs;
  reg.isArchived = false; // the user explicitly picked it
  const cwd = (source && source.cwd) || meta.cwd || HOME; // never borrow the template's cwd
  reg.cwd = cwd;
  reg.originCwd = (source && source.originCwd) || cwd;
  if ('workingDirectory' in reg) reg.workingDirectory = cwd;
  if (meta.model && !source) reg.model = meta.model;
  reg.importedBy = IMPORTED_BY;
  return reg;
}

// An existing registration needs repair when it came from an older import that
// gave the session a new random id (breaking parent/child nesting).
function needsRepair(existingEntry, source) {
  if (!existingEntry || !source || !existingEntry.data) return false;
  const cur = existingEntry.data;
  if (cur.sessionId === source.sessionId) return false;
  // Same transcript under a different id can only be a copy, never a native session.
  return true;
}

function scanTranscripts(projectsDir, filter) {
  if (!safeIsDir(projectsDir)) return { error: `No transcripts folder at ${projectsDir}.`, list: [] };
  const found = [];
  for (const proj of listDirs(projectsDir)) {
    const name = path.basename(proj);
    if (filter && !name.toLowerCase().includes(String(filter).toLowerCase())) continue;
    let files; try { files = fs.readdirSync(proj).filter((n) => n.endsWith('.jsonl')).sort(); } catch (_) { files = []; }
    for (const fn of files) {
      const fp = path.join(proj, fn);
      try { if (fs.statSync(fp).size === 0) continue; } catch (_) { continue; }
      found.push(fp);
    }
  }
  return { error: null, list: found };
}

function stamp() {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function backup(indexDir) {
  const dest = path.join(BACKUP_ROOT, stamp(), path.basename(indexDir));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(indexDir, dest, { recursive: true });
  return dest;
}

// Pick the workspace folder to write into: prefer the current account's folder
// with the most registrations (ties -> newest); else the newest folder that has
// any registrations (needed as a template source).
function pickTarget(acct, indexDirs) {
  let acctDirs = indexDirs.filter((d) => acct && d.includes(acct));
  if (acctDirs.length) {
    const target = acctDirs.reduce((a, b) => {
      const na = globLocal(a).length, nb = globLocal(b).length;
      if (nb !== na) return nb > na ? b : a;
      return mtime(b) > mtime(a) ? b : a;
    });
    return { target, acctDirs };
  }
  const withRegs = indexDirs.filter((d) => globLocal(d).length > 0);
  if (!withRegs.length) return { target: null, acctDirs: [] };
  const target = withRegs.reduce((a, b) => (mtime(b) > mtime(a) ? b : a));
  return { target, acctDirs: [target] };
}

// Main entry. appSupport = a profile's data dir. Returns a plain result object.
// opts: { apply, projectsDir, filter }
function bridgeInto(appSupport, opts = {}) {
  const projectsDir = opts.projectsDir || DEFAULT_PROJECTS;
  const apply = !!opts.apply;
  const filter = opts.filter || null;
  if (!safeIsDir(appSupport)) return { ok: false, error: `Data folder does not exist: ${appSupport}` };

  const { acct } = currentAccountUuid(appSupport);
  const { roots, indexDirs } = findIndexDirs(appSupport);
  if (!roots.length) {
    return { ok: false, error: "This profile has no Claude Code sessions folder yet. Launch it once, start any session, quit it, then try again." };
  }
  const { target, acctDirs } = pickTarget(acct, indexDirs);
  if (!target) {
    return { ok: false, error: "No existing registration to use as a template. Start one session in this profile under the current account first, then try again." };
  }

  const template = bestTemplate(indexDirs);
  const existing = existingRegData(acctDirs);
  const scan = scanTranscripts(projectsDir, filter);
  if (scan.error) return { ok: false, error: scan.error };

  const sources = opts.sources || { byCli: {}, bySessionId: {}, priorOf: {} };
  const ownPriors = {};
  for (const [cli, e] of Object.entries(existing)) for (const p of (e.data && e.data.priorCliSessionIds) || []) ownPriors[String(p)] = cli;
  const isPrior = (c) => !!(sources.priorOf[c] || ownPriors[c]);
  const hints = hintsFrom(opts);

  const byCli = {};
  for (const t of scan.list) {
    const c = path.basename(t).replace(/\.jsonl$/, '');
    if (!isPrior(c)) byCli[c] = t; // earlier segments belong to another session
  }
  const allCli = Object.keys(byCli);
  const unregistered = allCli.filter((c) => !(c in existing));
  const only = Array.isArray(opts.only) && opts.only.length ? new Set(opts.only.map(String)) : null;
  // A child session only nests if its parent is there too: bring parents along.
  if (only) {
    for (const c of [...only]) {
      let p = parentCliOf(sources.byCli[c], sources);
      while (p && byCli[p] && !only.has(p)) {
        if (!(p in existing) || needsRepair(existing[p], sources.byCli[p])) only.add(p);
        p = parentCliOf(sources.byCli[p], sources);
      }
    }
  }
  const newCli = only ? [...only].filter((c) => byCli[c] && !(c in existing)) : unregistered;
  const refreshCli = only ? [...only].filter((c) => byCli[c] && (c in existing)) : [];
  const base = { ok: true, target, projectsDir, found: allCli.length, already: allCli.length - unregistered.length, todo: unregistered.length, selectedNew: newCli.length, selectedRefresh: refreshCli.length };

  if (!apply) return { ...base, applied: false };
  if (!newCli.length && !refreshCli.length) return { ...base, applied: true, written: 0, refreshed: 0, repaired: 0, removedDuplicates: 0 };

  const backupPath = backup(target);
  let written = 0;
  let refreshed = 0;
  let repaired = 0;
  let removedDuplicates = 0;
  const errors = [];
  const writeReg = (reg) => fs.writeFileSync(path.join(target, `${reg.sessionId}.json`), JSON.stringify(reg, null, 2), 'utf8');
  const touched = new Set();
  for (const c of newCli) {
    const meta = transcriptMeta(byCli[c]);
    if (!meta) continue;
    meta.title = resolveTitle(meta, hints);
    const reg = buildRegistration(template, meta, sources.byCli[c]);
    try { writeReg(reg); written++; touched.add(c); } catch (_) {}
  }
  for (const c of refreshCli) {
    const meta = transcriptMeta(byCli[c]);
    if (!meta) continue;
    meta.title = resolveTitle(meta, hints);
    const src = sources.byCli[c];
    if (needsRepair(existing[c], src)) {
      // Rewrite with the original id so parent/child links resolve; drop the old copy.
      try {
        writeReg(buildRegistration(template, meta, src));
        if (path.basename(existing[c].file) !== `${src.sessionId}.json`) fs.unlinkSync(existing[c].file);
        refreshed++; repaired++; touched.add(c);
      } catch (e) { errors.push(String((e && e.message) || e)); }
    } else if (refreshRegistration(existing[c].file, meta)) { refreshed++; touched.add(c); }
  }
  // Older imports registered earlier transcript segments as separate sessions
  // (the duplicates). Remove those copies for every session handled now.
  for (const [cli, e] of Object.entries(existing)) {
    const owner = sources.priorOf[cli] || ownPriors[cli];
    // Claude never registers an earlier segment on its own, so such an entry is always a leftover copy.
    if (!owner || !touched.has(owner)) continue;
    try { fs.unlinkSync(e.file); removedDuplicates++; } catch (_) {}
  }
  return { ...base, applied: true, written, refreshed, repaired, removedDuplicates, errors, backup: backupPath };
}

function listSessions(appSupport, opts = {}) {
  const projectsDir = opts.projectsDir || DEFAULT_PROJECTS;
  if (!safeIsDir(appSupport)) return { ok: false, error: `Data folder does not exist: ${appSupport}` };
  const { acct } = currentAccountUuid(appSupport);
  const { roots, indexDirs } = findIndexDirs(appSupport);
  const { target, acctDirs } = pickTarget(acct, indexDirs);
  const existing = acctDirs.length ? existingRegData(acctDirs) : {};
  const scan = scanTranscripts(projectsDir, opts.filter || null);
  if (scan.error) return { ok: false, error: scan.error };
  const sources = opts.sources || { byCli: {}, bySessionId: {}, priorOf: {} };
  const ownPriors = {};
  for (const [cli, e] of Object.entries(existing)) for (const p of (e.data && e.data.priorCliSessionIds) || []) ownPriors[String(p)] = cli;
  const hints = hintsFrom(opts);
  // Registered copies of earlier transcript segments (duplicates from older imports), per owner.
  const dupesOf = {};
  for (const cli of Object.keys(existing)) {
    const owner = sources.priorOf[cli] || ownPriors[cli];
    if (owner) dupesOf[owner] = (dupesOf[owner] || 0) + 1;
  }
  const sessions = [];
  for (const t of scan.list) {
    const cli = path.basename(t).replace(/\.jsonl$/, '');
    if (sources.priorOf[cli] || ownPriors[cli]) continue; // part of another session
    const meta = transcriptMeta(t);
    if (!meta) continue;
    meta.title = resolveTitle(meta, hints);
    const reg = existing[meta.cliSessionId];
    const src = sources.byCli[meta.cliSessionId];
    const registered = !!reg;
    // Stale = newer activity, renamed since import, imported with a broken id, or has duplicate copies.
    const renamed = registered && meta.named && reg.title && reg.title !== meta.title;
    const repair = registered && needsRepair(reg, src);
    const dupes = dupesOf[meta.cliSessionId] || 0;
    const stale = registered && (repair || dupes > 0 || renamed || (meta.lastActivityAt || 0) > (reg.lastActivityAt || 0) + 2000);
    sessions.push({
      cliSessionId: meta.cliSessionId,
      title: meta.title,
      project: path.basename(path.dirname(t)),
      cwd: meta.cwd || null,
      firstMessage: meta.firstMessage || null,
      lastActivityAt: meta.lastActivityAt,
      createdAt: meta.createdAt,
      parentCli: parentCliOf(src, sources),
      registered,
      repair: repair || dupes > 0,
      duplicates: dupes,
      status: registered ? (stale ? 'stale' : 'current') : 'new',
    });
  }
  // Drop parent links to sessions that aren't in the list.
  const present = new Set(sessions.map((x) => x.cliSessionId));
  for (const x of sessions) if (x.parentCli && !present.has(x.parentCli)) x.parentCli = null;
  sessions.sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0));
  return { ok: true, hasIndex: roots.length > 0, canImport: !!target, count: sessions.length, sessions };
}

module.exports = {
  bridgeInto, DEFAULT_PROJECTS, BACKUP_ROOT,
  findIndexDirs, currentAccountUuid, bestTemplate, transcriptMeta, listSessions,
  buildRegistration, scanTranscripts, pickTarget, sessionName, titleHints, resolveTitle, sourceRegistrations,
  SESSION_KEYS, GRANT_KEYS,
};
