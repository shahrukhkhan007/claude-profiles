'use strict';
// Source of truth for the user's instances: a small JSON file in the app's config dir.
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const HOME = os.homedir();
const CONFIG_DIR = path.join(HOME, '.claude-profiles');
const STORE = path.join(CONFIG_DIR, 'profiles.json');

function ensureDir() { fs.mkdirSync(CONFIG_DIR, { recursive: true }); }

function readAll() {
  try {
    const raw = fs.readFileSync(STORE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.instances) ? data.instances : [];
  } catch (_) { return []; }
}

function writeAll(instances) {
  ensureDir();
  fs.writeFileSync(STORE, JSON.stringify({ version: 1, instances }, null, 2));
}

function slug(name) {
  return String(name).trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'instance';
}

// Where an isolated Claude keeps its login + sessions.
function dataDirFor(name) {
  const s = slug(name);
  if (process.platform === 'darwin') return path.join(HOME, 'Library', 'Application Support', `Claude-${s}`);
  if (process.platform === 'win32') return path.join(process.env.APPDATA || HOME, `Claude-${s}`);
  return path.join(HOME, '.config', `Claude-${s}`);
}

function list() { return readAll(); }
function get(id) { return readAll().find((i) => i.id === id) || null; }

function add({ name, mode = 'simple', color = 'blue', iconPath = null }) {
  const instances = readAll();
  const dataDir = dataDirFor(name);
  fs.mkdirSync(dataDir, { recursive: true });
  const inst = {
    id: crypto.randomBytes(4).toString('hex'),
    name: String(name).trim(),
    mode,                 // 'simple' | 'custom'
    color,
    iconPath,
    dataDir,
    bundlePath: null,     // set in Phase 2 for macOS custom clones
    createdAt: new Date().toISOString(),
    lastLaunchedAt: null,
    launches: 0,
  };
  instances.push(inst);
  writeAll(instances);
  return inst;
}

function update(id, patch) {
  const instances = readAll();
  const idx = instances.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  instances[idx] = { ...instances[idx], ...patch };
  writeAll(instances);
  return instances[idx];
}

function remove(id) {
  const instances = readAll().filter((i) => i.id !== id);
  writeAll(instances);
  return true;
}

module.exports = { CONFIG_DIR, STORE, list, get, add, update, remove, dataDirFor };
