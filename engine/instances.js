'use strict';
// Source of truth for the user's instances: a small JSON file in the app's config dir.
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const HOME = os.homedir();
const CONFIG_DIR = path.join(HOME, '.claude-profiles');
const STORE = path.join(CONFIG_DIR, 'profiles.json');
const ICON_DIR = path.join(CONFIG_DIR, 'icons');

// Persist a picked image (data URL) to a stable file we own, so the card and
// any later custom rebuild keep working even if the original file is moved.
function persistIcon(id, iconData) {
  if (!iconData || typeof iconData !== 'string') return null;
  const m = iconData.match(/^data:image\/([A-Za-z0-9.+-]+);base64,(.+)$/);
  if (!m) return null;
  try {
    fs.mkdirSync(ICON_DIR, { recursive: true });
    const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
    const file = path.join(ICON_DIR, `${id}.${ext}`);
    fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
    return file;
  } catch (_) { return null; }
}

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

function add({ name, mode = 'simple', color = 'blue', iconPath = null, iconData = null }) {
  const instances = readAll();
  const dataDir = dataDirFor(name);
  fs.mkdirSync(dataDir, { recursive: true });
  const id = crypto.randomBytes(4).toString('hex');
  const stableIcon = persistIcon(id, iconData);
  const inst = {
    id,
    name: String(name).trim(),
    mode,                 // 'simple' | 'custom'
    color,
    iconData: iconData || null,      // shown on the card
    iconPath: stableIcon || iconPath, // durable source for the custom .icns
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
  const p = { ...(patch || {}) };
  if (p.iconData) { const f = persistIcon(id, p.iconData); if (f) p.iconPath = f; }
  instances[idx] = { ...instances[idx], ...p };
  writeAll(instances);
  return instances[idx];
}

function remove(id) {
  const all = readAll();
  const inst = all.find((i) => i.id === id);
  if (inst) {
    // Full cleanup — leave no trace: the profile's data dir (login + history)
    // and its persisted icon file.
    try { if (inst.dataDir && fs.existsSync(inst.dataDir)) fs.rmSync(inst.dataDir, { recursive: true, force: true }); } catch (_) {}
    try {
      for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'icns', 'ico']) {
        const f = path.join(ICON_DIR, `${id}.${ext}`);
        if (fs.existsSync(f)) fs.rmSync(f, { force: true });
      }
    } catch (_) {}
  }
  writeAll(all.filter((i) => i.id !== id));
  return true;
}

module.exports = { CONFIG_DIR, STORE, list, get, add, update, remove, dataDirFor };
