// =====================================================================
// sync.js — synchronisation automatique du Google Sheets
// Le fichier data/sync.enc contient les feuilles TRAINING et TRACKING,
// chiffrées (AES-256 + PBKDF2, format OpenSSL « Salted__ »). Sans la clé,
// personne ne peut le lire, même s'il est publié avec l'app.
// La clé n'est jamais envoyée : elle est saisie une fois via un lien
// (…/#cle=XXXX, la partie après # ne quitte pas le navigateur) et gardée
// sur l'appareil. À chaque ouverture, une nouvelle version est intégrée
// automatiquement (copie de sécurité avant, séances de l'app jamais touchées).
// =====================================================================
import { S, kvSet } from './core.js';

const ITER = 100000;

export async function captureKeyFromHash() {
  const m = location.hash.match(/(?:^#|&)cle=([A-Za-z0-9_-]{20,})/);
  if (!m) return false;
  await kvSet('syncKey', m[1]);
  history.replaceState(null, '', location.pathname + location.search + '#/home');
  return true;
}

async function decrypt(buf, pass) {
  const b = new Uint8Array(buf);
  const magic = new TextDecoder().decode(b.slice(0, 8));
  if (magic !== 'Salted__') throw new Error('Format de synchronisation inconnu');
  const salt = b.slice(8, 16), data = b.slice(16);
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, 384));
  const key = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-CBC', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: bits.slice(32, 48) }, key, data);
  return JSON.parse(new TextDecoder().decode(plain));
}

/**
 * @returns {null | {applied:boolean, result?, rev, error?}}
 */
export async function autoSync({ force = false } = {}) {
  if (!S.syncKey) return null;
  let res;
  try { res = await fetch('data/sync.enc?t=' + Date.now(), { cache: 'no-store' }); }
  catch (e) { return { applied: false, error: 'hors ligne' }; }
  if (!res.ok) return { applied: false, error: 'aucune donnée publiée' };
  let bundle;
  try { bundle = await decrypt(await res.arrayBuffer(), S.syncKey); }
  catch (e) { return { applied: false, error: 'clé de synchronisation incorrecte' }; }
  const rev = bundle.rev || bundle.extraitLe;
  if (!force && S.syncApplied === rev) return { applied: false, rev };
  const I = await import('./importer.js');
  const { autoSnapshot } = await import('./views-profile.js');
  const wb = { sheets: Object.fromEntries(Object.entries(bundle.sheets).map(([k, v]) => [k, v.values || v])), anchor: bundle.anchor || null, renames: bundle.renames || null };
  const parsed = I.analyseWorkbook(wb);
  await autoSnapshot('avant synchronisation');
  const st = await I.stageImport(parsed, { source: 'Synchronisation automatique', fileName: 'Google Sheets (' + (bundle.extraitLe || rev) + ')' });
  const result = await I.commitImport(st);
  await kvSet('syncApplied', rev);
  await kvSet('syncInfo', { rev, at: Date.now(), extraitLe: bundle.extraitLe, diff: st.diff });
  return { applied: true, rev, result, diff: st.diff };
}
