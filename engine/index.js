'use strict';
// Public engine API used by the Electron main process over IPC.
const platform = require('./platform');
const store = require('./instances');
const launcher = require('./launch');
const custom = require('./custom');
const info = require('./detail');
const settings = require('./settings');
const bridge = require('./bridge');

function updateAvailable(inst, installedVersion) {
  if (process.platform !== 'darwin' || inst.mode !== 'custom') return false;
  // Clone signed by an older Claude Profiles (e.g. without the microphone entitlement).
  if (inst.bundlePath && (inst.signVersion || 1) < custom.SIGN_VERSION) return true;
  // Has a picked image but no macOS-shaped Dock icon yet (made before v0.3.1).
  if (inst.bundlePath && inst.iconData && !inst.dockIconPath) return true;
  return !!inst.claudeVersionAtBuild && !!installedVersion && inst.claudeVersionAtBuild !== installedVersion;
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
  if (updated && updated.mode === 'custom' && patch && (patch.iconData || patch.iconPath || patch.dockIconData)) {
    try { custom.applyIcon(updated); } catch (_) {}
  }
  return updated;
}

async function removeInstance(id, keepData) {
  const inst = store.get(id);
  if (inst) { try { await info.stop(inst); } catch (_) {} } // quit cleanly before removing anything
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
async function stop(id) { const it = store.get(id); return it ? info.stop(it) : { ok: false }; }
function reveal(id) { const it = store.get(id); return it ? info.reveal(it) : { ok: false }; }

function rebuild(id) {
  const it = store.get(id);
  if (!it) throw new Error('Profile not found');
  return store.update(id, custom.rebuild(it));
}

// The original registrations every *other* known Claude data dir holds, so an
// imported session keeps its name, id (parent/child nesting) and metadata.
function otherSources(targetDir) {
  const dirs = [platform.findDataDir(), ...store.list().map((i) => i.dataDir)]
    .filter((d) => d && d !== targetDir);
  try { return bridge.sourceRegistrations([...new Set(dirs)]); } catch (_) { return { byCli: {}, bySessionId: {}, priorOf: {} }; }
}

async function sessionBridge(id, opts = {}) {
  const isMain = id === 'main' || id === '__main__';
  const inst = isMain ? { id: 'main', name: 'Main Claude', dataDir: platform.findDataDir() } : store.get(id);
  if (!inst || !inst.dataDir) return { ok: false, error: isMain ? 'Could not find the main Claude data folder.' : 'Profile not found' };
  const running = await launcher.isRunning(inst);
  if (running) return { ok: false, error: 'Quit this profile first. Its Claude must be fully closed before importing sessions.' };
  return bridge.bridgeInto(inst.dataDir, { apply: !!opts.apply, only: opts.only, sources: otherSources(inst.dataDir) });
}

async function sessionList(id) {
  const isMain = id === 'main' || id === '__main__';
  const inst = isMain ? { id: 'main', name: 'Main Claude', dataDir: platform.findDataDir() } : store.get(id);
  if (!inst || !inst.dataDir) return { ok: false, error: isMain ? 'Could not find the main Claude data folder.' : 'Profile not found' };
  const running = await launcher.isRunning(inst);
  const res = bridge.listSessions(inst.dataDir, { sources: otherSources(inst.dataDir) });
  return { ...res, running, name: inst.name };
}

async function archiveInstance(id) {
  const it = store.get(id);
  if (!it) return { ok: false };
  try { await info.stop(it); } catch (_) {} // graceful: keeps the login intact
  if (it.mode === 'custom') { try { custom.remove(it); } catch (_) {} }
  return store.update(id, { archived: true, archivedAt: new Date().toISOString(), bundlePath: null });
}

function restoreInstance(id) {
  const it = store.get(id);
  if (!it) return { ok: false };
  let patch = { archived: false, archivedAt: null };
  if (it.mode === 'custom') { try { patch = { ...patch, ...custom.create(it) }; } catch (e) { patch.buildError = String((e && e.message) || e); } }
  return store.update(id, patch);
}

module.exports = {
  updateAvailable,
  updateInstance,
  envInfo, listInstances, addInstance, removeInstance, sessionBridge, sessionList, archiveInstance, restoreInstance,
  launch, status, getDetail, bringToFront, reveal, stop, rebuild,
  getSettings: settings.getSettings, setSettings: settings.setSettings,
};
