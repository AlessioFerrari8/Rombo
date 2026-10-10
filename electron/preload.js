'use strict';
const { contextBridge } = require('electron');

// Unico ponte verso la pagina: dice solo "sono il desktop". Niente Node, niente IPC.
contextBridge.exposeInMainWorld('rombo', {
  desktop: true,
  platform: process.platform,
});
