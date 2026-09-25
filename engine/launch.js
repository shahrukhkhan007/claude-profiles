'use strict';
// Launch a profile and check whether one is running for a given data dir.
const { spawn, execFile } = require('child_process');
const platform = require('./platform');
const store = require('./instances');

function launch(inst) {
  if (!inst) throw new Error('Unknown profile');
  const arg = `--user-data-dir=${inst.dataDir}`;
  let child;
  if (process.platform === 'darwin') {
    if (inst.mode === 'custom' && inst.bundlePath) {
      child = spawn('open', ['-n', inst.bundlePath, '--args', arg], { detached: true, stdio: 'ignore' });
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
  return { ok: true };
}

function isRunning(inst) {
  return new Promise((resolve) => {
    if (!inst) return resolve(false);
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
