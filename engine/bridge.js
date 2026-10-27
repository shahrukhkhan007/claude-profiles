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
      map[String(cli)] = { file: f, lastActivityAt: data.lastActivityAt || 0, title: data.title || '' };
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
  let best = null;
  for (const d of indexDirs) {
    for (const f of globLocal(d)) {
      const data = readJson(f);
      if (!data) continue;
      if (best === null || Object.keys(data).length > Object.keys(best).length) best = data;
    }
  }
  return best;
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
  if (!meta.title) meta.title = `Recovered session ${stem.slice(0, 8)}`;
  return meta;
}

function buildRegistration(template, meta) {
  const reg = template ? JSON.parse(JSON.stringify(template)) : {};
  const nowMs = Date.now();
  reg.sessionId = `local_${crypto.randomUUID()}`;
  reg.cliSessionId = meta.cliSessionId;
  reg.title = meta.title;
  reg.createdAt = meta.createdAt;
  reg.lastActivityAt = meta.lastActivityAt;
  reg.lastFocusedAt = meta.lastActivityAt || nowMs;
  reg.isArchived = false;
  const cwd = meta.cwd || HOME; // never borrow the template's cwd
  reg.cwd = cwd;
  reg.originCwd = cwd;
  if ('workingDirectory' in reg) reg.workingDirectory = cwd;
  if (meta.model) reg.model = meta.model;
  return reg;
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

  const byCli = {};
  for (const t of scan.list) byCli[path.basename(t).replace(/\.jsonl$/, '')] = t;
  const allCli = Object.keys(byCli);
  const unregistered = allCli.filter((c) => !(c in existing));
  const only = Array.isArray(opts.only) && opts.only.length ? new Set(opts.only.map(String)) : null;
  const newCli = only ? [...only].filter((c) => byCli[c] && !(c in existing)) : unregistered;
  const refreshCli = only ? [...only].filter((c) => byCli[c] && (c in existing)) : [];
  const base = { ok: true, target, projectsDir, found: scan.list.length, already: allCli.length - unregistered.length, todo: unregistered.length, selectedNew: newCli.length, selectedRefresh: refreshCli.length };

  if (!apply) return { ...base, applied: false };
  if (!newCli.length && !refreshCli.length) return { ...base, applied: true, written: 0, refreshed: 0 };

  const backupPath = backup(target);
  let written = 0;
  let refreshed = 0;
  for (const c of newCli) {
    const meta = transcriptMeta(byCli[c]);
    if (!meta) continue;
    const reg = buildRegistration(template, meta);
    try { fs.writeFileSync(path.join(target, `${reg.sessionId}.json`), JSON.stringify(reg, null, 2), 'utf8'); written++; } catch (_) {}
  }
  for (const c of refreshCli) {
    const meta = transcriptMeta(byCli[c]);
    if (!meta) continue;
    if (refreshRegistration(existing[c].file, meta)) refreshed++;
  }
  return { ...base, applied: true, written, refreshed, backup: backupPath };
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
  const sessions = [];
  for (const t of scan.list) {
    const meta = transcriptMeta(t);
    if (!meta) continue;
    const reg = existing[meta.cliSessionId];
    const registered = !!reg;
    const stale = registered && (meta.lastActivityAt || 0) > (reg.lastActivityAt || 0) + 2000;
    sessions.push({
      cliSessionId: meta.cliSessionId,
      title: meta.title,
      project: path.basename(path.dirname(t)),
      lastActivityAt: meta.lastActivityAt,
      createdAt: meta.createdAt,
      registered,
      status: registered ? (stale ? 'stale' : 'current') : 'new',
    });
  }
  sessions.sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0));
  return { ok: true, hasIndex: roots.length > 0, canImport: !!target, count: sessions.length, sessions };
}

module.exports = {
  bridgeInto, DEFAULT_PROJECTS, BACKUP_ROOT,
  findIndexDirs, currentAccountUuid, bestTemplate, transcriptMeta, listSessions,
  buildRegistration, scanTranscripts, pickTarget,
};
