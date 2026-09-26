'use strict';
// Tiny logger: writes to the dev console (the `npm run dev` terminal) AND to a
// file under the config dir, so build/launch problems are visible and shareable.
const os = require('os');
const path = require('path');
const fs = require('fs');

const LOG_DIR = path.join(os.homedir(), '.claude-profiles', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'claude-profiles.log');
// Also mirror into the repo during dev so it can be inspected easily.
const REPO_LOG = path.join(__dirname, '..', '.cp-debug.log');

function fmt(a) {
  if (typeof a === 'string') return a;
  try { return JSON.stringify(a); } catch (_) { return String(a); }
}

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(fmt).join(' ')}`;
  try { console.log('[CP]', ...args); } catch (_) {}
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); fs.appendFileSync(LOG_FILE, line + '\n'); } catch (_) {}
  try { fs.appendFileSync(REPO_LOG, line + '\n'); } catch (_) {}
}

function tail(n = 200) {
  try {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n');
    return lines.slice(-n).join('\n');
  } catch (_) { return ''; }
}

module.exports = { log, tail, LOG_FILE, LOG_DIR };
