'use strict';
// Public engine API used by the Electron main process over IPC.
const platform = require('./platform');
const store = require('./instances');
const launcher = require('./launch');
const custom = require('./custom');
const info = require('./detail');
const settings = require('./settings');
const { log } = require('./log');

function updateAvailable(inst, installedVersion) {
  return (
    process.platform === 'darwin' &&
    inst.mode === 'custom' &&
    !!inst.claudeVersionAtBuild &&
    !!installedVersion &&
    inst.claudeVersionAtBuild !== installedVersion
  );
}

function envInfo() {
  return {
    os: process.platform,
    claudeApp: platform.claudeAppPath(),
    dataDir: platform.findDataDir(),
    version: platform.claudeVersion(),
    configDir: store.CONFIG_DIR,
  };
}

async function listInstances() {
  const installed = platform.claudeVersion();
  const items = store.list();
  await Promise.all(items.map(async (it) => {
    it.running = await launcher.isRunning(it);
    it.updateAvailable = updateAvailable(it, installed);
  }));
  try { const r = items.filter((i) => i.running).map((i) => i.name); if (r.length) log('[DEBUG] detected running:', r.join(', ')); } catch (_) {}
  return items;
}

function addInstance(data) {
  const inst = store.add(data);
  if (inst.mode === 'custom') {
    try { return store.update(inst.id, custom.create(inst)); }
    catch (e) { return store.update(inst.id, { buildError: String((e && e.message) || e) }); }
  }
  return inst;
}

function updateInstance(id, patch) {
  const updated = store.update(id, patch || {});
  // If a custom profile's icon changed, re-apply it to the Dock clone.
  if (updated && updated.mode === 'custom' && patch && (patch.iconData || patch.iconPath)) {
    try { custom.applyIcon(updated); } catch (_) {}
  }
  return updated;
}

function removeInstance(id, keepData) {
  const inst = store.get(id);
  // The app clone / shortcut is always removed; keepData only controls the data dir.
  if (inst && inst.mode === 'custom') { try { custom.remove(inst); } catch (_) {} }
  return store.remove(id, keepData);
}

async function launch(id) {
  const it = store.get(id);
  if (!it) throw new Error('Profile not found');
  return launcher.launch(it);
}

async function status(id) {
  const it = store.get(id);
  return { running: it ? await launcher.isRunning(it) : false };
}

function getDetail(id) {
  const it = store.get(id);
  if (!it) throw new Error('Profile not found');
  const d = info.detail(it);
  d.updateAvailable = updateAvailable(it, d.claudeVersion);
  return d;
}

function bringToFront(id) { const it = store.get(id); return it ? info.bringToFront(it) : { ok: false }; }
function stop(id) { const it = store.get(id); return it ? info.stop(it) : { ok: false }; }
function reveal(id) { const it = store.get(id); return it ? info.reveal(it) : { ok: false }; }

function rebuild(id) {
  const it = store.get(id);
  if (!it) throw new Error('Profile not found');
  return store.update(id, custom.rebuild(it));
}

module.exports = {
  updateAvailable,
  updateInstance,
  envInfo, listInstances, addInstance, removeInstance,
  launch, status, getDetail, bringToFront, reveal, stop, rebuild,
  getSettings: settings.getSettings, setSettings: settings.setSettings,
};
