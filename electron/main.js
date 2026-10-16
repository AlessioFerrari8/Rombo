'use strict';
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, net, screen, shell, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { filesFromArgv, readDiagramFile, validateSavePayload, withDiagramExtension } = require('./files');
const { loadWindowState, saveWindowState } = require('./window-state');
const { RELEASES_PAGE, checkForUpdate } = require('./updates');
const { resolveEdition } = require('./edition');

const EDITION = resolveEdition(require('../package.json'), process.env, process.argv);
// Rombo Light ha nome e dati suoi (IndexedDB, finestra, istanza singola): convive con la completa.
if (EDITION.light) {
  app.setName(EDITION.productName);
  app.setPath('userData', path.join(app.getPath('appData'), EDITION.userDataName));
}

const SCHEME = 'app';
const HOST = 'rombo';
const ROOT = path.join(__dirname, '..', 'web', 'dist', 'frontend', 'browser');
const CSP =
  "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; " +
  "connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

// Origine stabile e "sicura": e' li' che vivono i diagrammi (IndexedDB).
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWindow = null;
// file chiesti dal sistema (argv, open-file) prima che la pagina sia pronta a riceverli
const pendingFiles = [];
let pendingMenu = null;
let rendererReady = false;
let flushing = false;
let saving = false;

// macOS: doppio clic su un .rombo, anche ad app chiusa (arriva prima di 'ready')
app.on('open-file', (event, file) => {
  event.preventDefault();
  queueFile(file);
});

function serveApp() {
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.host !== HOST) return new Response('Not found', { status: 404 });
    let rel = decodeURIComponent(url.pathname);
    // senza estensione e' una rotta dell'SPA: serve index.html
    if (!path.extname(rel)) rel = '/index.html';
    const file = path.normalize(path.join(ROOT, rel));
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
      return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}

function isOwnUrl(u) {
  try {
    const p = new URL(u);
    return p.protocol === `${SCHEME}:` && p.host === HOST;
  } catch {
    return false;
  }
}

function queueFile(file) {
  pendingFiles.push(file);
  if (app.isReady() && !mainWindow) createWindow();
  else void flushFiles();
  focusWindow();
}

async function flushFiles() {
  // uno alla volta e in ordine: l'ultimo file aperto e' quello che resta a schermo
  if (flushing) return;
  flushing = true;
  try {
    while (rendererReady && mainWindow && pendingFiles.length) {
      const result = await readDiagramFile(pendingFiles.shift());
      if (!result.ok) console.warn(`cannot open ${result.name}: ${result.reason}`);
      mainWindow?.webContents.send('rombo:open-file', result);
    }
  } finally {
    flushing = false;
  }
}

function focusWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

/** Solo la nostra pagina, nella finestra principale, puo' usare l'IPC. */
function trustedSender(event) {
  return !!mainWindow && event.sender === mainWindow.webContents && isOwnUrl(event.senderFrame?.url ?? '');
}

async function openWithDialog() {
  const opts = {
    title: 'Apri diagramma',
    properties: ['openFile'],
    filters: [
      { name: 'Diagrammi Rombo', extensions: ['rombo', 'json'] },
      { name: 'Tutti i file', extensions: ['*'] },
    ],
  };
  // macOS puo' non avere finestre aperte: dialog libero, la finestra nasce col file
  const r = mainWindow ? await dialog.showOpenDialog(mainWindow, opts) : await dialog.showOpenDialog(opts);
  if (!r.canceled && r.filePaths[0]) queueFile(r.filePaths[0]);
}

async function saveWithDialog(event, payload) {
  if (!trustedSender(event)) return { ok: false, reason: 'forbidden' };
  const data = validateSavePayload(payload);
  if (!data) return { ok: false, reason: 'invalid' };
  // un dialog alla volta, anche se la pagina insiste
  if (saving) return { ok: false, reason: 'busy' };
  saving = true;
  try {
    const r = await dialog.showSaveDialog(mainWindow, {
      title: 'Salva diagramma con nome',
      defaultPath: path.join(app.getPath('documents'), data.name),
      filters: [{ name: 'Diagramma Rombo', extensions: ['rombo'] }],
      properties: ['showOverwriteConfirmation', 'createDirectory'],
    });
    if (r.canceled || !r.filePath) return { ok: false, reason: 'canceled' };
    const file = withDiagramExtension(r.filePath);
    await fs.writeFile(file, data.text, 'utf8');
    return { ok: true, name: path.basename(file) };
  } catch (err) {
    console.error('save failed:', err);
    return { ok: false, reason: 'write' };
  } finally {
    saving = false;
  }
}

function sendMenu(command) {
  if (rendererReady && mainWindow) {
    mainWindow.webContents.send('rombo:menu', command);
    return;
  }
  // macOS senza finestre: il comando parte appena la pagina e' pronta
  pendingMenu = command;
  if (!mainWindow) createWindow();
}

function createWindow() {
  const stateDir = app.getPath('userData');
  const state = loadWindowState(stateDir, screen.getAllDisplays().map((d) => d.workArea));
  rendererReady = false;
  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#faf6ee',
    title: EDITION.productName,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  mainWindow.once('ready-to-show', () => {
    if (state.maximized) mainWindow.maximize();
    mainWindow.show();
  });
  mainWindow.on('close', () => saveWindowState(stateDir, mainWindow));
  mainWindow.on('closed', () => {
    mainWindow = null;
    rendererReady = false;
  });
  // ricarica o nuova pagina: il listener della pagina e' sparito, si aspetta un nuovo "ready"
  mainWindow.webContents.on('did-start-navigation', ({ isMainFrame, isSameDocument }) => {
    if (isMainFrame && !isSameDocument) rendererReady = false;
  });

  // la pagina non esce mai dalla sua origine: i link esterni vanno al browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isOwnUrl(url)) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });

  void mainWindow.loadURL(`${SCHEME}://${HOST}/`);
}

/** Chiede a GitHub se c'e' una versione piu' nuova; `manual` mostra anche "aggiornato" ed errori. */
async function checkUpdates(manual) {
  const result = await checkForUpdate(app.getVersion());
  if (result.status === 'available') {
    const { response } = await dialog.showMessageBox(mainWindow ?? undefined, {
      type: 'info',
      title: 'Aggiornamento disponibile',
      message: `È disponibile Rombo ${result.version}`,
      detail: `Stai usando la versione ${app.getVersion()}. Scarica il nuovo installer dalla pagina delle release.`,
      buttons: ['Scarica', 'Più tardi'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) void shell.openExternal(RELEASES_PAGE);
  } else if (manual) {
    await dialog.showMessageBox(mainWindow ?? undefined, {
      type: result.status === 'current' ? 'info' : 'warning',
      title: 'Aggiornamenti',
      message: result.status === 'current' ? 'Rombo è aggiornato' : 'Impossibile controllare gli aggiornamenti',
      detail: result.status === 'current' ? `Versione ${app.getVersion()}.` : 'Controlla la connessione e riprova.',
    });
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Nuovo diagramma', accelerator: 'CmdOrCtrl+N', click: () => sendMenu('new') },
        { label: 'Apri…', accelerator: 'CmdOrCtrl+O', click: () => void openWithDialog() },
        { type: 'separator' },
        { label: 'Salva con nome…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendMenu('save-as') },
        { type: 'separator' },
        isMac ? { role: 'close', label: 'Chiudi finestra' } : { role: 'quit', label: 'Esci' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Vista',
      submenu: [
        { role: 'resetZoom', label: 'Zoom normale' },
        { role: 'zoomIn', label: 'Ingrandisci' },
        { role: 'zoomOut', label: 'Riduci' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Schermo intero' },
      ],
    },
    { role: 'windowMenu' },
    // Light (maturita'): niente rete e niente dialog a sorpresa, quindi niente aggiornamenti
    ...(EDITION.updates
      ? [{ label: 'Aiuto', submenu: [{ label: 'Cerca aggiornamenti…', click: () => void checkUpdates(true) }] }]
      : []),
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('second-instance', (_event, argv, workingDirectory) => {
  // doppio clic su un .rombo con Rombo gia' aperto: il file arriva qui
  const files = filesFromArgv(argv, workingDirectory);
  if (files.length) for (const f of files) queueFile(f);
  else focusWindow();
});

ipcMain.on('rombo:ready', (event) => {
  if (!trustedSender(event)) return;
  rendererReady = true;
  if (pendingMenu) mainWindow.webContents.send('rombo:menu', pendingMenu);
  pendingMenu = null;
  void flushFiles();
});
ipcMain.handle('rombo:save-file', saveWithDialog);

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP] } });
  });
  // nessun permesso (camera, notifiche, ...) serve a questa app
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  serveApp();
  buildMenu();
  // Windows/Linux: file passati all'avvio (doppio clic, "Apri con")
  pendingFiles.push(...filesFromArgv(process.argv, process.cwd()));
  createWindow();
  if (EDITION.updates) setTimeout(() => void checkUpdates(false), 5000);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
