const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tabula', {
  getData: () => ipcRenderer.invoke('db:get-data'),
  addTransaction: (tx) => ipcRenderer.invoke('db:add-transaction', tx),
  deleteTransaction: (id) => ipcRenderer.invoke('db:delete-transaction', id),
  updateTransaction: (tx) => ipcRenderer.invoke('db:update-transaction', tx),
  updateCategories: (cats) => ipcRenderer.invoke('db:update-categories', cats),
  updateAccounts: (accs) => ipcRenderer.invoke('db:update-accounts', accs),
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  exportBackup: () => ipcRenderer.invoke('db:export-backup'),
  importBackup: () => ipcRenderer.invoke('db:import-backup'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  resetData: () => ipcRenderer.invoke('db:reset-data'),
  openDataFolder: () => ipcRenderer.invoke('db:open-data-folder'),
});