const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs   = require('fs');

const PORT = 3000;
let mainWindow = null;

function getStandaloneDir() {
  // En production, les fichiers asarUnpack sont dans app.asar.unpacked
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', '.next', 'standalone');
  }
  return path.join(__dirname, '..', '.next', 'standalone');
}

function startServer() {
  const dataDir = path.join(app.getPath('userData'), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  // Passer le dossier data au serveur via variable d'environnement
  process.env.PORT      = String(PORT);
  process.env.HOSTNAME  = '127.0.0.1';
  process.env.NODE_ENV  = 'production';
  process.env.DATA_DIR  = dataDir;

  // On lance le serveur Next.js standalone directement dans le process Electron
  // (Electron embarque Node.js, pas besoin de binary externe)
  const serverPath = path.join(getStandaloneDir(), 'server.js');
  require(serverPath);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    title: 'crypto-tax-fr',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  startServer();
  // Laisser 1,5 s au serveur Next.js pour démarrer avant d'ouvrir la fenêtre
  setTimeout(createWindow, 1500);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
