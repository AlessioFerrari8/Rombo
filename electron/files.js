'use strict';
// Logica pura (o quasi: solo fs in lettura) del guscio, separata da main.js per testarla con node --test.
const fs = require('node:fs/promises');
const path = require('node:path');

const EXTENSIONS = ['.rombo', '.json'];
const MAX_BYTES = 2_000_000;
// "Apri con" su tanti file insieme: oltre questo numero e' quasi certamente un errore
const MAX_FILES_PER_LAUNCH = 10;
const MAX_NAME = 120;

function hasAllowedExtension(p) {
  return typeof p === 'string' && EXTENSIONS.includes(path.extname(p).toLowerCase());
}

/**
 * File da aprire passati sulla riga di comando (doppio clic, "Apri con", seconda istanza).
 * Scarta opzioni, eseguibile e app path: tengono solo le estensioni ammesse.
 */
function filesFromArgv(argv, cwd) {
  if (!Array.isArray(argv)) return [];
  const out = [];
  for (const arg of argv.slice(1)) {
    if (typeof arg !== 'string' || arg.startsWith('-') || !hasAllowedExtension(arg)) continue;
    const abs = path.resolve(typeof cwd === 'string' && cwd ? cwd : process.cwd(), arg);
    if (!out.includes(abs)) out.push(abs);
    if (out.length === MAX_FILES_PER_LAUNCH) break;
  }
  return out;
}

/**
 * Legge un diagramma da disco per mandarlo alla pagina. Non lancia mai:
 * risponde { ok, name, text } oppure { ok: false, name, reason }.
 */
async function readDiagramFile(file) {
  const name = path.basename(String(file));
  if (!hasAllowedExtension(file)) return { ok: false, name, reason: 'extension' };
  try {
    const st = await fs.stat(file);
    if (!st.isFile()) return { ok: false, name, reason: 'unreadable' };
    if (st.size > MAX_BYTES) return { ok: false, name, reason: 'too-big' };
    const text = await fs.readFile(file, 'utf8');
    // il file puo' essere cresciuto fra stat e read
    if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) return { ok: false, name, reason: 'too-big' };
    return { ok: true, name, text };
  } catch {
    return { ok: false, name, reason: 'unreadable' };
  }
}

/** Nome proposto nel dialog "Salva con nome": solo un nome file, mai un percorso. */
function safeFileName(name) {
  let base = typeof name === 'string' ? name : '';
  base = base
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, MAX_NAME);
  if (!base) base = 'diagramma';
  return hasAllowedExtension(base) ? base : `${base}.rombo`;
}

/** Payload di rombo:save-file dalla pagina: { name: string, text: JSON <= 2 MB }. */
function validateSavePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const { name, text } = payload;
  if (typeof name !== 'string' || name.length > 200 || typeof text !== 'string') return null;
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) return null;
  try {
    JSON.parse(text);
  } catch {
    return null;
  }
  return { name: safeFileName(name), text };
}

/** Il dialog GTK non aggiunge l'estensione da solo: se manca (o non e' ammessa) mettiamo .rombo. */
function withDiagramExtension(file) {
  return hasAllowedExtension(file) ? file : `${file}.rombo`;
}

module.exports = {
  EXTENSIONS,
  MAX_BYTES,
  MAX_FILES_PER_LAUNCH,
  hasAllowedExtension,
  filesFromArgv,
  readDiagramFile,
  safeFileName,
  validateSavePayload,
  withDiagramExtension,
};
