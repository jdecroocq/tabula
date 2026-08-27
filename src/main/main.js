const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const store = require('./store');

let mainWindow;

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 900,
    minHeight: 800,
    title: "Tabula",
    icon: path.join(__dirname, 'assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  store.init();
  createWindow();

  ipcMain.handle('app:get-version', () => app.getVersion());

  ipcMain.handle('db:get-data', async () => store.readData());
  ipcMain.handle('db:add-transaction', async (e, tx) => store.addTransaction(tx));
  ipcMain.handle('db:update-transaction', async (e, tx) => store.updateTransaction(tx));
  ipcMain.handle('db:delete-transaction', async (e, id) => store.deleteTransaction(id));
  ipcMain.handle('db:update-categories', async (e, cats) => store.updateCategories(cats));
  ipcMain.handle('db:update-accounts', async (e, accs) => store.updateAccounts(accs));
  ipcMain.handle('db:open-data-folder', () => shell.showItemInFolder(store.getDataFilePath()));
  
  ipcMain.handle('db:reset-data', async () => {
    return store.resetToDefault();
  });

  ipcMain.handle('db:export-backup', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Exporter une sauvegarde Tabula',
      defaultPath: `tabula-backup-${new Date().toISOString().split('T')[0]}.json`,
      filters: [{ name: 'Fichier JSON Tabula', extensions: ['json'] }]
    });
    if (!canceled && filePath) {
      fs.copyFileSync(store.getDataFilePath(), filePath);
      return true;
    }
    return false;
  });

  ipcMain.handle('db:import-backup', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Importer une sauvegarde Tabula',
      filters: [{ name: 'Fichier JSON Tabula', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (!canceled && filePaths && filePaths[0]) {
      try {
        const raw = fs.readFileSync(filePaths[0], 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.accounts) && Array.isArray(parsed.transactions)) {
          store.writeData(parsed);
          return true;
        }
      } catch (err) {
        console.error("Fichier de sauvegarde invalide :", err);
      }
    }
    return false;
  });


  ipcMain.handle('app:open-external', (e, url) => shell.openExternal(url));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});