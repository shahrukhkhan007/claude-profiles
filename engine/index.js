'use strict';
// Public engine API used by the Electron main process over IPC.
const platform = require('./platform');
const store = require('./instances');
const launcher = require('./launch');

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
  const items = store.list();
  await Promise.all(items.map(async (it) => { it.running = await launcher.isRunning(it); }));
  return items;
}

function addInstance(data) { return store.add(data); }
function removeInstance(id) { return store.remove(id); }

async function launch(id) {
  const it = store.get(id);
  if (!it) throw new Error('Instance not found');
  return launcher.launch(it);
}

async function status(id) {
  const it = store.get(id);
  return { running: it ? await launcher.isRunning(it) : false };
}

module.exports = { envInfo, listInstances, addInstance, removeInstance, launch, status };
