'use strict';

/**
 * Edizione dell'app desktop. Nei pacchetti la decide electron-builder.light.yml (extraMetadata.rombo.edition
 * in package.json); in sviluppo `electron . --edition=light` oppure ROMBO_EDITION=light.
 * Light: nome e cartella dati propri (si installa accanto alla completa) e nessun controllo aggiornamenti.
 */
function resolveEdition(pkg, env, argv) {
  const light =
    pkg?.rombo?.edition === 'light' ||
    env?.ROMBO_EDITION === 'light' ||
    (Array.isArray(argv) && argv.includes('--edition=light'));
  return light
    ? { light: true, productName: 'Rombo Light', userDataName: 'Rombo Light', updates: false }
    : { light: false, productName: 'Rombo', userDataName: 'Rombo', updates: true };
}

module.exports = { resolveEdition };
