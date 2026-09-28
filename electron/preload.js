'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  envInfo: () => ipcRenderer.invoke('env:info'),
  list: () => ipcRenderer.invoke('instances:list'),
  add: (data) => ipcRenderer.invoke('instances:add', data),
  update: (id, patch) => ipcRenderer.invoke('instances:update', { id, patch }),
  logs: () => ipcRenderer.invoke('app:logs'),
  remove: (id, keepData) => ipcRenderer.invoke('instances:remove', { id, keepData }),
  launch: (id) => ipcRenderer.invoke('instances:launch', id),
  rebuild: (id) => ipcRenderer.invoke('instances:rebuild', id),
  status: (id) => ipcRenderer.invoke('instances:status', id),
  detail: (id) => ipcRenderer.invoke('instances:detail', id),
  bringToFront: (id) => ipcRenderer.invoke('instances:front', id),
  reveal: (id) => ipcRenderer.invoke('instances:reveal', id),
  stop: (id) => ipcRenderer.invoke('instances:stop', id),
  pickIcon: () => ipcRenderer.invoke('dialog:pickIcon'),
  setGlass: (on) => ipcRenderer.invoke('app:setGlass', on),
  appVersion: () => ipcRenderer.invoke('app:version'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  // Test mode: lets the renderer skip splash/onboarding so e2e can drive the UI.
  e2e: !!(process.env.CP_E2E || process.env.CP_TEST),
  getSettings: () => ipcRenderer.invoke('app:getSettings'),
  setSettings: (patch) => ipcRenderer.invoke('app:setSettings', patch),
  showManager: (screen) => ipcRenderer.invoke('app:showManager', screen),
  // Navigation pushed from the tray menu (Preferences/About). Returns an unsubscribe fn.
  onNav: (cb) => {
    const h = (_e, screen) => cb(screen);
    ipcRenderer.on('app:nav', h);
    return () => ipcRenderer.removeListener('app:nav', h);
  },
});
