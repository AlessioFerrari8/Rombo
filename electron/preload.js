'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Unico ponte verso la pagina: pochi canali fissi, payload controllati, nessun percorso.
// La pagina non sceglie mai dove leggere o scrivere: lo decidono i dialog nativi del main.
let openFileListener = null;
let menuListener = null;

ipcRenderer.on('rombo:open-file', (_event, payload) => {
  if (!openFileListener || !payload || typeof payload.name !== 'string') return;
  if (payload.ok === true && typeof payload.text === 'string') {
    openFileListener({ ok: true, name: payload.name, text: payload.text });
  } else if (payload.ok === false && typeof payload.reason === 'string') {
    openFileListener({ ok: false, name: payload.name, reason: payload.reason });
  }
});

ipcRenderer.on('rombo:menu', (_event, command) => {
  if (menuListener && (command === 'new' || command === 'save-as')) menuListener(command);
});

contextBridge.exposeInMainWorld('rombo', {
  desktop: true,
  platform: process.platform,
  /** Un solo ascoltatore per tipo: registrarlo dice al main che la pagina e' pronta. */
  onOpenFile(cb) {
    if (typeof cb !== 'function') return;
    openFileListener = cb;
    ipcRenderer.send('rombo:ready');
  },
  onMenu(cb) {
    if (typeof cb === 'function') menuListener = cb;
  },
  /** Apre "Salva con nome" nativo; name e' solo il nome proposto. */
  saveFile(name, text) {
    if (typeof name !== 'string' || typeof text !== 'string') return Promise.resolve({ ok: false, reason: 'invalid' });
    return ipcRenderer.invoke('rombo:save-file', { name, text });
  },
});
