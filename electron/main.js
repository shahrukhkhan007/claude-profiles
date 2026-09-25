'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const engine = require('../engine');

const DEV_URL = 'http://127.0.0.1:5173';

function createWindow() {
  const win = new BrowserWindow({
    width: 820,
    height: 640,
    minWidth: 660,
    minHeight: 480,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#faf9f5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (!app.isPackaged) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function registerIpc() {
  ipcMain.handle('env:info', () => engine.envInfo());
  ipcMain.handle('instances:list', () => engine.listInstances());
  ipcMain.handle('instances:add', (_e, data) => engine.addInstance(data));
  ipcMain.handle('instances:remove', (_e, id) => engine.removeInstance(id));
  ipcMain.handle('instances:launch', (_e, id) => engine.launch(id));
  ipcMain.handle('instances:status', (_e, id) => engine.status(id));
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
