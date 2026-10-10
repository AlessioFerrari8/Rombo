'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DEFAULTS, MIN, sanitizeWindowState, loadWindowState, saveWindowState } = require('../electron/window-state');

const screen = [{ x: 0, y: 0, width: 1920, height: 1040 }];

test('stato valido: si tiene tutto', () => {
  assert.deepEqual(
    sanitizeWindowState({ x: 100, y: 50, width: 1200, height: 800, maximized: true }, screen),
    { x: 100, y: 50, width: 1200, height: 800, maximized: true },
  );
});

test('stato assente o rovinato: default, centrata', () => {
  const d = { ...DEFAULTS, maximized: false };
  assert.deepEqual(sanitizeWindowState(null, screen), d);
  assert.deepEqual(sanitizeWindowState('x', screen), d);
  assert.deepEqual(sanitizeWindowState({ x: 'a', y: null, width: NaN, height: 1e12, maximized: 'yes' }, screen), d);
});

test('schermo scollegato: misura tenuta, posizione scartata', () => {
  const r = sanitizeWindowState({ x: 2500, y: 100, width: 1200, height: 800 }, screen);
  assert.deepEqual(r, { width: 1200, height: 800, maximized: false });
});

test('finestra quasi tutta fuori: la barra del titolo deve restare raggiungibile', () => {
  assert.equal(sanitizeWindowState({ x: 1900, y: 100, width: 1000, height: 700 }, screen).x, undefined);
  assert.equal(sanitizeWindowState({ x: 100, y: -500, width: 1000, height: 700 }, screen).x, undefined);
  assert.equal(sanitizeWindowState({ x: -200, y: 0, width: 1000, height: 700 }, screen).x, -200);
});

test('misure fuori scala vengono riportate fra minimo e schermo', () => {
  const r = sanitizeWindowState({ width: 10, height: 99999 }, screen);
  assert.deepEqual([r.width, r.height], [MIN.width, 1040]);
});

test('secondo schermo a sinistra', () => {
  const two = [...screen, { x: -1280, y: 0, width: 1280, height: 1000 }];
  assert.equal(sanitizeWindowState({ x: -1200, y: 10, width: 1000, height: 700 }, two).x, -1200);
});

test('load/save su file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rombo-ws-'));
  try {
    assert.deepEqual(loadWindowState(dir, screen), { ...DEFAULTS, maximized: false });
    const win = { getNormalBounds: () => ({ x: 10, y: 20, width: 1000, height: 700 }), isMaximized: () => true };
    saveWindowState(path.join(dir, 'sub'), win);
    assert.deepEqual(loadWindowState(path.join(dir, 'sub'), screen), { x: 10, y: 20, width: 1000, height: 700, maximized: true });
    fs.writeFileSync(path.join(dir, 'window-state.json'), '{rotto');
    assert.deepEqual(loadWindowState(dir, screen), { ...DEFAULTS, maximized: false });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
