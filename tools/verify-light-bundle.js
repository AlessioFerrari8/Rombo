#!/usr/bin/env node
'use strict';
// Controlla che la build web di Rombo Light non contenga niente del modello logico ne' dell'SQL.
// Uso: node tools/verify-light-bundle.js [cartella]   (default: web/dist/frontend/browser)
const fs = require('node:fs');
const path = require('node:path');

/** Frasi che esistono solo nel modo Logico, nei pannelli Schema logico/SQL e nel generatore DDL. */
const FORBIDDEN = [
  'CREATE TABLE',
  'FOREIGN KEY',
  'PRIMARY KEY',
  'ENGINE=InnoDB',
  'Schema logico',
  'SQL PostgreSQL',
  'SQL MySQL',
  "Genera dall'ER",
  'Sostituire lo schema logico',
  'Tipo SQL',
  'Nome della tabella',
];
/** Senza questo non e' una build light (es. qualcuno ha lanciato la build completa). */
const MARKER = 'Rombo Light';

function findForbidden(text) {
  return FORBIDDEN.filter((s) => text.includes(s));
}

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.(js|mjs|html)$/.test(e.name) ? [p] : [];
  });
}

function verify(dir) {
  const problems = [];
  let marker = false;
  for (const f of files(dir)) {
    const text = fs.readFileSync(f, 'utf8');
    if (text.includes(MARKER)) marker = true;
    for (const s of findForbidden(text)) problems.push(`${path.relative(dir, f)}: «${s}»`);
  }
  if (!marker) problems.push(`nessun file contiene «${MARKER}»: non sembra una build light`);
  return problems;
}

module.exports = { FORBIDDEN, MARKER, findForbidden, verify };

if (require.main === module) {
  const dir = path.resolve(process.argv[2] ?? path.join(__dirname, '..', 'web', 'dist', 'frontend', 'browser'));
  if (!fs.existsSync(dir)) {
    console.error(`verify-light-bundle: ${dir} non esiste (prima: npm run web:build:light)`);
    process.exit(2);
  }
  const problems = verify(dir);
  if (problems.length) {
    console.error('verify-light-bundle: la build light contiene parti dell\'edizione completa:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`verify-light-bundle: ok (${dir})`);
}
