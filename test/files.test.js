'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  MAX_BYTES, MAX_FILES_PER_LAUNCH, hasAllowedExtension, filesFromArgv, readDiagramFile,
  safeFileName, validateSavePayload, withDiagramExtension,
} = require('../electron/files');

test('hasAllowedExtension accetta solo .rombo e .json', () => {
  assert.equal(hasAllowedExtension('/a/b.rombo'), true);
  assert.equal(hasAllowedExtension('C:\\x\\B.ROMBO'), true);
  assert.equal(hasAllowedExtension('b.json'), true);
  assert.equal(hasAllowedExtension('b.er.json'), true);
  assert.equal(hasAllowedExtension('b.txt'), false);
  assert.equal(hasAllowedExtension('rombo'), false);
  assert.equal(hasAllowedExtension(undefined), false);
});

test('filesFromArgv scarta eseguibile, app path e opzioni', () => {
  const cwd = path.resolve('/home/u');
  assert.deepEqual(filesFromArgv(['/opt/Rombo/rombo', '--no-sandbox', 'a.rombo'], cwd), [path.join(cwd, 'a.rombo')]);
  assert.deepEqual(filesFromArgv(['electron', '.', '/tmp/x.json', '--inspect=0'], cwd), [path.resolve('/tmp/x.json')]);
  // l'eseguibile stesso non viene mai preso, nemmeno con un nome "ammesso"
  assert.deepEqual(filesFromArgv(['/weird/app.rombo'], cwd), []);
  assert.deepEqual(filesFromArgv(['rombo', '--file=evil.rombo', 'notes.txt'], cwd), []);
});

test('filesFromArgv deduplica e limita', () => {
  const many = ['rombo', 'a.rombo', 'a.rombo', ...Array.from({ length: 30 }, (_, i) => `f${i}.rombo`)];
  const r = filesFromArgv(many, '/w');
  assert.equal(r.length, MAX_FILES_PER_LAUNCH);
  assert.equal(new Set(r).size, r.length);
});

test('filesFromArgv tollera input non validi', () => {
  assert.deepEqual(filesFromArgv(null, '/w'), []);
  assert.deepEqual(filesFromArgv(['rombo', 42, {}], '/w'), []);
});

test('readDiagramFile legge, rifiuta estensioni, file grandi e cartelle', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rombo-test-'));
  try {
    const ok = path.join(dir, 'd.rombo');
    fs.writeFileSync(ok, '{"version":1}');
    assert.deepEqual(await readDiagramFile(ok), { ok: true, name: 'd.rombo', text: '{"version":1}' });

    const big = path.join(dir, 'big.json');
    fs.writeFileSync(big, Buffer.alloc(MAX_BYTES + 1, 32));
    assert.deepEqual(await readDiagramFile(big), { ok: false, name: 'big.json', reason: 'too-big' });

    const txt = path.join(dir, 'x.txt');
    fs.writeFileSync(txt, '{}');
    assert.equal((await readDiagramFile(txt)).reason, 'extension');

    const folder = path.join(dir, 'cartella.rombo');
    fs.mkdirSync(folder);
    assert.equal((await readDiagramFile(folder)).reason, 'unreadable');
    assert.equal((await readDiagramFile(path.join(dir, 'manca.rombo'))).reason, 'unreadable');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('safeFileName toglie percorsi e caratteri vietati', () => {
  assert.equal(safeFileName('gestione-carrozzeria'), 'gestione-carrozzeria.rombo');
  assert.equal(safeFileName('../../etc/passwd'), 'etcpasswd.rombo');
  assert.equal(safeFileName('C:\\Windows\\x.json'), 'CWindowsx.json');
  assert.equal(safeFileName('a.rombo'), 'a.rombo');
  assert.equal(safeFileName(''), 'diagramma.rombo');
  assert.equal(safeFileName('...'), 'diagramma.rombo');
  assert.equal(safeFileName(null), 'diagramma.rombo');
  assert.ok(safeFileName('x'.repeat(500)).length <= 126);
});

test('validateSavePayload controlla tipi, dimensione e JSON', () => {
  assert.deepEqual(validateSavePayload({ name: 'a', text: '{}' }), { name: 'a.rombo', text: '{}' });
  assert.equal(validateSavePayload(null), null);
  assert.equal(validateSavePayload({ name: 1, text: '{}' }), null);
  assert.equal(validateSavePayload({ name: 'a', text: 'non json' }), null);
  assert.equal(validateSavePayload({ name: 'a'.repeat(201), text: '{}' }), null);
  assert.equal(validateSavePayload({ name: 'a', text: `"${'x'.repeat(MAX_BYTES)}"` }), null);
});

test('withDiagramExtension aggiunge .rombo solo se serve', () => {
  assert.equal(withDiagramExtension('/h/a'), '/h/a.rombo');
  assert.equal(withDiagramExtension('/h/a.json'), '/h/a.json');
  assert.equal(withDiagramExtension('/h/a.txt'), '/h/a.txt.rombo');
});
