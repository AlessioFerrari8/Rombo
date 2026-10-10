'use strict';
// Dimensioni, posizione e "massimizzata" della finestra fra una sessione e l'altra.
const fs = require('node:fs');
const path = require('node:path');

const FILE = 'window-state.json';
const DEFAULTS = { width: 1360, height: 860 };
const MIN = { width: 900, height: 600 };
// quanto della barra del titolo deve restare su uno schermo per poterla riprendere col mouse
const VISIBLE = 64;

const isInt = (v) => Number.isInteger(v) && Math.abs(v) < 100_000;

function intersects(b, area) {
  const w = Math.min(b.x + b.width, area.x + area.width) - Math.max(b.x, area.x);
  const h = Math.min(b.y + VISIBLE, area.y + area.height) - Math.max(b.y, area.y);
  return w >= VISIBLE && h > 0;
}

/**
 * Valida lo stato letto da disco contro gli schermi attuali (workArea).
 * Valori assurdi -> default; finestra su uno schermo scollegato -> si tiene la misura e si centra.
 */
function sanitizeWindowState(raw, workAreas) {
  const out = { ...DEFAULTS, maximized: false };
  if (!raw || typeof raw !== 'object') return out;
  const areas = Array.isArray(workAreas) ? workAreas.filter((a) => a && isInt(a.width) && a.width > 0) : [];
  const maxW = Math.max(MIN.width, ...areas.map((a) => a.width));
  const maxH = Math.max(MIN.height, ...areas.map((a) => a.height));
  if (isInt(raw.width) && isInt(raw.height)) {
    out.width = Math.min(Math.max(raw.width, MIN.width), maxW);
    out.height = Math.min(Math.max(raw.height, MIN.height), maxH);
  }
  out.maximized = raw.maximized === true;
  if (isInt(raw.x) && isInt(raw.y)) {
    const b = { x: raw.x, y: raw.y, width: out.width, height: out.height };
    if (areas.some((a) => intersects(b, a))) {
      out.x = raw.x;
      out.y = raw.y;
    }
  }
  return out;
}

function loadWindowState(dir, workAreas) {
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(dir, FILE), 'utf8'));
  } catch {
    // primo avvio o file rovinato: si riparte dai default
  }
  return sanitizeWindowState(raw, workAreas);
}

/** Da chiamare alla chiusura: salva le misure "normali" anche se la finestra e' massimizzata. */
function saveWindowState(dir, win) {
  try {
    const b = win.getNormalBounds();
    const state = { x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() };
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, FILE), JSON.stringify(state));
  } catch (err) {
    console.error('window state not saved:', err);
  }
}

module.exports = { DEFAULTS, MIN, sanitizeWindowState, loadWindowState, saveWindowState };
