'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  envInfo: () => ipcRenderer.invoke('env:info'),
  list: () => ipcRenderer.invoke('instances:list'),
  add: (data) => ipcRenderer.invoke('instances:add', data),
  remove: (id) => ipcRenderer.invoke('instances:remove', id),
  launch: (id) => ipcRenderer.invoke('instances:launch', id),
  rebuild: (id) => ipcRenderer.invoke('instances:rebuild', id),
  status: (id) => ipcRenderer.invoke('instances:status', id),
  detail: (id) => ipcRenderer.invoke('instances:detail', id),
  bringToFront: (id) => ipcRenderer.invoke('instances:front', id),
  reveal: (id) => ipcRenderer.invoke('instances:reveal', id),
  pickIcon: () => ipcRenderer.invoke('dialog:pickIcon'),
});
