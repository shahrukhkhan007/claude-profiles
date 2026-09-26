'use strict';
// Live per-profile info + focus/reveal/stop for a specific instance.
const { execFileSync } = require('child_process');
const platform = require('./platform');

function pidFor(inst) {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('powershell', ['-NoProfile', '-Command',
        `(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${inst.dataDir}*' } | Select-Object -First 1 -ExpandProperty ProcessId)`],
        { encoding: 'utf8' });
      const n = parseInt(String(out).trim(), 10);
      return Number.isFinite(n) ? n : null;
    }
    const out = execFileSync('pgrep', ['-f', '--', inst.dataDir], { encoding: 'utf8' });
    const n = parseInt(String(out).trim().split(/\s+/)[0], 10);
    return Number.isFinite(n) ? n : null;
  } catch (_) { return null; }
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
function stop(inst) {
  try {
    if (process.platform === 'win32') {
      execFileSync('powershell', ['-NoProfile', '-Command',
        `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${inst.dataDir}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`]);
    } else {
      execFileSync('pkill', ['-f', '--', inst.dataDir]);
    }
  } catch (_) {}
  return { ok: true };
}

module.exports = { detail, bringToFront, reveal, stop, pidFor };
