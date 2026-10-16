'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseVersion, isNewer, checkForUpdate, pickLatest } = require('../electron/updates');

const reply = (body, ok = true) => async () => ({ ok, json: async () => body });

test('parseVersion accetta solo X.Y.Z, con o senza v', () => {
  assert.deepEqual(parseVersion('v1.3.0'), [1, 3, 0]);
  assert.deepEqual(parseVersion('1.10.2'), [1, 10, 2]);
  assert.equal(parseVersion('1.3'), null);
  assert.equal(parseVersion('v1.3.0-beta'), null);
  assert.equal(parseVersion(undefined), null);
});

test('isNewer confronta numericamente e non considera uguali o inferiori', () => {
  assert.equal(isNewer('v1.3.0', '1.2.0'), true);
  assert.equal(isNewer('1.10.0', '1.9.9'), true);
  assert.equal(isNewer('1.3.0', '1.3.0'), false);
  assert.equal(isNewer('1.2.9', '1.3.0'), false);
  assert.equal(isNewer('boh', '1.3.0'), false);
});

test('checkForUpdate: nuova versione, aggiornato, bozze e prerelease ignorate', async () => {
  assert.deepEqual(await checkForUpdate('1.3.0', reply({ tag_name: 'v1.4.0' })), { status: 'available', version: '1.4.0' });
  assert.deepEqual(await checkForUpdate('1.3.0', reply({ tag_name: 'v1.3.0' })), { status: 'current' });
  assert.deepEqual(await checkForUpdate('1.3.0', reply({ tag_name: 'v1.4.0', prerelease: true })), { status: 'current' });
  assert.deepEqual(await checkForUpdate('1.3.0', reply({ tag_name: 'v1.4.0', draft: true })), { status: 'current' });
});

test('checkForUpdate: errori di rete, HTTP o risposta strana -> error', async () => {
  assert.deepEqual(await checkForUpdate('1.3.0', async () => { throw new Error('offline'); }), { status: 'error' });
  assert.deepEqual(await checkForUpdate('1.3.0', reply({}, false)), { status: 'error' });
  assert.deepEqual(await checkForUpdate('1.3.0', reply({ tag_name: 42 })), { status: 'error' });
  assert.deepEqual(await checkForUpdate('1.3.0', reply(null)), { status: 'error' });
});

test('pickLatest: tra le release sceglie la piu\' recente della propria edizione, ignorando light-v*, bozze e prerelease', () => {
  const list = [
    { tag_name: 'light-v1.0.0' },
    { tag_name: 'v1.5.0', draft: true },
    { tag_name: 'v1.4.9', prerelease: true },
    { tag_name: 'v1.4.4' },
    { tag_name: 'v1.4.3' },
  ];
  assert.equal(pickLatest(list), 'v1.4.4');
  assert.equal(pickLatest([{ tag_name: 'light-v1.0.0' }]), null);
  assert.equal(pickLatest('boh'), null);
});

test('checkForUpdate: legge la lista delle release, non /latest (che potrebbe essere una Light)', async () => {
  let asked = '';
  const fetchImpl = async (url) => {
    asked = url;
    return { ok: true, json: async () => [{ tag_name: 'light-v2.0.0' }, { tag_name: 'v1.5.0' }] };
  };
  assert.deepEqual(await checkForUpdate('1.4.4', fetchImpl), { status: 'available', version: '1.5.0' });
  assert.match(asked, /\/releases\?per_page=/);
});
