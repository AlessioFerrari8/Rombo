'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { resolveEdition } = require('../electron/edition');
const { verify, findForbidden } = require('../tools/verify-light-bundle');

test('resolveEdition: completa di default, Light da package.json (build) o da --edition=light/ROMBO_EDITION (sviluppo)', () => {
  const full = resolveEdition({}, {}, []);
  assert.deepEqual(full, { light: false, productName: 'Rombo', userDataName: 'Rombo', updates: true });
  const light = { light: true, productName: 'Rombo Light', userDataName: 'Rombo Light', updates: false };
  assert.deepEqual(resolveEdition({ rombo: { edition: 'light' } }, {}, []), light);
  assert.deepEqual(resolveEdition({}, { ROMBO_EDITION: 'light' }, []), light);
  assert.deepEqual(resolveEdition({}, {}, ['electron', '.', '--edition=light']), light);
  assert.equal(resolveEdition({ rombo: { edition: 'boh' } }, { ROMBO_EDITION: 'x' }, ['--edition=x']).light, false);
});

test('verify-light-bundle: riconosce le frasi del logico/SQL e pretende il marcatore Light', () => {
  assert.deepEqual(findForbidden('const x = "CREATE TABLE " + y; label: "Schema logico"'), ['CREATE TABLE', 'Schema logico']);
  assert.deepEqual(findForbidden('Rombo Light: solo ER'), []);
  const fs = require('node:fs');
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rombo-light-'));
  fs.writeFileSync(path.join(dir, 'main.js'), 'title="Rombo Light"');
  assert.deepEqual(verify(dir), []);
  fs.writeFileSync(path.join(dir, 'chunk.js'), 'ddl="CREATE TABLE"');
  assert.deepEqual(verify(dir), ['chunk.js: «CREATE TABLE»']);
  fs.rmSync(dir, { recursive: true });
});

test("il logico e l'SQL entrano nell'app solo dai due confini sostituiti nella build light", () => {
  const fs = require('node:fs');
  const app = path.join(__dirname, '..', 'web', 'src', 'app');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts') ? [path.join(dir, e.name)] : []);
  // moduli che esistono solo nell'edizione completa
  const logical = /(domain\/(logical[\w-]*|ddl|validate-logical|sql-type)|editor\/(logical-[\w-]+|sql-panel|regenerate-dialog|type-picker)(\/[\w-]+)?)$/;
  const rel = (f) => path.relative(app, f).replace(/\\/g, '/').replace(/\.ts$/, '');
  const isLogical = (r) => logical.test(r) || r.startsWith('domain/fixtures/');
  // I due confini + le schede di testo di Rombo Light, che ricavano il modello dall'ER (solo toLogical, niente SQL ne' editor).
  const boundaries = new Set([
    'edition/logical-domain', 'edition/logical-ui', 'edition/logical-domain.light', 'edition/logical-ui.light',
    'domain/doc-text', 'editor/light-text/light-text',
  ]);
  const offenders = [];
  for (const f of walk(app)) {
    const from = rel(f);
    if (isLogical(from) || boundaries.has(from)) continue;
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/^import\s+(?!type\b)[^;]*?from\s+'(\.[^']+)'/gms)) {
      const target = rel(path.resolve(path.dirname(f), m[1]) + '.ts');
      if (isLogical(target)) offenders.push(`${from} -> ${target}`);
    }
  }
  assert.deepEqual(offenders, []);
});
