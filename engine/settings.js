'use strict';
// App-level settings that the main process (tray) needs to read — kept in a
// small JSON file next to the instance store. Renderer-only prefs (theme,
// glass) stay in the window; anything the tray must honor lives here.
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = process.env.CP_HOME || os.homedir();
const CONFIG_DIR = path.join(HOME, '.claude-profiles');
const FILE = path.join(CONFIG_DIR, 'settings.json');

const DEFAULTS = {
  trayGlyph: 'auto', // 'auto' (template, adapts) | 'light' (white) | 'dark' (black)
  autoUpdateCheck: true, // ask GitHub Releases for a newer version in the background
  hiddenProjects: [], // project folders hidden in the session-import list
  sessionSort: 'recent',
};

function read() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch (_) {
    return { ...DEFAULTS };
  }
}

function write(patch) {
  const next = { ...read(), ...(patch || {}) };
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  } catch (_) {}
  return next;
}

module.exports = { getSettings: read, setSettings: write, FILE, DEFAULTS };
