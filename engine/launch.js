'use strict';
// Launch a profile — or focus it if it's already running (never duplicate).
const { spawn, execFile } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const platform = require('./platform');
const store = require('./instances');
const info = require('./detail');
const { log } = require('./log');

// After a custom clone launch, if it isn't running a few seconds later it
// almost certainly crashed at startup — pull the newest crash report so the
// termination reason lands in the log/terminal automatically.
function readLatestCrash(inst, sinceMs) {
  try {
    const dir = path.join(os.homedir(), 'Library', 'Logs', 'DiagnosticReports');
    const files = fs.readdirSync(dir)
      .filter((f) => /\.(ips|crash)$/i.test(f) && f.toLowerCase().includes('claude'))
      .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
      .filter((x) => x.m >= sinceMs - 3000)
      .sort((a, b) => b.m - a.m);
    for (const { f } of files.slice(0, 4)) {
      const txt = fs.readFileSync(path.join(dir, f), 'utf8');
      if (!inst.bundlePath || txt.includes(inst.bundlePath) || txt.includes('Claude ' + inst.name)) {
        log('CRASH REPORT for', inst.name, '(' + f + '):\n' + txt.split('\n').slice(0, 45).join('\n'));
        return true;
      }
    }
    log('launch: no matching crash report yet for', inst.name);
  } catch (e) { log('launch: crash scan error:', String(e).slice(0, 200)); }
  return false;
}

// When a clone crashes, `open` hides the real reason. Run the inner Mach-O
// directly with a short timeout so its own stderr (dyld / Electron / code-sign
// message) is captured, and dump what the OS thinks of the signature.
function probeClone(inst) {
  const { execFileSync } = require('child_process');
  const bin = inst.bundlePath ? path.join(inst.bundlePath, 'Contents', 'MacOS', 'Claude') : null;
  if (!bin || !fs.existsSync(bin)) { log('probe: inner binary missing', bin); return; }
  // 1) entitlements actually on the clone
  try {
    const ent = execFileSync('codesign', ['-d', '--entitlements', ':-', bin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    log('probe entitlements:\n' + String(ent).trim().slice(0, 800));
  } catch (e) { log('probe entitlements failed:', String((e && (e.stderr || e.message)) || e).slice(0, 300)); }
  // 2) Gatekeeper assessment
  try {
    execFileSync('spctl', ['-a', '-t', 'exec', '-vvv', inst.bundlePath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    log('probe spctl: accepted');
  } catch (e) { log('probe spctl:', String((e && (e.stderr || e.message)) || e).trim().slice(0, 300)); }
  // 3) run the binary directly and capture its own output
  try {
    execFileSync(bin, ['--user-data-dir=' + inst.dataDir, '--no-sandbox'], { timeout: 6000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    log('probe direct-run: exited 0 (did NOT crash when run directly)');
  } catch (e) {
    const out = String((e && e.stdout) || '') + String((e && e.stderr) || '');
    log('probe direct-run output [signal=' + (e && e.signal) + ' status=' + (e && e.status) + ']:\n' + (out.trim().slice(0, 1500) || (e && e.message || '').slice(0, 300)));
  }
}

function launch(inst) {
  if (!inst) throw new Error('Unknown profile');
  if (process.env.CP_TEST) {
    store.update(inst.id, { lastLaunchedAt: new Date().toISOString(), launches: (inst.launches || 0) + 1 });
    return { ok: true, test: true };
  }
  // Already running for this data dir? Just bring it to the front.
  if (info.pidFor(inst)) return info.bringToFront(inst);

  const arg = `--user-data-dir=${inst.dataDir}`;
  let child;
  if (process.platform === 'darwin') {
    if (inst.mode === 'custom' && inst.bundlePath) {
      log('launch custom:', inst.name, 'bundle=', inst.bundlePath, 'exists=', fs.existsSync(inst.bundlePath));
      child = spawn('open', ['-n', inst.bundlePath, '--args', arg], { detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let oerr = '';
      try { if (child && child.stderr && typeof child.stderr.on === 'function') child.stderr.on('data', (d) => { oerr += d; }); } catch (_) {}
      try { if (child && typeof child.on === 'function') child.on('exit', (code) => { if (code || oerr.trim()) log('open exited code', code, oerr.trim().slice(0, 300)); }); } catch (_) {}
      const t0 = Date.now();
      const timer = setTimeout(() => {
        if (info.pidFor(inst)) log('custom clone running OK:', inst.name);
        else { log('custom clone NOT running ~3s after launch — likely crashed at startup:', inst.name); readLatestCrash(inst, t0); probeClone(inst); }
      }, 3000);
      if (timer && typeof timer.unref === 'function') timer.unref();
    } else {
      child = spawn('open', ['-n', '-a', 'Claude', '--args', arg], { detached: true, stdio: 'ignore' });
    }
  } else if (process.platform === 'win32') {
    const exe = platform.claudeAppPath();
    if (!exe) throw new Error('Claude.exe not found');
    child = spawn(exe, [arg], { detached: true, stdio: 'ignore' });
  } else {
    child = spawn('claude', [arg], { detached: true, stdio: 'ignore' });
  }
  child.unref();
  store.update(inst.id, { lastLaunchedAt: new Date().toISOString(), launches: (inst.launches || 0) + 1 });
  return { ok: true, launched: true };
}

function isRunning(inst) {
  return new Promise((resolve) => {
    if (!inst || process.env.CP_TEST) return resolve(false);
    const needle = inst.dataDir;
    if (process.platform === 'win32') {
      execFile('powershell', ['-NoProfile', '-Command',
        `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${needle}*' } | Select-Object -First 1 ProcessId`],
        (err, stdout) => resolve(!err && /\d/.test(stdout || '')));
    } else {
      execFile('pgrep', ['-f', '--', needle], (err, stdout) => resolve(!err && (stdout || '').trim().length > 0));
    }
  });
}

module.exports = { launch, isRunning };
