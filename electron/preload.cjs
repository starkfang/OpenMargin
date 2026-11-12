'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');
const cancelledTransfers = new Set();
const rollbackCallbacks = new Set();
contextBridge.exposeInMainWorld('openMargin', {
  open: () => ipcRenderer.invoke('document:open'),
  newWindow: () => ipcRenderer.invoke('window:new'),
  claimTab: path => ipcRenderer.invoke('tab:claim', path),
  releaseTab: path => ipcRenderer.invoke('tab:release', path),
  beginTabTransfer: (path, snapshot) => ipcRenderer.invoke('tab:begin-transfer', path, snapshot),
  cancelTabTransfer: token => ipcRenderer.invoke('tab:cancel-transfer', token),
  completeTabTransfer: (token, x, y) => ipcRenderer.invoke('tab:complete-transfer', token, x, y),
  onTabTransfer: callback => {
    const handler = async (_event, payload) => {
      let accepted = false;
      try { accepted = await callback(payload) === true; } catch {}
      if (cancelledTransfers.delete(payload.token)) {
        for (const cb of rollbackCallbacks) { try { cb({token:payload.token,path:payload.path}); } catch {} }
        accepted = false;
      }
      ipcRenderer.send('tab:transfer-ack', payload.token, accepted);
    };
    ipcRenderer.on('tab:incoming-transfer', handler);
    return () => ipcRenderer.removeListener('tab:incoming-transfer', handler);
  },
  onTabTransferCommit: callback => { const handler = (_event, payload) => callback(payload); ipcRenderer.on('tab:commit-transfer', handler); return () => ipcRenderer.removeListener('tab:commit-transfer', handler); },
  onTabTransferRollback: callback => { rollbackCallbacks.add(callback); const handler = (_event, payload) => { cancelledTransfers.add(payload.token); callback(payload); }; ipcRenderer.on('tab:rollback-transfer', handler); return () => { rollbackCallbacks.delete(callback); ipcRenderer.removeListener('tab:rollback-transfer', handler); }; },
  closeWindow: () => ipcRenderer.invoke('window:close'),
  cancelClose: () => ipcRenderer.invoke('window:cancel-close'),
  onCloseRequest: callback => { const handler = () => callback(); ipcRenderer.on('window:request-close', handler); return () => ipcRenderer.removeListener('window:request-close', handler); },
  openDropped: file => {
    const path = webUtils.getPathForFile(file);
    if (!path) throw new Error('无法获取拖入文件的路径');
    return ipcRenderer.invoke('document:open-path', path);
  },
  onOpen: callback => { const handler = (_event, doc) => callback(doc); ipcRenderer.on('document:opened', handler); ipcRenderer.send('document:ready'); return () => ipcRenderer.removeListener('document:opened', handler); },
  read: path => ipcRenderer.invoke('document:read', path),
  prepareHtml: (path, content) => ipcRenderer.invoke('document:prepare-html', path, content),
  save: document => ipcRenderer.invoke('document:save', document),
  saveAs: document => ipcRenderer.invoke('document:save-as', document),
  history: path => ipcRenderer.invoke('document:history', path),
  showFile: path => ipcRenderer.invoke('document:show', path),
  onChange: callback => { const handler = (_event, data) => callback(data); ipcRenderer.on('document:changed', handler); return () => ipcRenderer.removeListener('document:changed', handler); },
  onSaveShortcut: callback => { const handler = (_event, data) => callback(data?.saveAs === true); ipcRenderer.on('document:save-shortcut', handler); return () => ipcRenderer.removeListener('document:save-shortcut', handler); },
  platform: process.platform,
});
