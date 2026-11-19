// =====================================================================
// core.js — stockage local (IndexedDB), état en mémoire et utilitaires
// =====================================================================

const DB_NAME = 'perf-muscu-nutrition';
const DB_VER = 1;
// store -> clé primaire
const STORES = {
  kv: 'key', exercises: 'id', templates: 'id', sessions: 'id', runs: 'id',
  days: 'date', foods: 'id', foodLog: 'id', recipes: 'id', staging: 'id',
  photos: 'id', backups: 'id'
};

let dbp = null;
function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const [s, kp] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: kp });
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return openDB().then(db => new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const st = t.objectStore(store);
    let out;
    Promise.resolve(fn(st)).then(v => { out = v; });
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}

function reqP(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

// ---------------------------------------------------------------------
// État en mémoire (les données d'un usage personnel tiennent en RAM)
// ---------------------------------------------------------------------
export const S = {
  profile: null, settings: null, calib: null, active: null, stepGoals: [],
  exercises: [], templates: [], sessions: [], runs: [], days: {},
  foods: [], foodLog: [], recipes: [], staging: []
};

const ARRAY_STORES = ['exercises', 'templates', 'sessions', 'runs', 'foods', 'foodLog', 'recipes', 'staging'];

export const DEFAULT_PROFILE = {
  sex: 'm', age: 26, height: 184, weight: 84,
  goal: 'maintain',            // bulk | maintain | cut
  surplus: 250,                // kcal / jour en prise de masse
  deficit: 450,                // kcal / jour en sèche
  trainingFreq: 4,
  mainSport: 'Musculation', secondarySport: 'Course à pied (occasionnelle)',
  stepGoal: 10000,
  activityLevel: 'variable',   // indicatif seulement : le calcul se base sur les pas réels
  stepsIncludeRuns: true,      // les pas mesurés incluent ceux des sorties course
  activeWorkSteps: 16000,      // estimation utilisée si « journée de travail active » sans pas mesurés
  baselineSteps: 3000,         // pas déjà inclus dans le niveau de base (vie courante)
  strideCm: null,              // longueur de foulée personnalisée (sinon estimée par la taille)
  proteinPerKg: null, fatPerKg: null, // null = valeurs par défaut selon l'objectif
  macroOverride: { p: null, f: null, c: null },
  kcalOverride: null,          // objectif calorique fixe (null = calcul dynamique)
  targetBasis: 'live',         // live = pas réels du jour ; avg7 = moyenne 7 jours
  increments: { barre: 2.5, halteres: 2, machine: 2.5, poulie: 2.5, 'poids du corps': 0, autre: 2.5 },
  defaultRest: 120,
  waterGoal: 2500
};

export const DEFAULT_SETTINGS = {
  reminders: { weigh: true, weighDays: [1, 4], training: true, nutrition: true, backupEveryDays: 7 },
  lastBackupAt: null, lastAutoSnapshot: null,
  google: { clientId: '', spreadsheetId: '' },
  workoutView: 'focus',
  onboarded: false
};

export async function loadAll() {
  const db = await openDB();
  const all = async (s) => reqP(db.transaction(s).objectStore(s).getAll());
  for (const s of ARRAY_STORES) S[s] = await all(s);
  const days = await all('days');
  S.days = {}; for (const d of days) S.days[d.date] = d;
  const kv = await all('kv');
  const k = Object.fromEntries(kv.map(x => [x.key, x.value]));
  S.profile = Object.assign({}, DEFAULT_PROFILE, k.profile || {});
  S.profile.increments = Object.assign({}, DEFAULT_PROFILE.increments, (k.profile || {}).increments || {});
  S.profile.macroOverride = Object.assign({}, DEFAULT_PROFILE.macroOverride, (k.profile || {}).macroOverride || {});
  if (!S.profile.weightDate) { S.profile.weightDate = todayStr(); await tx('kv', 'readwrite', st => st.put({ key: 'profile', value: S.profile })); }
  S.settings = Object.assign({}, DEFAULT_SETTINGS, k.settings || {});
  S.settings.reminders = Object.assign({}, DEFAULT_SETTINGS.reminders, (k.settings || {}).reminders || {});
  S.settings.google = Object.assign({}, DEFAULT_SETTINGS.google, (k.settings || {}).google || {});
  S.calib = k.calib || { factor: 1, updatedAt: null, history: [] };
  S.active = k.activeWorkout || null;
  S.stepGoals = k.stepGoals || [];
  S.syncKey = k.syncKey || null; S.syncApplied = k.syncApplied || null; S.syncInfo = k.syncInfo || null;
  S.sessions.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  S.runs.sort((a, b) => a.date < b.date ? -1 : 1);
}

export async function put(store, obj) {
  await tx(store, 'readwrite', st => st.put(obj));
  if (store === 'days') S.days[obj.date] = obj;
  else if (ARRAY_STORES.includes(store)) {
    const arr = S[store]; const i = arr.findIndex(x => x.id === obj.id);
    if (i >= 0) arr[i] = obj; else arr.push(obj);
    if (store === 'sessions' || store === 'runs') arr.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  }
  return obj;
}

export async function putMany(store, objs) {
  if (!objs.length) return;
  await tx(store, 'readwrite', st => { for (const o of objs) st.put(o); });
  for (const o of objs) {
    if (store === 'days') S.days[o.date] = o;
    else { const arr = S[store]; const i = arr.findIndex(x => x.id === o.id); if (i >= 0) arr[i] = o; else arr.push(o); }
  }
  if (store === 'sessions' || store === 'runs') S[store].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}

export async function del(store, id) {
  await tx(store, 'readwrite', st => st.delete(id));
  if (store === 'days') delete S.days[id];
  else if (ARRAY_STORES.includes(store)) S[store] = S[store].filter(x => x.id !== id);
}

export async function clearStore(store) {
  await tx(store, 'readwrite', st => st.clear());
  if (store === 'days') S.days = {}; else if (ARRAY_STORES.includes(store)) S[store] = [];
}

export async function kvSet(key, value) {
  await tx('kv', 'readwrite', st => st.put({ key, value }));
  if (key === 'profile') S.profile = value;
  else if (key === 'settings') S.settings = value;
  else if (key === 'calib') S.calib = value;
  else if (key === 'activeWorkout') S.active = value;
  else if (key === 'stepGoals') S.stepGoals = value;
  else S[key] = value;
}

export async function getAllRaw(store) { const db = await openDB(); return reqP(db.transaction(store).objectStore(store).getAll()); }
export async function getRaw(store, id) { const db = await openDB(); return reqP(db.transaction(store).objectStore(store).get(id)); }

export function saveProfile() { return kvSet('profile', S.profile); }
export function saveSettings() { return kvSet('settings', S.settings); }

export async function getDay(date) {
  return S.days[date] || { date };
}
export async function patchDay(date, patch) {
  const d = Object.assign({ date }, S.days[date] || {}, patch, { updatedAt: Date.now() });
  for (const k of Object.keys(d)) if (d[k] === undefined) delete d[k];
  return put('days', d);
}

export async function requestPersist() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { }
  return false;
}

// ---------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------
export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const pad = n => String(n).padStart(2, '0');
export function dstr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function todayStr() { return dstr(new Date()); }
export function parseD(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }
export function addDays(s, n) { const d = parseD(s); d.setDate(d.getDate() + n); return dstr(d); }
export function dayDiff(a, b) { return Math.round((parseD(b) - parseD(a)) / 86400000); }
export function mondayOf(s) { const d = parseD(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return dstr(d); }
export function rangeDays(from, to) { const out = []; let c = from; while (c <= to) { out.push(c); c = addDays(c, 1); } return out; }
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sum = a => a.reduce((s, x) => s + (Number(x) || 0), 0);
export const avg = a => { const v = a.filter(x => x !== null && x !== undefined && !isNaN(x)); return v.length ? sum(v) / v.length : null; };
export function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = String(v).replace(/\s/g, '').replace(',', '.').match(/-?\d+(\.\d+)?/);
  return s ? parseFloat(s[0]) : null;
}
export function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
export function f0(v) { return v === null || v === undefined || isNaN(v) ? '—' : nf0.format(v); }
export function f1(v) { return v === null || v === undefined || isNaN(v) ? '—' : nf1.format(v); }
export function f2(v) { return v === null || v === undefined || isNaN(v) ? '—' : nf2.format(v); }
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
export const JOURS_LONG = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
export function fdate(s, withDay = false) {
  if (!s) return '—';
  const d = parseD(s);
  const base = `${d.getDate()} ${MOIS[d.getMonth()]}`;
  const y = d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '';
  return (withDay ? JOURS[d.getDay()] + ' ' : '') + base + y;
}
export function relDay(s) {
  const n = dayDiff(s, todayStr());
  if (n === 0) return "aujourd'hui"; if (n === 1) return 'hier'; if (n > 1 && n < 7) return `il y a ${n} j`;
  return fdate(s);
}
export function fdur(sec) {
  if (sec === null || sec === undefined || isNaN(sec)) return '—';
  sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return h ? `${h}h${pad(m)}` + (s ? `:${pad(s)}` : '') : `${m}:${pad(s)}`;
}
export function fpace(secPerKm) {
  if (!secPerKm || !isFinite(secPerKm)) return '—';
  const m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${pad(s)}`;
}
export function parseDur(str) { // "1:02:30" | "45:10" | "45" (min)
  if (!str) return null; const p = String(str).trim().split(':').map(x => parseFloat(x.replace(',', '.')));
  if (p.some(isNaN)) return null;
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return p[0] * 60;
}
export function debounce(fn, ms = 300) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export function download(name, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
export function readFileText(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(file); }); }
export function readFileBuf(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsArrayBuffer(file); }); }
export function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Chargement impossible : ' + src));
    document.head.appendChild(s);
  });
}
