'use strict';
const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const engine = require('../engine');
const cplog = require('../engine/log');
const updater = require('../engine/updater');

const DEV_URL = 'http://127.0.0.1:5173';
// Runtime assets: from build/ in dev, from Resources/assets in the packaged app (see build.extraResources).
const ASSET_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(__dirname, '..', 'build');
const APP_ICON = path.join(ASSET_DIR, 'icon.png');
// Menu-bar glyph options. 'auto' is a template image (macOS tints it to match
// the bar); 'light'/'dark' are fixed-colour glyphs for users who want to force one.
const GLYPHS = {
  auto: { file: path.join(ASSET_DIR, 'trayTemplate.png'), template: true },
  light: { file: path.join(ASSET_DIR, 'trayLight.png'), template: false },
  dark: { file: path.join(ASSET_DIR, 'trayDark.png'), template: false },
};

let win = null;
let tray = null;
// Self-update state lives in main: the renderer only asks to check/download/install,
// and install always uses the file *we* downloaded (never a path from the renderer).
const upd = { info: null, file: null, downloading: false, progress: 0 };
const sendToWin = (ch, payload) => { try { if (win && !win.isDestroyed()) win.webContents.send(ch, payload); } catch (_) {} };

async function checkForUpdates() {
  const info = await updater.checkLatest(app.getVersion());
  if (info.ok) info.blocked = updater.blockedReason();
  upd.info = info;
  if (info.ok && info.newer) { sendToWin('update:available', info); refreshTray(); }
  return info;
}

async function downloadUpdate() {
  if (!upd.info || !upd.info.ok || !upd.info.newer) await checkForUpdates();
  const info = upd.info;
  if (!info || !info.ok) return { ok: false, error: (info && info.error) || 'Could not reach GitHub.' };
  if (!info.newer) return { ok: false, error: 'You already have the latest version.' };
  if (!info.asset) return { ok: false, error: 'No installer for this system in the latest release.' };
  if (upd.downloading) return { ok: false, error: 'Already downloading.' };
  upd.downloading = true; upd.progress = 0;
  try {
    const dir = path.join(app.getPath('temp'), 'claude-profiles-update', info.latest);
    let last = 0;
    upd.file = await updater.download(info.asset, dir, (p) => {
      upd.progress = p;
      if (p - last >= 0.01 || p === 1) { last = p; sendToWin('update:progress', p); }
    });
    cplog.log('update downloaded', info.latest, upd.file);
    return { ok: true, file: path.basename(upd.file), version: info.latest };
  } catch (e) {
    cplog.log('update download failed', String(e && e.message));
    return { ok: false, error: String((e && e.message) || e) };
  } finally { upd.downloading = false; }
}

function installUpdate() {
  if (!upd.file) return { ok: false, error: 'Download the update first.' };
  const blocked = updater.blockedReason();
  if (blocked) return { ok: false, error: blocked };
  try {
    const r = updater.install(upd.file, { openPath: (f) => shell.openPath(f), logDir: path.dirname(cplog.LOG_FILE) });
    cplog.log('update install started', r.mode);
    if (r.mode === 'relaunch') setTimeout(() => app.quit(), 300);
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

function createWindow() {
  if (win && !win.isDestroyed()) { win.show(); win.focus(); return; }
  win = new BrowserWindow({
    width: 820, height: 640, minWidth: 660, minHeight: 480,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#1e1e20',
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (!app.isPackaged && !process.env.CP_E2E) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

// Open the manager window and navigate the renderer to a screen (home/settings/about).
function showManager(screen) {
  createWindow();
  const target = screen === 'settings' || screen === 'about' ? screen : 'home';
  const send = () => { try { win.webContents.send('app:nav', target); } catch (_) {} };
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send);
  else send();
  try { win.show(); win.focus(); } catch (_) {}
}

async function buildTrayMenu() {
  let items = [];
  try { items = await engine.listInstances(); } catch (_) {}
  items = items.filter((i) => !i.archived);
  const running = items.filter((i) => i.running).length;
  const row = (i) => ({
    label: `${i.running ? '●' : '○'}  ${i.name}${i.updateAvailable ? '  (update)' : ''}`,
    click: () => {
      const act = i.running ? engine.bringToFront(i.id) : engine.launch(i.id);
      Promise.resolve(act).then(refreshTray).catch(() => {});
    },
  });
  const simple = items.filter((i) => i.mode !== 'custom');
  const customs = items.filter((i) => i.mode === 'custom');
  // Quick Launch / Custom shown as submenus — a native menu can't hold real
  // tabs, so each group expands on hover (the closest Mac-native equivalent).
  const submenu = (list) => (list.length ? list.map(row) : [{ label: 'No profiles yet', enabled: false }]);
  const groupItem = (title, list) => ({
    label: list.length ? `${title} (${list.length})` : title,
    submenu: submenu(list),
  });
  const updItem = upd.info && upd.info.ok && upd.info.newer
    ? [{ label: `Update to v${upd.info.latest}…`, click: () => showManager('about') }, { type: 'separator' }]
    : [];
  return Menu.buildFromTemplate([
    { label: `Claude Profiles · ${running} running`, enabled: false },
    { type: 'separator' },
    ...updItem,
    groupItem('Quick Launch', simple),
    groupItem('Custom', customs),
    { type: 'separator' },
    { label: 'New Profile…', click: () => showManager('home') },
    { label: 'Open Manager…', click: () => showManager('home') },
    { label: 'Preferences…', accelerator: 'CommandOrControl+,', click: () => showManager('settings') },
    { label: 'About Claude Profiles', click: () => showManager('about') },
    { type: 'separator' },
    { label: 'Quit', accelerator: 'CommandOrControl+Q', click: () => app.quit() },
  ]);
}

async function refreshTray() {
  if (!tray) return;
  tray.setContextMenu(await buildTrayMenu());
}

// Apply the user's menu-bar glyph choice (auto template, or forced light/dark).
function applyTrayGlyph() {
  if (!tray) return;
  let choice = 'auto';
  try { choice = (engine.getSettings() || {}).trayGlyph || 'auto'; } catch (_) {}
  const g = GLYPHS[choice] || GLYPHS.auto;
  const img = nativeImage.createFromPath(g.file);
  img.setTemplateImage(g.template);
  tray.setImage(img);
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  applyTrayGlyph();
  tray.setToolTip('Claude Profiles');
  refreshTray();
}

function registerIpc() {
  ipcMain.handle('env:info', () => engine.envInfo());
  ipcMain.handle('instances:list', () => engine.listInstances());
  ipcMain.handle('instances:add', async (_e, data) => { const r = engine.addInstance(data); refreshTray(); return r; });
  ipcMain.handle('instances:remove', async (_e, arg) => { const id = arg && typeof arg === 'object' ? arg.id : arg; const keepData = arg && typeof arg === 'object' ? !!arg.keepData : false; const r = engine.removeInstance(id, keepData); refreshTray(); return r; });
  ipcMain.handle('instances:launch', async (_e, id) => { const r = await engine.launch(id); refreshTray(); return r; });
  ipcMain.handle('instances:rebuild', async (_e, id) => { const r = engine.rebuild(id); refreshTray(); return r; });
  ipcMain.handle('instances:status', (_e, id) => engine.status(id));
  ipcMain.handle('instances:detail', (_e, id) => engine.getDetail(id));
  ipcMain.handle('instances:bridgePreview', (_e, id) => engine.sessionBridge(id, { apply: false }));
  ipcMain.handle('instances:bridgeApply', async (_e, arg) => { const id = arg && typeof arg === 'object' ? arg.id : arg; const only = arg && typeof arg === 'object' ? arg.only : null; const r = await engine.sessionBridge(id, { apply: true, only }); refreshTray(); return r; });
  ipcMain.handle('instances:sessionList', (_e, id) => engine.sessionList(id));
  ipcMain.handle('instances:archive', async (_e, id) => { const r = engine.archiveInstance(id); refreshTray(); return r; });
  ipcMain.handle('instances:restore', async (_e, id) => { const r = engine.restoreInstance(id); refreshTray(); return r; });
  ipcMain.handle('instances:front', (_e, id) => engine.bringToFront(id));
  ipcMain.handle('instances:reveal', (_e, id) => engine.reveal(id));
  ipcMain.handle('instances:stop', async (_e, id) => { const r = engine.stop(id); refreshTray(); return r; });
  ipcMain.handle('dialog:pickIcon', async () => {
    const parent = win && !win.isDestroyed() ? win : undefined;
    const r = await dialog.showOpenDialog(parent, {
      title: 'Choose an image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'icns', 'ico'] }],
    });
    if (r.canceled || !r.filePaths || !r.filePaths[0]) return null;
    const p = r.filePaths[0];
    let dataUrl = null;
    try {
      const img = nativeImage.createFromPath(p);
      if (img && !img.isEmpty()) dataUrl = img.resize({ width: 128, quality: 'good' }).toDataURL();
    } catch (_) {}
    if (!dataUrl) {
      try {
        const ext = path.extname(p).slice(1).toLowerCase();
        const mime = ext === 'jpg' ? 'jpeg' : (ext || 'png');
        dataUrl = 'data:image/' + mime + ';base64,' + require('fs').readFileSync(p).toString('base64');
      } catch (_) {}
    }
    return { path: p, dataUrl };
  });
  ipcMain.handle('instances:update', (_e, arg) => { const r = engine.updateInstance(arg.id, arg.patch); refreshTray(); return r; });
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:logs', () => ({ path: cplog.LOG_FILE, text: cplog.tail(400) }));
  ipcMain.handle('app:openExternal', (_e, url) => { try { if (/^https?:\/\//.test(String(url))) shell.openExternal(url); } catch (_) {} return { ok: true }; });
  ipcMain.handle('app:getSettings', () => { try { return engine.getSettings(); } catch (_) { return {}; } });
  ipcMain.handle('app:setSettings', (_e, patch) => {
    let r = {};
    try { r = engine.setSettings(patch || {}); } catch (_) {}
    if (patch && Object.prototype.hasOwnProperty.call(patch, 'trayGlyph')) applyTrayGlyph();
    return r;
  });
  ipcMain.handle('update:check', () => checkForUpdates());
  ipcMain.handle('update:state', () => ({ info: upd.info, downloaded: !!upd.file, downloading: upd.downloading, progress: upd.progress }));
  ipcMain.handle('update:download', () => downloadUpdate());
  ipcMain.handle('update:install', () => installUpdate());
  ipcMain.handle('app:showManager', (_e, screen) => { showManager(screen); return { ok: true }; });
  ipcMain.handle('app:setGlass', (_e, on) => {
    if (win && !win.isDestroyed()) { try { win.setVibrancy(on ? 'under-window' : null); } catch (_) {} }
    return { ok: true };
  });
}

app.whenReady().then(() => {
  cplog.log('Claude Profiles started — logs at', cplog.LOG_FILE);
  try { if (process.platform === 'darwin' && app.dock) app.dock.setIcon(nativeImage.createFromPath(APP_ICON)); } catch (_) {}
  registerIpc();
  createWindow();
  createTray(); // menu bar presence in dev + prod
  // Background update check (packaged builds only; can be turned off in Settings).
  const autoCheck = () => {
    let on = true;
    try { on = (engine.getSettings() || {}).autoUpdateCheck !== false; } catch (_) {}
    if (on && app.isPackaged && !process.env.CP_E2E) checkForUpdates().catch(() => {});
  };
  setTimeout(autoCheck, 8000);
  setInterval(autoCheck, 6 * 60 * 60 * 1000).unref();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

// Keep running in the menu bar when the window is closed.
app.on('window-all-closed', () => {
  // In production the app lives on in the menu bar. In dev, quit fully so the
  // next `npm run dev` reloads the main process (main.js + engine/*), which
  // otherwise never hot-reloads — only the renderer does.
  if (!app.isPackaged) app.quit();
});
