'use strict';
const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const engine = require('../engine');

const DEV_URL = 'http://127.0.0.1:5173';

// Small monochrome menu-bar glyph (template image adapts to light/dark).
const TRAY_ICON =
  'iVBORw0KGgoAAAANSUhEUgAAACwAAAAsCAYAAAAehFoBAAAAzklEQVR4nO2YQRKAMAgDq///s94dhQChaid76sFCzNAKjiGEEBYbOd7RnYsRxBJJz1sRnBFazr8nEzHEpuJE35Al9A5IS8ThTrFw/GxJvAZaEqi7VjzKlYc8iIiNnIVrvNA5YpRE9OBuD2tKMs9d9pfSpeLwdLFj/PCWsAS3NzIZlnL4k0hwNxLcjSU428i0spTDHq+47AmuNkfWvtReRklEEx8Pa4glJw4kIQtXz9K3RHdLCcXPimCWx5QhlOU2fQhF+M3fyzs+OVYJIQqcVaocNXfbUroAAAAASUVORK5CYII=';

let win = null;
let tray = null;

function createWindow() {
  if (win && !win.isDestroyed()) { win.show(); win.focus(); return; }
  win = new BrowserWindow({
    width: 820, height: 640, minWidth: 660, minHeight: 480,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#faf9f5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (!app.isPackaged) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

async function buildTrayMenu() {
  let items = [];
  try { items = await engine.listInstances(); } catch (_) {}
  const running = items.filter((i) => i.running).length;
  const rows = items.map((i) => ({
    label: `${i.running ? '●' : '○'}  ${i.name}${i.updateAvailable ? '  (update)' : ''}`,
    click: () => { engine.launch(i.id).then(refreshTray); },
  }));
  return Menu.buildFromTemplate([
    { label: `Claude Profiles — ${running} running`, enabled: false },
    { type: 'separator' },
    ...(rows.length ? rows : [{ label: 'No profiles yet', enabled: false }]),
    { type: 'separator' },
    { label: 'Open Manager…', click: () => createWindow() },
    { label: 'Quit', click: () => app.quit() },
  ]);
}

async function refreshTray() {
  if (!tray) return;
  tray.setContextMenu(await buildTrayMenu());
}

function createTray() {
  const img = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON}`);
  img.setTemplateImage(true);
  tray = new Tray(img);
  tray.setToolTip('Claude Profiles');
  refreshTray();
}

function registerIpc() {
  ipcMain.handle('env:info', () => engine.envInfo());
  ipcMain.handle('instances:list', () => engine.listInstances());
  ipcMain.handle('instances:add', async (_e, data) => { const r = engine.addInstance(data); refreshTray(); return r; });
  ipcMain.handle('instances:remove', async (_e, id) => { const r = engine.removeInstance(id); refreshTray(); return r; });
  ipcMain.handle('instances:launch', async (_e, id) => { const r = await engine.launch(id); refreshTray(); return r; });
  ipcMain.handle('instances:rebuild', async (_e, id) => { const r = engine.rebuild(id); refreshTray(); return r; });
  ipcMain.handle('instances:status', (_e, id) => engine.status(id));
  ipcMain.handle('instances:detail', (_e, id) => engine.getDetail(id));
  ipcMain.handle('instances:front', (_e, id) => engine.bringToFront(id));
  ipcMain.handle('instances:reveal', (_e, id) => engine.reveal(id));
  ipcMain.handle('dialog:pickIcon', async () => {
    const r = await dialog.showOpenDialog(win || undefined, {
      title: 'Choose an icon',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'icns', 'ico'] }],
    });
    return r.canceled ? null : r.filePaths[0];
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  createTray();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

// Keep running in the menu bar when the window is closed.
app.on('window-all-closed', () => { /* stay alive for the tray */ });
