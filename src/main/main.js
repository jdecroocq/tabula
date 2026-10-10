const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const https = require('https');
const fs = require('fs');
const store = require('./store');

let mainWindow;

function createWindow () {

  const isWin = process.platform === 'win32';
  const appIcon = isWin 
    ? path.join(__dirname, 'assets/icon-win.png') 
    : path.join(__dirname, 'assets/icon.png');
    
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 850,
    minHeight: 600,
    title: "Tabula",
    icon: appIcon,
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
  ipcMain.handle('app:open-external', (e, url) => shell.openExternal(url));

  ipcMain.handle('db:get-data', async () => store.readData());
  ipcMain.handle('db:add-transaction', async (e, tx) => store.addTransaction(tx));
  ipcMain.handle('db:update-transaction', async (e, tx) => store.updateTransaction(tx));
  ipcMain.handle('db:delete-transaction', async (e, id) => store.deleteTransaction(id));
  ipcMain.handle('db:update-categories', async (e, cats) => store.updateCategories(cats));
  ipcMain.handle('db:update-accounts', async (e, accs) => store.updateAccounts(accs));
  ipcMain.handle('db:reset-data', async () => store.resetToDefault());

  ipcMain.handle('db:get-data-path', () => store.getDataFilePath());
  ipcMain.handle('db:get-missing-path', () => store.getMissingFilePath());
  ipcMain.handle('db:open-data-folder', () => shell.showItemInFolder(store.getDataFilePath()));

  ipcMain.handle('db:validate-file', async (e, filePath) => store.validateTabulaFile(filePath));

  ipcMain.handle('db:select-data-file', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Sélectionner un fichier Tabula',
      filters: [{ name: 'Base Tabula (.json)', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (!canceled && filePaths && filePaths[0]) {
      const validation = store.validateTabulaFile(filePaths[0]);
      return { path: filePaths[0], ...validation };
    }
    return null;
  });

  ipcMain.handle('db:set-data-path', async (event, newPath) => {
    const validation = store.validateTabulaFile(newPath);
    if (validation.valid) {
      store.setActiveDataFilePath(newPath);
      return { success: true };
    }
    return { success: false, error: validation.error };
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
      const validation = store.validateTabulaFile(filePaths[0]);
      if (validation.valid) {
        store.writeData(validation.data);
        return true;
      }
    }
    return false;
  });

  ipcMain.handle('app:check-update', async () => {
    const currentVersion = app.getVersion();

    return new Promise((resolve) => {
      const options = {
        hostname: 'api.github.com',
        path: '/repos/jdecroocq/tabula/releases/latest',
        method: 'GET',
        headers: { 'User-Agent': 'Tabula-App' },
        timeout: 10000
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const release = JSON.parse(body);
              const latestTag = release.tag_name || '';
              const latestVersion = latestTag.replace(/^v/, '');

              const [cMaj, cMin, cPat] = currentVersion.split('.').map(Number);
              const [lMaj, lMin, lPat] = latestVersion.split('.').map(Number);

              let hasUpdate = false;
              if (lMaj > cMaj) hasUpdate = true;
              else if (lMaj === cMaj && lMin > cMin) hasUpdate = true;
              else if (lMaj === cMaj && lMin === cMin && lPat > cPat) hasUpdate = true;

              resolve({
                success: true,
                hasUpdate: hasUpdate,
                currentVersion: currentVersion,
                latestVersion: latestVersion,
                releaseUrl: release.html_url,
                publishedAt: release.published_at ? release.published_at.split('T')[0] : '' // Date YYYY-MM-DD
              });
            } catch (e) {
              resolve({ success: false, error: 'parse_error' });
            }
          } else {
            resolve({ success: false, error: 'http_' + res.statusCode });
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'timeout' });
      });

      req.on('error', () => resolve({ success: false, error: 'network_error' }));
      req.end();
    });
  });


});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});