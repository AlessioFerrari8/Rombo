'use strict';

const RELEASES_API = 'https://api.github.com/repos/AlessioFerrari8/Rombo/releases/latest';
const RELEASES_PAGE = 'https://github.com/AlessioFerrari8/Rombo/releases/latest';

/** "v1.3.0" -> [1, 3, 0]; null se non e' una versione semplice X.Y.Z. */
function parseVersion(text) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(text ?? '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** true solo se `latest` e' strettamente piu' recente di `current`. */
function isNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/**
 * Chiede a GitHub l'ultima release. Esito: { status: 'available', version } | { status: 'current' } | { status: 'error' }.
 * Non scarica ne' installa niente: serve solo a sapere se esiste una versione piu' nuova.
 */
async function checkForUpdate(currentVersion, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { status: 'error' };
    const body = await res.json();
    const tag = body && typeof body.tag_name === 'string' ? body.tag_name : '';
    if (body && body.draft !== true && body.prerelease !== true && isNewer(tag, currentVersion)) {
      return { status: 'available', version: tag.replace(/^v/, '') };
    }
    return parseVersion(tag) ? { status: 'current' } : { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}

module.exports = { RELEASES_PAGE, parseVersion, isNewer, checkForUpdate };
