'use strict';

// La lista, non /latest: nello stesso repo ci sono anche le release di Rombo Light (tag light-v*).
const RELEASES_API = 'https://api.github.com/repos/AlessioFerrari8/Rombo/releases?per_page=30';
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

/** Il tag piu' recente fra le release vere (non bozze, non prerelease) dell'edizione completa (vX.Y.Z). */
function pickLatest(releases) {
  if (!Array.isArray(releases)) return null;
  let best = null;
  for (const r of releases) {
    if (!r || r.draft === true || r.prerelease === true || typeof r.tag_name !== 'string' || !parseVersion(r.tag_name)) continue;
    if (!best || isNewer(r.tag_name, best)) best = r.tag_name;
  }
  return best;
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
    const list = Array.isArray(body) ? body : body && typeof body === 'object' ? [body] : [];
    if (!list.some((r) => r && typeof r.tag_name === 'string')) return { status: 'error' };
    const tag = pickLatest(list);
    if (tag && isNewer(tag, currentVersion)) return { status: 'available', version: tag.replace(/^v/, '') };
    return { status: 'current' };
  } catch {
    return { status: 'error' };
  }
}

module.exports = { RELEASES_PAGE, parseVersion, isNewer, pickLatest, checkForUpdate };
