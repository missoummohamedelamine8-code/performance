// =====================================================================
// importer.js — import du Google Sheets (XLSX / CSV / grilles JSON / API)
// Format reconnu : feuille « TRAINING » en blocs (« Séance - … », colonnes
// « Semaine N » contenant Reps / Poids / Remarque) et feuille « TRACKING »
// (blocs hebdomadaires datés : Poids, Pas, Séance, macros, sommeil…).
// Les données importées sont placées en « attente » (staging) et ne sont
// intégrées qu'après validation.
// =====================================================================
import { S, uid, num, norm, addDays, todayStr, parseD, dstr, put, putMany, del, loadScript } from './core.js';
import { muscleGroup, guessEquipment, guessMovement, exKey, parseRange } from './calc.js';

const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
const DAYS = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0 };
const cell = (row, c) => (row && row[c] !== undefined && row[c] !== null) ? String(row[c]).trim() : '';
const isErr = v => /^#(VALUE|DIV|REF|N\/A|NAME|NUM)/i.test(v);

// ---------------------------------------------------------------------
// Lecture de fichiers -> { sheets: { nom: grille[][] } }
// ---------------------------------------------------------------------
export async function readWorkbook(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.json')) {
    const j = JSON.parse(await file.text());
    if (j.format === 'perf-sheet-grids') return { sheets: Object.fromEntries(Object.entries(j.sheets).map(([k, v]) => [k, v.values || v])), anchor: j.anchor || null, renames: j.renames || null };
    if (j.values) return { sheets: { [String(j.range || 'Feuille').split('!')[0].replace(/'/g, '')]: j.values } };
    if (j.app === 'performance-muscu-nutrition') return { backup: j };
    throw new Error('JSON non reconnu.');
  }
  if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
    return { sheets: { [file.name.replace(/\.\w+$/, '')]: parseCSV(await file.text()) } };
  }
  await loadScript(XLSX_URL);
  const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  const sheets = {};
  for (const n of wb.SheetNames) sheets[n] = window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '', blankrows: true });
  return { sheets };
}

export function parseCSV(text) {
  const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : (text.includes('\t') ? '\t' : ',');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(f); f = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

export function detectSheets(sheets) {
  const out = { training: [], tracking: [], long: [], foods: [] };
  for (const [n, g] of Object.entries(sheets)) {
    const flat = g.slice(0, 300).map(r => (r || []).join('|')).join('\n');
    if (/S[ée]ance/i.test(flat) && /Semaine\s*\d/i.test(flat) && /Exercice/i.test(flat)) out.training.push(n);
    else if (/\d{1,2}\/\d{1,2}\/\d{2,4}\|Jour/i.test(flat) && /\|Pas\s*\|/i.test(flat + '|')) out.tracking.push(n);
    else if (/exercice/i.test((g[0] || []).join('|')) && /(reps|r[ée]p)/i.test((g[0] || []).join('|'))) out.long.push(n);
  }
  return out;
}

// ---------------------------------------------------------------------
// TRAINING (format en blocs du coaching)
// ---------------------------------------------------------------------
const SYN = { pecs: 'pectoraux', pec: 'pectoraux', jambes: 'legs', jambe: 'legs', epaules: 'epaules', bras: 'bras' };
const tokens = s => norm(s).split(' ').filter(w => w.length > 1 && w !== 'seance' && w !== 'ou').map(w => SYN[w] || w);

function findDayPlan(grid) {
  // tableau « REPARTITION DES TRAININGS » : jour | … | séance
  const plan = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] || [];
    for (let c = 0; c < Math.min(row.length, 10); c++) {
      const d = DAYS[norm(cell(row, c))];
      if (d === undefined) continue;
      const label = [cell(row, c + 1), cell(row, c + 2), cell(row, c + 3)].filter(Boolean).join(' ');
      if (label && !/repos/i.test(label)) plan.push({ day: d, label });
    }
  }
  return plan;
}

function matchDay(title, plan, used) {
  const tt = new Set(tokens(title)); let best = null;
  for (const p of plan) {
    const pt = tokens(p.label); const score = pt.filter(t => tt.has(t)).length;
    if (score && (!best || score > best.score || (score === best.score && used.has(best.day) && !used.has(p.day)))) best = { day: p.day, score, label: p.label };
  }
  return best;
}

/**
 * @returns {{templates, exercises, sessions, warnings, weeks, anchor}}
 * opts.anchor : { week: n, date: 'YYYY-MM-DD' } (lundi de la semaine n). Sinon détecté.
 */
export function parseTrainingGrid(grid, opts = {}) {
  const warnings = [];
  const blocks = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] || [];
    for (let c = 0; c < Math.min(row.length, 20); c++) {
      const v = cell(row, c);
      if (/^S[ée]ance\b/i.test(v) && !/RPE/i.test(v)) {
        const weekCols = [];
        for (let k = c + 1; k < row.length; k++) {
          const m = cell(row, k).match(/^Semaine\s*(\d+)\s*(.*)$/i);
          if (m) weekCols.push({ week: +m[1], col: k, extra: m[2] });
        }
        if (weekCols.length) blocks.push({ row: r, col: c, title: v.replace(/^S[ée]ance\s*[-–:]?\s*/i, '').trim(), weekCols });
        break;
      }
    }
  }
  // Ancre de date : « Semaine 8 22/09 »
  let anchor = opts.anchor || null;
  if (!anchor) {
    for (const b of blocks) for (const w of b.weekCols) {
      const m = w.extra.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
      if (m) {
        let y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : (opts.year || null);
        if (!y) { // année la plus récente telle que la date ne soit pas dans le futur
          const now = new Date(); y = now.getFullYear();
          if (new Date(y, +m[2] - 1, +m[1]) > now) y--;
        }
        const d = new Date(y, +m[2] - 1, +m[1], 12);
        const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd);
        anchor = { week: w.week, date: dstr(d), detected: true, label: `Semaine ${w.week} = ${m[1]}/${m[2]}` };
        break;
      }
      if (anchor) break;
    }
  }
  if (!anchor) { anchor = { week: 1, date: null, detected: false }; warnings.push('Aucune date trouvée dans les en-têtes « Semaine N » : indique la date du lundi de la semaine 1.'); }

  const plan = findDayPlan(grid);
  const used = new Set();
  const templates = [], exercises = new Map(), sessions = [];
  const weekMonday = w => anchor.date ? addDays(anchor.date, (w - anchor.week) * 7) : null;

  // Un même nom d'exercice utilisé dans plusieurs séances avec des notes différentes
  // (ex. « SA triceps extension » : « corde » / « preacher ») = variantes distinctes.
  const notesByName = {};
  const variantName = (name, note) => {
    const k = exKey(name); const n = (note || '').trim();
    const set = notesByName[k]; if (!set || set.size < 2 || !n) return name;
    return `${name} (${n})`;
  };
  // pré-passage pour collecter les notes par nom
  blocks.forEach((b, bi) => {
    const end = bi + 1 < blocks.length ? blocks[bi + 1].row : grid.length;
    let H = null;
    for (let r = b.row + 1; r < end; r++) {
      const row = grid[r] || [];
      if (!H) { const ix = row.findIndex(v => /^exercice/i.test(String(v).trim())); if (ix >= 0) H = { ex: ix, note: row.findIndex(v => norm(v) === 'note') }; continue; }
      const nm = cell(row, H.ex).replace(/\s+/g, ' ').trim(); if (!nm) continue;
      const nt = H.note >= 0 ? cell(row, H.note).trim() : '';
      if (nt) (notesByName[exKey(nm)] = notesByName[exKey(nm)] || new Set()).add(norm(nt));
    }
  });

  blocks.forEach((b, bi) => {
    const end = bi + 1 < blocks.length ? blocks[bi + 1].row : grid.length;
    // en-tête « Ordre | Lien | Exercice | … »
    let hr = -1, H = {};
    for (let r = b.row + 1; r < end && hr < 0; r++) {
      const row = grid[r] || [];
      const idx = row.findIndex(v => /^exercice/i.test(String(v).trim()));
      if (idx >= 0) {
        hr = r;
        row.forEach((v, c) => {
          const n = norm(v);
          if (n === 'ordre') H.ordre = c; else if (n === 'lien') H.lien = c; else if (n.startsWith('exercice')) H.ex = c;
          else if (n === 'note') H.note = c; else if (n === 'serie' || n === 'series') H.series = c;
          else if (n.startsWith('fourchette')) H.range = c; else if (n === 'repos') H.rest = c;
          else if (n === 'muscle cible') H.m1 = c; else if (n === 'muscle cible indirect 1') H.m2 = c;
          else if (n === 'muscle cible indirect 2') H.m3 = c; else if (n.startsWith('reglage')) H.setting = c;
        });
      }
    }
    if (hr < 0) { warnings.push(`Bloc « ${b.title} » : en-tête d'exercices introuvable, ignoré.`); return; }
    const title = b.title || `Séance ${bi + 1}`;
    const tplKey = 'sheet:' + norm(title).replace(/ /g, '-');
    const dm = matchDay(title, plan.filter(p => !used.has(p.day)), used) || matchDay(title, plan, used);
    if (dm) used.add(dm.day);
    const tpl = { id: null, key: tplKey, name: title, day: dm ? dm.day : null, dayLabel: dm?.label || null, exercises: [], source: 'sheet' };

    // RPE de séance et tonnage calculé par le Sheets (pour contrôle)
    const rpeByWeek = {}, tonnageByWeek = {};
    for (let r = hr + 1; r < end; r++) {
      const row = grid[r] || [];
      for (const w of b.weekCols) {
        const lab = cell(row, w.col);
        if (/^RPE/i.test(lab)) { const v = num(cell(row, w.col + 2)) ?? num(cell(row, w.col + 1)); if (v) rpeByWeek[w.week] = v; }
        if (/^Tonnage/i.test(lab)) { const v = cell(row, w.col + 2); if (v && !isErr(v)) tonnageByWeek[w.week] = num(v); }
      }
    }

    // exercices
    let cur = null; const exList = [];
    for (let r = hr + 1; r < end; r++) {
      const row = grid[r] || [];
      const first = b.weekCols.length ? cell(row, b.weekCols[0].col) : '';
      if (/^(RPE|Tonnage|Workload|Acute)/i.test(first)) break;
      const ordre = cell(row, H.ordre), name = cell(row, H.ex).replace(/\s+/g, ' ').trim();
      const hasData = b.weekCols.some(w => cell(row, w.col) || cell(row, w.col + 1));
      const range = cell(row, H.range);
      const blank = !ordre && !name && !hasData && !range;
      if (blank) { cur = null; continue; }
      if (ordre || name) {
        if (!name && !hasData) { cur = null; continue; } // emplacement vide (ex. « 7 », « 8 »)
        cur = {
          order: ordre, name: name ? variantName(name, cell(row, H.note)) : `Exercice ${ordre || exList.length + 1} sans nom (${title})`, unnamed: !name,
          link: cell(row, H.lien), note: cell(row, H.note), plannedSets: num(cell(row, H.series)),
          rest: num(cell(row, H.rest)), m: [cell(row, H.m1), cell(row, H.m2), cell(row, H.m3)].filter(Boolean),
          setting: cell(row, H.setting), rows: []
        };
        if (!name) warnings.push(`« ${title} » : l'exercice n°${ordre} n'a pas de nom mais contient des données. Il est importé sous le nom « ${cur.name} » — renomme-le ensuite.`);
        exList.push(cur);
      }
      if (cur) cur.rows.push({ r, range });
    }

    exList.forEach((e, i) => {
      const k = exKey(e.name);
      let ex = exercises.get(k);
      if (!ex) {
        ex = {
          key: k, name: e.name, muscle: e.m[0] || '', group: muscleGroup(e.m[0]) || (!e.unnamed && muscleGroup(e.name) !== 'Autre' && muscleGroup(e.name)) || 'Autre', secondary: e.m.slice(1),
          movement: guessMovement(e.name, e.m), equipment: guessEquipment(e.name), rest: e.rest || null,
          link: /^https?:/.test(e.link) ? e.link : '', linkLabel: /^https?:/.test(e.link) ? '' : e.link,
          note: e.note, setting: e.setting, source: 'sheet', unnamed: e.unnamed, inferredFields: ['movement', 'equipment']
        };
        exercises.set(k, ex);
      }
      const ranges = e.rows.map(x => x.range).filter(Boolean);
      tpl.exercises.push({
        exKey: k, sets: e.plannedSets || e.rows.length, ranges: e.rows.map(x => x.range || ranges[0] || ''),
        rest: e.rest || null, note: e.note, superset: /superset/i.test(e.order) || /superset/i.test(e.note)
      });
      if (!ex.repRange && ranges[0]) ex.repRange = ranges[0];
    });
    if (tpl.exercises.length) templates.push(tpl);

    // séances : une par semaine contenant au moins une série
    for (const w of b.weekCols) {
      const sets = []; let weekRemarks = [];
      exList.forEach(e => {
        let lastW = null;
        e.rows.forEach((row, si) => {
          const R = grid[row.r] || [];
          const reps = cell(R, w.col), load = cell(R, w.col + 1), rem = cell(R, w.col + 2);
          if (isErr(reps) || isErr(load)) return;
          const rn = num(reps), wn = num(load);
          if (rem && !isErr(rem)) weekRemarks.push(`${e.name} : ${rem}`);
          if (rn === null && wn === null) return;
          const s = { exKey: exKey(e.name), setIdx: si + 1, r: rn, w: wn, raw: { reps, load }, range: row.range || null };
          if (wn === null && rn !== null && lastW !== null) s.wInferred = lastW;
          if (wn !== null) lastW = wn;
          if (rem) s.note = rem;
          sets.push(s);
        });
      });
      if (!sets.length) continue;
      const mon = weekMonday(w.week);
      const offset = tpl.day === null ? bi : (tpl.day + 6) % 7;
      sessions.push({
        key: `${tplKey}:w${w.week}`, tplKey, name: title, week: w.week,
        date: mon ? addDays(mon, offset) : null, dateApprox: true,
        dateNote: `Semaine ${w.week}${tpl.dayLabel ? ' · jour habituel : ' + ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][tpl.day] : ''}`,
        sets, rpe: rpeByWeek[w.week] || null, sheetTonnage: tonnageByWeek[w.week] || null,
        notes: weekRemarks.join('\n'), source: 'sheet'
      });
    }
  });

  const weeks = [...new Set(sessions.map(s => s.week))].sort((a, b) => a - b);
  // repère d'éventuels changements d'exercice (chute de charge > 25 % entre 2 semaines)
  for (const ex of exercises.values()) {
    const ss = sessions.filter(s => s.sets.some(x => x.exKey === ex.key)).sort((a, b) => a.week - b.week);
    for (let i = 1; i < ss.length; i++) {
      const m = s => Math.max(0, ...s.sets.filter(x => x.exKey === ex.key).map(x => x.w ?? x.wInferred ?? 0));
      const a = m(ss[i - 1]), c = m(ss[i]);
      if (a && c && c < a * 0.75) warnings.push(`« ${ex.name} » : charge passée de ${a} à ${c} kg entre les semaines ${ss[i - 1].week} et ${ss[i].week}. Possible changement d'exercice ou de matériel dans la même ligne du Sheets.`);
    }
  }
  return { templates, exercises: [...exercises.values()], sessions, warnings, weeks, anchor };
}

// ---------------------------------------------------------------------
// TRACKING (suivi journalier en blocs hebdomadaires)
// ---------------------------------------------------------------------
export function parseTrackingGrid(grid) {
  const days = []; const warnings = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] || [];
    let dc = -1, date = null;
    for (let c = 0; c < Math.min(row.length, 6); c++) {
      const m = cell(row, c).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (m && /^jour/i.test(cell(row, c + 1))) { dc = c; const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; date = dstr(new Date(y, +m[2] - 1, +m[1], 12)); break; }
    }
    if (dc < 0) continue;
    const sub = grid[r + 1] || [];
    const map = {};
    const L = Math.max(row.length, sub.length);
    for (let c = 0; c < L; c++) {
      const a = norm(cell(sub, c)) || norm(cell(row, c));
      const top = norm(cell(row, c));
      if (top === 'poids') map.weight = c;
      if (a === 'proteines') map.p = c; else if (a === 'glucides') map.c = c; else if (a === 'lipides') map.f = c; else if (a === 'calories') map.kcal = c;
      else if (a === 'seance') map.session = c; else if (a === 'pas') map.steps = c; else if (a === 'cardio') map.cardio = c;
      else if (a === 'heure sommeil') map.sleepH = c; else if (a === 'qualite sommeil') map.sleepQ = c;
      else if (a === 'energie' && map.energy === undefined) map.energy = c; else if (a === 'motivation') map.motivation = c;
      else if (a === 'faim') map.hunger = c; else if (a === 'stress') map.stress = c; else if (a === 'taille nombril') map.waist = c;
    }
    const dayCol = dc + 1;
    for (let k = r + 1; k < Math.min(grid.length, r + 10); k++) {
      const R = grid[k] || [];
      const dn = DAYS[norm(cell(R, dayCol))];
      if (dn === undefined) continue;
      const offset = (dn + 6) % 7;
      const d = { date: addDays(date, offset) };
      const g = key => map[key] !== undefined ? cell(R, map[key]) : '';
      const n = key => { const v = g(key); if (!v || isErr(v) || /^(true|false)$/i.test(v)) return null; return num(v); };
      const w = n('weight'); if (w && w > 30 && w < 250) d.weight = w;
      const st = n('steps'); if (st && st > 100 && st < 100000) d.steps = Math.round(st);
      const kc = n('kcal'), p = n('p'), c = n('c'), f = n('f');
      if (kc && kc > 300) { d.kcalIn = kc; if (p) d.pIn = p; if (c) d.cIn = c; if (f) d.fIn = f; }
      const sl = n('sleepH'); if (sl && sl > 2 && sl < 15) d.sleepH = sl;
      const en = n('energy'); if (en) d.energySheet = en;
      const mo = n('motivation'); if (mo) d.motivationSheet = mo;
      const se = g('session'); if (se && !/^(true|false)$/i.test(se) && !isErr(se)) d.sessionNote = se;
      const ca = g('cardio'); if (ca && !/^(true|false)$/i.test(ca) && !isErr(ca)) d.cardioNote = ca;
      const ws = n('waist'); if (ws && ws > 40 && ws < 200) d.waist = ws;
      if (Object.keys(d).length > 1) { d.source = 'sheet'; days.push(d); }
    }
  }
  return { days, warnings };
}

// ---------------------------------------------------------------------
// Format long (CSV exporté par l'app ou tableur simple)
// date | séance | exercice | série | reps | poids | remarque
// ---------------------------------------------------------------------
export function parseLongGrid(grid) {
  const h = (grid[0] || []).map(norm);
  const ix = re => h.findIndex(x => re.test(x));
  const c = { date: ix(/^date/), sess: ix(/seance|session|programme/), ex: ix(/^exercice|exercise/), set: ix(/^serie|^set/), r: ix(/^rep/), w: ix(/poids|charge|kg|weight/), note: ix(/remarque|note|comment/), rpe: ix(/^rpe/) };
  if (c.date < 0 || c.ex < 0) throw new Error('Colonnes « date » et « exercice » requises.');
  const bySess = new Map(); const exercises = new Map();
  for (let i = 1; i < grid.length; i++) {
    const R = grid[i]; if (!R || !cell(R, c.ex)) continue;
    const dt = toISO(cell(R, c.date)); if (!dt) continue;
    const sn = c.sess >= 0 ? cell(R, c.sess) : 'Séance';
    const key = `csv:${dt}:${norm(sn)}`;
    if (!bySess.has(key)) bySess.set(key, { key, name: sn || 'Séance', date: dt, sets: [], source: 'csv', rpe: c.rpe >= 0 ? num(cell(R, c.rpe)) : null });
    const name = cell(R, c.ex); const k = exKey(name);
    if (!exercises.has(k)) exercises.set(k, { key: k, name, group: 'Autre', muscle: '', secondary: [], movement: guessMovement(name), equipment: guessEquipment(name), source: 'csv' });
    const s = bySess.get(key);
    s.sets.push({ exKey: k, setIdx: c.set >= 0 ? num(cell(R, c.set)) : s.sets.filter(x => x.exKey === k).length + 1, r: num(cell(R, c.r)), w: num(cell(R, c.w)), note: c.note >= 0 ? cell(R, c.note) : '' });
  }
  return { templates: [], exercises: [...exercises.values()], sessions: [...bySess.values()], warnings: [], weeks: [], anchor: null };
}

function toISO(v) {
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return dstr(new Date(y, +m[2] - 1, +m[1], 12)); }
  return null;
}

// ---------------------------------------------------------------------
// Mise en attente (staging) puis intégration validée
// ---------------------------------------------------------------------
export async function stageImport(parsed, meta) {
  const st = Object.assign({ id: uid('imp_'), createdAt: Date.now(), status: 'pending' }, meta, parsed);
  st.diff = diffImport(st);
  await put('staging', st);
  return st;
}

export function reanchor(st, anchorDate, anchorWeek) {
  st.anchor = { week: anchorWeek, date: anchorDate, detected: false };
  const tplDay = Object.fromEntries(st.templates.map((t, i) => [t.key, { day: t.day, i }]));
  for (const s of st.sessions) {
    if (s.week == null) continue;
    const t = tplDay[s.tplKey]; const off = t && t.day !== null ? (t.day + 6) % 7 : (t ? t.i : 0);
    s.date = addDays(anchorDate, (s.week - anchorWeek) * 7 + off);
  }
  st.diff = diffImport(st);
  return st;
}

function setsSig(sets) { return JSON.stringify((sets || []).map(x => [x.exKey || x.exId, x.setIdx, x.r, x.w])); }

export function diffImport(st) {
  const d = { newSessions: 0, updatedSessions: 0, sameSessions: 0, conflicts: 0, newExercises: 0, newTemplates: 0, newDays: 0, updatedDays: 0, sets: 0 };
  const byKey = new Map(S.sessions.filter(s => s.key).map(s => [s.key, s]));
  const exByKey = new Map(S.exercises.map(e => [e.key || exKey(e.name), e]));
  for (const e of st.exercises || []) { if (exByKey.has(e.key)) continue; if (e.renamedFrom && exByKey.has(e.renamedFrom)) d.renamedExercises = (d.renamedExercises || 0) + 1; else d.newExercises++; }
  for (const t of st.templates || []) if (!S.templates.some(x => x.key === t.key)) d.newTemplates++;
  for (const s of st.sessions || []) {
    d.sets += s.sets.length;
    const ex = byKey.get(s.key);
    if (!ex) d.newSessions++;
    else {
      const sig = setsSig(s.sets.map(x => ({ ...x, exKey: x.exKey })));
      const cur = setsSig(ex.sets.map(x => ({ ...x, exKey: (S.exercises.find(e => e.id === x.exId) || {}).key })));
      if (sig === cur && ex.date === s.date) d.sameSessions++;
      else if (ex.editedInApp) d.conflicts++;
      else d.updatedSessions++;
    }
  }
  for (const day of st.days || []) {
    const cur = S.days[day.date];
    if (!cur) d.newDays++; else if (Object.keys(day).some(k => k !== 'source' && k !== 'date' && cur[k] === undefined)) d.updatedDays++;
  }
  return d;
}

/** Intègre un import validé. Ne supprime jamais rien ; ne touche pas aux séances créées dans l'app. */
export async function commitImport(st) {
  if (st.sessions?.some(s => !s.date)) throw new Error('Certaines séances n’ont pas de date : indique la date de référence avant de valider.');
  const exByKey = new Map(S.exercises.map(e => [e.key || exKey(e.name), e]));
  const newEx = [];
  // exercice renommé (ex. « Exercice 6 sans nom » -> vrai nom) : on renomme l'existant, son historique est conservé
  for (const e of st.exercises || []) {
    if (e.renamedFrom && !exByKey.has(e.key) && exByKey.has(e.renamedFrom)) {
      const old = exByKey.get(e.renamedFrom);
      const wasUnnamed = old.unnamed; Object.assign(old, { name: e.name, key: e.key, unnamed: false }); if ((wasUnnamed || old.group === 'Autre') && e.group && e.group !== 'Autre') old.group = e.group;
      exByKey.set(e.key, old); newEx.push(old);
    }
  }
  for (const e of st.exercises || []) {
    const cur = exByKey.get(e.key);
    if (!cur) { const ne = Object.assign({ id: uid('ex_'), createdAt: Date.now() }, e); newEx.push(ne); exByKey.set(e.key, ne); }
    else { // ne complète que les champs vides, sans écraser tes modifications
      let ch = false; for (const k of ['muscle', 'group', 'link', 'repRange', 'rest', 'setting', 'note']) if ((cur[k] === undefined || cur[k] === '' || cur[k] === null) && e[k]) { cur[k] = e[k]; ch = true; }
      if (ch) newEx.push(cur);
    }
  }
  await putMany('exercises', newEx);
  const tplOut = [];
  for (const t of st.templates || []) {
    if (S.templates.some(x => x.key === t.key)) continue;
    tplOut.push({ id: uid('tpl_'), key: t.key, name: t.name, day: t.day, source: 'sheet', createdAt: Date.now(),
      exercises: t.exercises.map(x => ({ exId: exByKey.get(x.exKey).id, sets: x.sets, ranges: x.ranges, rest: x.rest, note: x.note, superset: x.superset })) });
  }
  await putMany('templates', tplOut);
  const tplByKey = new Map(S.templates.map(t => [t.key, t]));
  const byKey = new Map(S.sessions.filter(s => s.key).map(s => [s.key, s]));
  const out = []; let conflicts = 0;
  for (const s of st.sessions || []) {
    const cur = byKey.get(s.key);
    if (cur && cur.editedInApp) { conflicts++; continue; }
    const sets = s.sets.map(x => ({ exId: exByKey.get(x.exKey).id, setIdx: x.setIdx, r: x.r, w: x.w, wInferred: x.wInferred, note: x.note, range: x.range, raw: x.raw }));
    out.push({
      id: cur ? cur.id : uid('ses_'), key: s.key, name: s.name, templateId: tplByKey.get(s.tplKey)?.id || null,
      date: s.date, dateApprox: s.dateApprox, dateNote: s.dateNote, week: s.week, sets, rpe: s.rpe, sheetTonnage: s.sheetTonnage,
      notes: s.notes, source: s.source, importId: st.id, status: 'done', createdAt: cur?.createdAt || Date.now(), updatedAt: Date.now()
    });
  }
  await putMany('sessions', out);
  const dayOut = [];
  for (const d of st.days || []) {
    const cur = S.days[d.date] || { date: d.date };
    const merged = Object.assign({}, cur);
    for (const [k, v] of Object.entries(d)) if (k !== 'date' && (merged[k] === undefined || merged[k] === null || cur.source === 'sheet')) merged[k] = v;
    if (d.steps && (!cur.steps || cur.stepsSource === 'Google Sheets')) merged.stepsSource = 'Google Sheets';
    merged.source = cur.source && cur.source !== 'sheet' ? cur.source : 'sheet';
    dayOut.push(merged);
  }
  await putMany('days', dayOut);
  st.status = 'committed'; st.committedAt = Date.now(); st.result = { sessions: out.length, conflicts, days: dayOut.length, exercises: newEx.length, templates: tplOut.length };
  // on garde une trace allégée de l'import
  await put('staging', { id: st.id, status: 'committed', createdAt: st.createdAt, committedAt: st.committedAt, source: st.source, fileName: st.fileName, result: st.result, diff: st.diff });
  return st.result;
}

export async function discardImport(id) { await del('staging', id); }

/**
 * Recale les dates des séances déjà importées du Sheets à partir d'un nouveau repère
 * (semaine n° = lundi). Le jour de chaque séance reste son jour habituel.
 * Les séances dont tu as corrigé la date à la main ne sont pas touchées.
 */
export async function redateSheetSessions(anchorWeek, anchorDate) {
  const out = [];
  for (const s of S.sessions) {
    if (s.source !== 'sheet' || s.week == null || s.dateApprox === false) continue;
    const t = S.templates.find(x => x.id === s.templateId);
    const off = t && t.day != null ? (t.day + 6) % 7 : 0;
    const d = addDays(anchorDate, (s.week - anchorWeek) * 7 + off);
    if (d !== s.date) { s.date = d; s.updatedAt = Date.now(); out.push(s); }
  }
  await putMany('sessions', out);
  return out.length;
}

/** Annule un import : supprime uniquement les séances issues de cet import et non modifiées dans l'app. */
export async function rollbackImport(id) {
  const ss = S.sessions.filter(s => s.importId === id && !s.editedInApp);
  for (const s of ss) await del('sessions', s.id);
  return ss.length;
}

// ---------------------------------------------------------------------
// Connexion Google Sheets (OAuth, lecture seule) — nécessite un Client ID
// ---------------------------------------------------------------------
export async function fetchGoogleSheets({ clientId, spreadsheetId }) {
  if (!clientId || !spreadsheetId) throw new Error('Renseigne le Client ID OAuth et l’identifiant du Google Sheets dans le profil.');
  await loadScript('https://accounts.google.com/gsi/client');
  const token = await new Promise((res, rej) => {
    const tc = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      callback: r => r.error ? rej(new Error(r.error)) : res(r.access_token)
    });
    tc.requestAccessToken();
  });
  const H = { Authorization: 'Bearer ' + token };
  const meta = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, { headers: H })).json();
  if (meta.error) throw new Error(meta.error.message);
  const titles = meta.sheets.map(s => s.properties.title);
  const wanted = titles.filter(t => /training|tracking|muscu|seance/i.test(t));
  const q = (wanted.length ? wanted : titles).map(t => 'ranges=' + encodeURIComponent(`'${t}'`)).join('&');
  const data = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${q}`, { headers: H })).json();
  if (data.error) throw new Error(data.error.message);
  const sheets = {}; for (const vr of data.valueRanges) sheets[vr.range.split('!')[0].replace(/'/g, '')] = vr.values || [];
  return { sheets };
}

/** Analyse complète d'un classeur -> objet prêt à mettre en attente. */
export function analyseWorkbook(wb, opts = {}) {
  const det = detectSheets(wb.sheets);
  const res = { templates: [], exercises: [], sessions: [], days: [], warnings: [], weeks: [], anchor: null, detected: det };
  let trackingFirst = null;
  for (const n of det.tracking) { const t = parseTrackingGrid(wb.sheets[n]); res.days.push(...t.days); res.warnings.push(...t.warnings); }
  if (res.days.length) trackingFirst = res.days.map(d => d.date).sort()[0];
  for (const n of det.training) {
    // repère de date : celui du fichier (vérifié), sinon détecté dans les en-têtes (année la plus récente non future)
    const t = parseTrainingGrid(wb.sheets[n], { anchor: opts.anchor || wb.anchor || null, year: opts.year || null });
    res.templates.push(...t.templates); res.exercises.push(...t.exercises); res.sessions.push(...t.sessions);
    res.warnings.push(...t.warnings); res.weeks = t.weeks; res.anchor = t.anchor;
  }
  for (const n of det.long) { const t = parseLongGrid(wb.sheets[n]); res.exercises.push(...t.exercises); res.sessions.push(...t.sessions); }
  if (!det.training.length && !det.tracking.length && !det.long.length) res.warnings.push('Aucune feuille reconnue (TRAINING, TRACKING ou tableau « date / exercice / reps / poids »).');
  // dédoublonnage des exercices détectés dans plusieurs feuilles
  // renommages (ex. un exercice sans nom dans le Sheets) : l'exercice déjà importé garde son historique
  if (wb.renames) for (const e of res.exercises) {
    // ancien nom -> nouveau ; aussi quand le Sheets contient déjà le nouveau nom (l'exercice importé avant garde son historique)
    const pair = Object.entries(wb.renames).find(([o, n]) => o === e.name || n === e.name); if (!pair) continue;
    if (e.name === pair[1]) { e.renamedFrom = exKey(pair[0]); continue; }
    const nn = pair[1];
    const oldKey = e.key, newKey = exKey(nn);
    Object.assign(e, { name: nn, key: newKey, renamedFrom: oldKey, unnamed: false });
    if (e.group === 'Autre') e.group = muscleGroup(nn) || 'Autre';
    for (const s of res.sessions) for (const x of s.sets) if (x.exKey === oldKey) x.exKey = newKey;
    for (const t of res.templates) for (const x of t.exercises) if (x.exKey === oldKey) x.exKey = newKey;
    res.warnings = res.warnings.filter(w => !w.includes(oldKey) && !w.includes('« ' + Object.keys(wb.renames).find(k => wb.renames[k] === nn) + ' »'));
  }
  const seen = new Map(); for (const e of res.exercises) if (!seen.has(e.key)) seen.set(e.key, e); res.exercises = [...seen.values()];
  return res;
}
