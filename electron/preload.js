'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  envInfo: () => ipcRenderer.invoke('env:info'),
  list: () => ipcRenderer.invoke('instances:list'),
  add: (data) => ipcRenderer.invoke('instances:add', data),
  remove: (id) => ipcRenderer.invoke('instances:remove', id),
  launch: (id) => ipcRenderer.invoke('instances:launch', id),
  status: (id) => ipcRenderer.invoke('instances:status', id),
});
