const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tabula', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  getData: () => ipcRenderer.invoke('db:get-data'),
  addTransaction: (tx) => ipcRenderer.invoke('db:add-transaction', tx),
  updateTransaction: (tx) => ipcRenderer.invoke('db:update-transaction', tx),
  deleteTransaction: (id) => ipcRenderer.invoke('db:delete-transaction', id),
  updateCategories: (cats) => ipcRenderer.invoke('db:update-categories', cats),
  updateAccounts: (accs) => ipcRenderer.invoke('db:update-accounts', accs),
  resetData: () => ipcRenderer.invoke('db:reset-data'),
  getDataPath: () => ipcRenderer.invoke('db:get-data-path'),
  getMissingPath: () => ipcRenderer.invoke('db:get-missing-path'),
  openDataFolder: () => ipcRenderer.invoke('db:open-data-folder'),
  selectDataFile: () => ipcRenderer.invoke('db:select-data-file'),
  setDataPath: (path) => ipcRenderer.invoke('db:set-data-path', path),
  exportBackup: () => ipcRenderer.invoke('db:export-backup'),
  importBackup: () => ipcRenderer.invoke('db:import-backup'),
  validateFile: (filePath) => ipcRenderer.invoke('db:validate-file', filePath),
  checkUpdate: () => ipcRenderer.invoke('app:check-update'),
});