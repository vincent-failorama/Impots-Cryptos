const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const net  = require('net');

/** Port privilégié ; on bascule sur un port libre s'il est déjà pris. */
const PREFERRED_PORT = 3000;

let port = PREFERRED_PORT;
let mainWindow = null;

/** Teste si un port est disponible en écoute sur la boucle locale. */
function isPortFree(candidate) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(candidate, '127.0.0.1', () => {
      probe.close(() => resolve(true));
    });
  });
}

/** Demande à l'OS d'attribuer un port libre (écoute sur le port 0). */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port: assigned } = probe.address();
      probe.close(() => resolve(assigned));
    });
  });
}

/**
 * Résout le port d'écoute.
 *
 * Le port 3000 était figé : si une autre application l'occupait — un serveur de
 * développement, une autre instance — l'application ne démarrait pas du tout.
 * On conserve 3000 quand il est libre (URL prévisible, utile au débogage) et on
 * se rabat sinon sur un port attribué par le système.
 */
async function resolvePort() {
  if (await isPortFree(PREFERRED_PORT)) return PREFERRED_PORT;
  return findFreePort();
}

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
  process.env.PORT      = String(port);
  process.env.HOSTNAME  = '127.0.0.1';
  process.env.NODE_ENV  = 'production';
  process.env.DATA_DIR  = dataDir;

  // On lance le serveur Next.js standalone directement dans le process Electron
  // (Electron embarque Node.js, pas besoin de binary externe)
  const serverPath = path.join(getStandaloneDir(), 'server.js');
  require(serverPath);
}

/**
 * Attend que le serveur réponde, plutôt que de parier sur un délai fixe.
 * Sur une machine lente, un délai constant ouvrait la fenêtre trop tôt et
 * affichait une page d'erreur au lieu de l'application.
 */
async function waitForServer(timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) return true;
    } catch {
      // serveur pas encore à l'écoute
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    title: 'crypto-tax-fr',
    // La fenêtre reste masquée jusqu'au premier rendu : évite le flash blanc
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  try {
    port = await resolvePort();
  } catch {
    // Aucun port attribuable : on tente tout de même le port par défaut
    port = PREFERRED_PORT;
  }

  startServer();

  const ready = await waitForServer();
  if (!ready) {
    dialog.showErrorBox(
      'Démarrage impossible',
      `Le serveur local n'a pas répondu sur le port ${port}.\n\n` +
      `Relancez l'application. Si le problème persiste, redémarrez votre ordinateur.`
    );
    app.quit();
    return;
  }

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
