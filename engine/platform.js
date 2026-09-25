'use strict';
// Cross-platform detection of the installed Claude Desktop app and its data dir.
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const HOME = os.homedir();

function dataDirCandidates() {
  const c = [];
  if (process.platform === 'darwin') {
    c.push(path.join(HOME, 'Library', 'Application Support', 'Claude'));
  } else if (process.platform === 'win32') {
    const appdata = process.env.APPDATA;
    const local = process.env.LOCALAPPDATA;
    if (appdata) c.push(path.join(appdata, 'Claude'));
    if (local) c.push(path.join(local, 'Claude'));
    if (local) {
      try {
        const pkgs = path.join(local, 'Packages');
        for (const d of fs.readdirSync(pkgs)) {
          if (d.startsWith('Claude')) {
            c.push(path.join(pkgs, d, 'LocalCache', 'Roaming', 'Claude'));
          }
        }
      } catch (_) { /* no MSIX packages */ }
    }
  } else {
    c.push(path.join(HOME, '.config', 'Claude'));
  }
  return c;
}

// Prefer a dir that actually holds the desktop app's session index.
function findDataDir() {
  const cands = dataDirCandidates();
  const withSessions = cands.find(
    (d) => fs.existsSync(d) && fs.existsSync(path.join(d, 'claude-code-sessions'))
  );
  if (withSessions) return withSessions;
  return cands.find((d) => fs.existsSync(d)) || null;
}

function claudeAppPath() {
  if (process.platform === 'darwin') {
    for (const p of ['/Applications/Claude.app', path.join(HOME, 'Applications', 'Claude.app')]) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA;
    if (local) {
      const exe = path.join(local, 'Programs', 'Claude', 'Claude.exe');
      if (fs.existsSync(exe)) return exe;
    }
    return null;
  }
  // linux: rely on PATH
  try {
    return execFileSync('which', ['claude'], { encoding: 'utf8' }).trim() || null;
  } catch (_) { return null; }
}

function claudeVersion() {
  try {
    if (process.platform === 'darwin') {
      const app = claudeAppPath();
      if (!app) return null;
      const plist = fs.readFileSync(path.join(app, 'Contents', 'Info.plist'), 'utf8');
      const m = plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);
      return m ? m[1] : null;
    }
  } catch (_) { /* fall through */ }
  return null;
}

function projectsDir() {
  return path.join(HOME, '.claude', 'projects');
}

module.exports = { HOME, dataDirCandidates, findDataDir, claudeAppPath, claudeVersion, projectsDir };
