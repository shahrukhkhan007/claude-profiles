'use strict';
// Live per-profile info + focus/reveal/stop for a specific instance.
const { execFileSync } = require('child_process');
const platform = require('./platform');
const { uddNeedle } = require('./procmatch');

// Every process (main + Chromium helpers) belonging to this profile: [{ pid, args }].
function profileProcs(inst) {
  if (process.env.CP_TEST || !inst || !inst.dataDir) return []; // never match an empty needle
  const re = new RegExp(uddNeedle(inst.dataDir));
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('powershell', ['-NoProfile', '-Command',
        'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId)`t$($_.CommandLine)" }'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
      return parseProcs(out, '\t').filter((p) => re.test(p.args));
    }
    const out = execFileSync('ps', ['-axo', 'pid=,args='], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    return parseProcs(out, ' ').filter((p) => re.test(p.args));
  } catch (_) { return []; }
}

function parseProcs(out, sep) {
  const procs = [];
  for (const line of String(out).split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const i = t.indexOf(sep === '\t' ? '\t' : ' ');
    const pid = parseInt(i === -1 ? t : t.slice(0, i), 10);
    if (Number.isFinite(pid)) procs.push({ pid, args: i === -1 ? '' : t.slice(i + 1).trim() });
  }
  return procs;
}

// The app's main (browser) process: Chromium helpers carry a --type=… flag.
function mainProc(procs) {
  return (procs || []).find((p) => !/(^|\s)--type=/.test(p.args)) || null;
}

function pidFor(inst) {
  const main = mainProc(profileProcs(inst));
  return main ? main.pid : null;
}

function liveStats(pid) {
  if (!pid) return { uptime: null, memoryMB: null };
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('powershell', ['-NoProfile', '-Command',
        `$p=Get-Process -Id ${pid}; '{0}|{1}' -f ((Get-Date)-$p.StartTime).ToString('hh\\:mm\\:ss'), [math]::Round($p.WorkingSet64/1MB)`],
        { encoding: 'utf8' });
      const [up, mem] = String(out).trim().split('|');
      return { uptime: up || null, memoryMB: Number(mem) || null };
    }
    const out = execFileSync('ps', ['-o', 'etime=,rss=', '-p', String(pid)], { encoding: 'utf8' }).trim();
    const parts = out.split(/\s+/);
    const rss = parseInt(parts[1], 10);
    return { uptime: parts[0] || null, memoryMB: Number.isFinite(rss) ? Math.round(rss / 1024) : null };
  } catch (_) { return { uptime: null, memoryMB: null }; }
}

function detail(inst) {
  const pid = pidFor(inst);
  const stats = liveStats(pid);
  return { ...inst, running: !!pid, pid, uptime: stats.uptime, memoryMB: stats.memoryMB, claudeVersion: platform.claudeVersion() };
}

// Focus THIS profile's running instance (by pid), not a random Claude window.
function bringToFront(inst) {
  const pid = pidFor(inst);
  try {
    if (process.platform === 'darwin') {
      if (pid) execFileSync('osascript', ['-e', `tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true`]);
      else if (inst.mode === 'custom' && inst.bundlePath) execFileSync('open', ['-a', inst.bundlePath]);
    } else if (process.platform === 'linux') {
      execFileSync('wmctrl', ['-x', '-a', `Claude ${inst.name}`]);
    }
  } catch (_) {}
  return { ok: true, pid: pid || null };
}

function reveal(inst) {
  const target = inst.bundlePath || inst.dataDir;
  try {
    if (process.platform === 'darwin') execFileSync('open', ['-R', target]);
    else if (process.platform === 'win32') execFileSync('explorer', [`/select,${target}`]);
    else execFileSync('xdg-open', [inst.dataDir]);
  } catch (_) {}
  return { ok: true };
}

// Quit this profile's running instance. The profile (its data dir) stays; it can be relaunched.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Quit a profile the way the user quitting it would: ask ONLY the main process
// to quit, so Claude flushes its cookie store (the login) and local storage,
// then wait. Killing every process at once (the old `pkill -f`) also killed
// the network-service helper that holds unflushed cookies, which could throw
// away a just-refreshed login and leave a stale one that claude.ai rejects →
// logged out on the next launch. Force-kill only what is left after the wait.
async function stop(inst, opts = {}) {
  if (process.env.CP_TEST) return { ok: true, test: true };
  if (!inst || !inst.dataDir) return { ok: false }; // never match an empty needle
  const graceMs = opts.graceMs == null ? 8000 : opts.graceMs;
  const kill = opts.kill || ((pid, sig) => { try { process.kill(pid, sig); } catch (_) {} });
  const list = opts.list || (() => profileProcs(inst));
  const winClose = (pid, force) => { try { execFileSync('taskkill', force ? ['/PID', String(pid), '/T', '/F'] : ['/PID', String(pid), '/T']); } catch (_) {} };
  const isWin = (opts.platform || process.platform) === 'win32';

  let procs = list();
  if (!procs.length) return { ok: true, graceful: true, wasRunning: false };
  const main = mainProc(procs);
  if (main) { if (isWin) winClose(main.pid, false); else kill(main.pid, 'SIGTERM'); }
  else for (const p of procs) { if (isWin) winClose(p.pid, false); else kill(p.pid, 'SIGTERM'); }

  for (let waited = 0; waited < graceMs; waited += 250) {
    await sleep(250);
    procs = list();
    if (!procs.length) return { ok: true, graceful: true, wasRunning: true };
  }
  // Still running (hung or busy): end what's left.
  for (const p of procs) { if (isWin) winClose(p.pid, true); else kill(p.pid, 'SIGTERM'); }
  await sleep(1500);
  for (const p of list()) if (!isWin) kill(p.pid, 'SIGKILL');
  return { ok: true, graceful: false, wasRunning: true };
}

module.exports = { detail, bringToFront, reveal, stop, pidFor, profileProcs, mainProc, parseProcs };
