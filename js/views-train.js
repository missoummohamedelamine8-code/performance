// =====================================================================
// views-train.js — Musculation : séances, historique, exercices, analyse
// =====================================================================
import { S, put, del, uid, esc, f0, f1, fdate, relDay, todayStr, addDays, norm, num, JOURS_LONG, mondayOf, sum } from './core.js';
import * as C from './calc.js';
import { R, VIEWS, rerender } from './nav.js';
import { actions, openSheet, confirmDlg, toast, card, kpi, badge, seg, field, inp, sel, formData } from './ui.js';
import { lineChart, barChart } from './charts.js';
import { startWorkout } from './views-workout.js';

const EQUIP = [['barre', 'Barre'], ['haltères', 'Haltères'], ['machine', 'Machine'], ['poulie', 'Poulie'], ['poids du corps', 'Poids du corps'], ['autre', 'Autre']];
const exById = id => S.exercises.find(e => e.id === id);

VIEWS.muscu = () => {
  const sub = R.sub.muscu;
  const pending = S.staging.filter(s => s.status === 'pending');
  let h = `<h1 class="title">Musculation</h1>`;
  if (S.active) h += `<button class="banner live" data-a="resumeWorkout">● Séance en cours : ${esc(S.active.name)} — reprendre</button>`;
  if (pending.length) h += `<button class="banner" data-a="openStaging" data-id="${pending[0].id}">${pending.length} import(s) en attente de validation — vérifier</button>`;
  h += seg('muscu', [['seances', 'Séances'], ['historique', 'Historique'], ['exercices', 'Exercices'], ['analyse', 'Analyse']], sub, 'subtab');
  if (!S.exercises.length && !S.sessions.length) {
    h += card(`<h3>Commence par ton historique</h3><p>Importe ton Google Sheets (export .xlsx, ou le fichier fourni dans « donnees-privees ») : tes séances, exercices et performances seront reconstruits à partir de tes vraies données.</p>
      <button class="btn" data-a="openImport">Importer mon Google Sheets</button> <button class="btn ghost" data-a="newTemplate">Créer une séance vide</button>`);
    return h;
  }
  if (sub === 'seances') h += renderTemplates();
  else if (sub === 'historique') h += renderHistory();
  else if (sub === 'exercices') h += renderLibrary();
  else h += renderAnalysis();
  return h;
};

// ----------------------------- Séances --------------------------------
function lastDone(tplId) { const s = C.doneSessions().filter(x => x.templateId === tplId); return s[s.length - 1]; }
function renderTemplates() {
  const nt = C.nextTemplate();
  const tpls = S.templates.filter(t => !t.archived).sort((a, b) => ((a.day ?? 9) + 6) % 7 - ((b.day ?? 9) + 6) % 7);
  let h = '';
  if (nt) h += card(`<div class="row between"><div><small class="muted">Prochaine séance suggérée</small><h3>${esc(nt.tpl.name)}</h3><small class="muted">${esc(nt.why)}</small></div>
    <button class="btn big" data-a="startTpl" data-id="${nt.tpl.id}">Démarrer</button></div>`, 'accent-l');
  for (const t of tpls) {
    const l = lastDone(t.id);
    const vars = S.templates.filter(x => x.variantOf === t.id && !x.archived).length;
    h += card(`<div class="row between"><div class="grow" data-a="editTemplate" data-id="${t.id}"><h3>${esc(t.name)}${t.variantOf ? ' ' + badge('variante') : ''}</h3>
      <small class="muted">${t.day != null ? JOURS_LONG[t.day] + ' · ' : ''}${t.exercises.length} exercices${l ? ' · dernière : ' + relDay(l.date) : ''}${vars ? ` · ${vars} variante(s)` : ''}</small>
      <div class="chips mt-s">${t.exercises.slice(0, 6).map(x => `<span class="chip">${esc(exById(x.exId)?.name || '?')}</span>`).join('')}</div></div>
      <button class="btn" data-a="startTpl" data-id="${t.id}">Go</button></div>`);
  }
  h += `<div class="row gap"><button class="btn ghost grow" data-a="newTemplate">+ Nouvelle séance</button><button class="btn ghost grow" data-a="startFree">Séance libre</button></div>`;
  const arch = S.templates.filter(t => t.archived);
  if (arch.length) h += `<details class="mt"><summary class="muted">Séances archivées (${arch.length})</summary>${arch.map(t => `<div class="list-i" data-a="editTemplate" data-id="${t.id}">${esc(t.name)}</div>`).join('')}</details>`;
  return h;
}

function templateEditor(t) {
  const isNew = !S.templates.some(x => x.id === t.id);
  const rows = t.exercises.map((x, i) => {
    const ex = exById(x.exId);
    return `<div class="tpl-ex" data-i="${i}">
      <div class="row between"><b class="grow">${i + 1}. ${esc(ex?.name || '?')}${x.superset ? ' ' + badge('superset') : ''}</b>
      <div class="row"><button class="icon-btn" data-a="tplMove" data-i="${i}" data-d="-1" aria-label="Monter">↑</button><button class="icon-btn" data-a="tplMove" data-i="${i}" data-d="1" aria-label="Descendre">↓</button>
      <button class="icon-btn" data-a="tplSwap" data-i="${i}" aria-label="Remplacer">⇄</button><button class="icon-btn" data-a="tplRemove" data-i="${i}" aria-label="Retirer">✕</button></div></div>
      <div class="grid3">${field('Séries', `<input type="number" inputmode="numeric" min="1" max="10" name="sets_${i}" value="${x.sets || 3}">`)}
      ${field('Reps', `<input name="range_${i}" value="${esc((x.ranges || [])[0] || ex?.repRange || '')}" placeholder="8-12">`)}
      ${field('Repos (s)', `<input type="number" inputmode="numeric" name="rest_${i}" value="${x.rest || ex?.rest || ''}" placeholder="${S.profile.defaultRest}">`)}</div>
      ${x.note ? `<small class="muted">${esc(x.note)}</small>` : ''}</div>`;
  }).join('');
  return `<form id="tplForm">${field('Nom', inp('name', t.name, 'required'))}
    ${field('Jour habituel', sel('day', [['', '—'], ...[1, 2, 3, 4, 5, 6, 0].map(d => [d, JOURS_LONG[d]])], t.day ?? ''))}
    <h4>Exercices</h4>${rows || '<p class="muted">Aucun exercice.</p>'}
    <button type="button" class="btn ghost w100" data-a="tplAdd">+ Ajouter un exercice</button>
    <div class="row gap mt"><button type="button" class="btn grow" data-a="tplSave">Enregistrer</button></div>
    ${isNew ? '' : `<div class="row gap mt"><button type="button" class="btn ghost grow" data-a="tplVariant">Créer une variante</button>
      <button type="button" class="btn ghost grow" data-a="tplArchive">${t.archived ? 'Désarchiver' : 'Archiver'}</button></div>
      <button type="button" class="btn ghost danger w100 mt-s" data-a="tplDelete">Supprimer cette séance type</button>
      <p class="muted small">Supprimer une séance type n'efface aucune séance réalisée de ton historique.</p>`}</form>`;
}

let editing = null, editSheet = null;
function readTplForm() {
  const f = formData(editSheet.body);
  editing.name = f.name.trim() || editing.name; editing.day = f.day === '' ? null : +f.day;
  editing.exercises.forEach((x, i) => { x.sets = +f['sets_' + i] || x.sets; const r = f['range_' + i]; x.ranges = Array(x.sets).fill(r); x.rest = num(f['rest_' + i]); });
}
function openTemplateEditor(t) {
  editing = JSON.parse(JSON.stringify(t));
  editSheet = openSheet({ title: S.templates.some(x => x.id === t.id) ? 'Modifier la séance' : 'Nouvelle séance', body: templateEditor(editing), full: true });
}
function refreshEditor() { editSheet.set(templateEditor(editing)); }

function pickExercise(onPick, title = 'Choisir un exercice') {
  const list = q => {
    const n = norm(q);
    const items = S.exercises.filter(e => !e.archived && (!n || norm(e.name + ' ' + e.group + ' ' + e.equipment).includes(n))).sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
    return items.map(e => `<button class="list-i" data-pick="${e.id}"><b>${esc(e.name)}</b><small>${esc(e.group)} · ${esc(e.equipment || '')}</small></button>`).join('') || '<p class="muted">Aucun résultat.</p>';
  };
  const s = openSheet({
    title, body: `<input class="search" placeholder="Rechercher…" autofocus><div class="pick-list">${list('')}</div>
      <button class="btn ghost w100 mt" data-new>+ Créer un nouvel exercice</button>`
  });
  const inpEl = s.body.querySelector('input');
  inpEl.oninput = () => s.body.querySelector('.pick-list').innerHTML = list(inpEl.value);
  s.body.addEventListener('click', e => {
    const b = e.target.closest('[data-pick]'); if (b) { s.close(); onPick(exById(b.dataset.pick)); }
    if (e.target.closest('[data-new]')) { s.close(); editExercise({ id: uid('ex_'), name: inpEl.value, group: 'Pectoraux', secondary: [], equipment: 'machine', movement: 'isolation', source: 'app' }, ex => onPick(ex)); }
  });
}

actions({
  subtab(el) { R.sub[el.dataset.k] = el.dataset.v; rerender(); },
  startTpl(el) { const t = S.templates.find(x => x.id === el.dataset.id); startWorkout(t); },
  startFree() { startWorkout({ id: null, name: 'Séance libre', exercises: [] }); },
  newTemplate() { openTemplateEditor({ id: uid('tpl_'), name: 'Nouvelle séance', day: null, exercises: [], source: 'app' }); },
  editTemplate(el) { openTemplateEditor(S.templates.find(x => x.id === el.dataset.id)); },
  tplMove(el) { readTplForm(); const i = +el.dataset.i, j = i + +el.dataset.d; const a = editing.exercises; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; refreshEditor(); },
  tplRemove(el) { readTplForm(); editing.exercises.splice(+el.dataset.i, 1); refreshEditor(); },
  tplAdd() { readTplForm(); pickExercise(ex => { editing.exercises.push({ exId: ex.id, sets: 3, ranges: Array(3).fill(ex.repRange || '8-12'), rest: ex.rest || null }); refreshEditor(); }); },
  tplSwap(el) { readTplForm(); const i = +el.dataset.i; pickExercise(ex => { editing.exercises[i].replacedFrom = editing.exercises[i].exId; editing.exercises[i].exId = ex.id; refreshEditor(); }, 'Remplacer par…'); },
  async tplSave() { readTplForm(); editing.updatedAt = Date.now(); await put('templates', editing); editSheet.close(); toast('Séance enregistrée'); rerender(); },
  async tplVariant() {
    readTplForm(); const base = editing.variantOf ? editing.variantOf : editing.id;
    const v = JSON.parse(JSON.stringify(editing)); v.id = uid('tpl_'); v.key = null; v.name = editing.name + ' (variante)'; v.variantOf = base; v.source = 'app';
    await put('templates', v); editSheet.close(); openTemplateEditor(v); toast('Variante créée — modifie-la librement');
  },
  async tplArchive() { readTplForm(); editing.archived = !editing.archived; await put('templates', editing); editSheet.close(); rerender(); },
  async tplDelete() { if (await confirmDlg(`Supprimer la séance type « ${editing.name} » ?`, { ok: 'Supprimer', danger: true, detail: 'Ton historique de séances réalisées est conservé.' })) { await del('templates', editing.id); editSheet.close(); rerender(); } },
});

// ----------------------------- Historique -----------------------------
function renderHistory() {
  const list = [...S.sessions].reverse();
  if (!list.length) return card('<p class="muted">Aucune séance enregistrée.</p>');
  let h = '', curM = '';
  for (const s of list.slice(0, 200)) {
    const m = s.date.slice(0, 7);
    if (m !== curM) { curM = m; h += `<h4 class="month">${new Date(s.date + 'T12:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</h4>`; }
    const ton = C.sessionTonnage(s);
    h += `<button class="list-i" data-a="openSession" data-id="${s.id}"><div class="row between"><b>${esc(s.name)}</b><span>${f0(ton)} kg</span></div>
      <small>${fdate(s.date, true)}${s.dateApprox ? ' (date estimée)' : ''} · ${C.sessionSetsCount(s)} séries${s.rpe ? ' · RPE ' + s.rpe : ''} · ${s.source === 'sheet' ? 'Google Sheets' : s.source === 'csv' ? 'CSV' : 'App'}</small></button>`;
  }
  if (list.length > 200) h += `<p class="muted small">… ${list.length - 200} séances plus anciennes (voir Progrès).</p>`;
  return h;
}

function sessionDetail(s) {
  const groups = {};
  for (const x of s.sets || []) (groups[x.exId] = groups[x.exId] || []).push(x);
  const ton = C.sessionTonnage(s);
  let h = `<div class="kpis">${kpi('Tonnage', f0(ton) + ' kg', s.sheetTonnage ? `Sheets : ${f0(s.sheetTonnage)} kg` : '')}${kpi('Séries', C.sessionSetsCount(s))}${kpi('RPE', s.rpe ?? '—')}${kpi('Durée', s.durationMin ? s.durationMin + ' min' : '—')}</div>`;
  if (s.dateApprox) h += `<p class="note">Date estimée à partir du numéro de semaine du Sheets (${esc(s.dateNote || '')}). Tu peux la corriger ci-dessous.</p>`;
  for (const [exId, sets] of Object.entries(groups)) {
    const ex = exById(exId);
    h += `<div class="ex-block"><b data-a="openExercise" data-id="${exId}" class="link">${esc(ex?.name || '?')}</b><table class="sets"><tr><th>#</th><th>Charge</th><th>Reps</th><th>1RM est.</th></tr>
    ${sets.map(x => `<tr><td>${x.setIdx || ''}</td><td>${x.w != null ? f1(x.w) + ' kg' : x.wInferred != null ? `<span class="muted" title="Vide dans le Sheets, reprise de la série précédente">(${f1(x.wInferred)})</span>` : '—'}</td><td>${x.r ?? '—'}</td><td>${C.e1rm(C.setLoad(x), x.r) ? f1(C.e1rm(C.setLoad(x), x.r)) : '—'}</td></tr>`).join('')}</table>
    ${sets.some(x => x.note) ? `<small class="muted">${sets.filter(x => x.note).map(x => esc(x.note)).join(' · ')}</small>` : ''}</div>`;
  }
  if (s.notes) h += `<p class="muted small pre">${esc(s.notes)}</p>`;
  h += `<form id="sesForm" class="mt"><div class="grid2">${field('Date', `<input type="date" name="date" value="${s.date}">`)}${field('RPE séance', `<input type="number" step="0.5" min="1" max="10" name="rpe" value="${s.rpe ?? ''}">`)}
    ${field('Durée (min)', `<input type="number" name="durationMin" value="${s.durationMin ?? ''}">`)}${field('Nom', inp('name', s.name))}</div>
    <button type="button" class="btn w100" data-a="saveSession" data-id="${s.id}">Enregistrer les modifications</button>
    <button type="button" class="btn ghost w100 mt-s" data-a="editSessionSets" data-id="${s.id}">Modifier les séries</button>
    <button type="button" class="btn ghost danger w100 mt-s" data-a="deleteSession" data-id="${s.id}">Supprimer cette séance</button></form>`;
  return h;
}
let sesSheet = null;
actions({
  openSession(el) { const s = S.sessions.find(x => x.id === el.dataset.id); sesSheet = openSheet({ title: s.name, body: sessionDetail(s), full: true }); },
  async saveSession(el) {
    const s = S.sessions.find(x => x.id === el.dataset.id); const f = formData(sesSheet.body);
    if (f.date !== s.date) { s.date = f.date; s.dateApprox = false; }
    s.rpe = num(f.rpe); s.durationMin = num(f.durationMin); s.name = f.name || s.name;
    s.editedInApp = true; s.updatedAt = Date.now(); await put('sessions', s); sesSheet.close(); toast('Séance mise à jour'); rerender();
  },
  editSessionSets(el) {
    const s = S.sessions.find(x => x.id === el.dataset.id);
    const body = `<form id="setsForm">${(s.sets || []).map((x, i) => `<div class="set-edit"><span>${esc(exById(x.exId)?.name || '?')} · ${x.setIdx || i + 1}</span>
      <input type="number" step="0.25" inputmode="decimal" name="w_${i}" value="${x.w ?? ''}" placeholder="${x.wInferred ?? 'kg'}"><input type="number" inputmode="numeric" name="r_${i}" value="${x.r ?? ''}" placeholder="reps">
      <label class="chk" title="Technique ou amplitude différente : exclue des comparaisons"><input type="checkbox" name="v_${i}" ${x.variant ? 'checked' : ''}>≠</label></div>`).join('')}
      <p class="muted small">« ≠ » : technique, amplitude ou variante différente — la série est conservée mais exclue des comparaisons de progression.</p>
      <button type="button" class="btn w100" data-a="saveSets" data-id="${s.id}">Enregistrer</button></form>`;
    openSheet({ title: 'Modifier les séries', body, full: true });
  },
  async saveSets(el) {
    const s = S.sessions.find(x => x.id === el.dataset.id); const sh = el.closest('.sheet-b'); const f = formData(sh);
    s.sets.forEach((x, i) => { x.w = num(f['w_' + i]); x.r = num(f['r_' + i]); x.variant = !!f['v_' + i]; if (x.w != null) delete x.wInferred; });
    s.editedInApp = true; await put('sessions', s); el.closest('.sheet-wrap').querySelector('[data-close]').click(); sesSheet && sesSheet.close(); toast('Séries enregistrées'); rerender();
  },
  async deleteSession(el) {
    const s = S.sessions.find(x => x.id === el.dataset.id);
    if (await confirmDlg(`Supprimer la séance « ${s.name} » du ${fdate(s.date)} ?`, { ok: 'Supprimer définitivement', danger: true, detail: 'Cette action est irréversible (sauf restauration d’une sauvegarde). Pense à exporter une sauvegarde avant.' })) {
      await del('sessions', s.id); sesSheet.close(); toast('Séance supprimée'); rerender();
    }
  }
});

// ----------------------------- Exercices ------------------------------
function renderLibrary() {
  const f = R.filters.ex || (R.filters.ex = { q: '', g: '', e: '' });
  const n = norm(f.q);
  const items = S.exercises.filter(e => !e.archived && (!f.g || e.group === f.g) && (!f.e || e.equipment === f.e) && (!n || norm(`${e.name} ${e.muscle} ${e.group} ${e.equipment}`).includes(n)));
  let h = `<input class="search" placeholder="Rechercher un exercice, un muscle, un matériel…" value="${esc(f.q)}" data-in="exSearch">
    <div class="chips scroll mt-s"><button class="chip ${!f.g ? 'on' : ''}" data-a="exGroup" data-v="">Tous</button>${C.GROUPS.map(g => `<button class="chip ${f.g === g ? 'on' : ''}" data-a="exGroup" data-v="${g}">${g}</button>`).join('')}</div>
    <div class="row gap mt-s">${sel('eq', [['', 'Tout matériel'], ...EQUIP], f.e, 'data-ch="exEquip" class="grow"')}<button class="btn ghost" data-a="newExercise">+ Exercice</button></div><div id="exList">`;
  const byG = {}; for (const e of items) (byG[e.group] = byG[e.group] || []).push(e);
  for (const g of [...C.GROUPS, 'Autre']) {
    if (!byG[g]) continue;
    h += `<h4 class="month">${g}</h4>`;
    for (const e of byG[g].sort((a, b) => a.name.localeCompare(b.name))) {
      const st = C.exerciseStats(e.id); const tr = C.exerciseTrend(e.id);
      h += `<button class="list-i" data-a="openExercise" data-id="${e.id}"><div class="row between"><b>${esc(e.name)}</b>${trendBadge(tr.status)}</div>
        <small>${esc(e.equipment || '')} · ${st.count} séance(s)${st.pr ? ` · record ${f1(st.pr.w)} kg × ${st.pr.r}` : ''}</small></button>`;
    }
  }
  return h + (items.length ? '' : '<p class="muted">Aucun exercice.</p>') + '</div>';
}
export function trendBadge(s) {
  return { progression: badge('↗ progrès', 'ok'), stagnation: badge('→ stagne', 'warn'), regression: badge('↘ baisse', 'bad'), stable: badge('stable'), insuffisant: '' }[s] || '';
}

function exerciseDetail(ex) {
  const st = C.exerciseStats(ex.id); const tr = C.exerciseTrend(ex.id); const rec = C.recommend(ex.id);
  const h = st.history;
  const pts = h.filter(e => e.topLoad).map(e => ({ date: e.date, v: e.topLoad, hollow: e.dateApprox, note: `${e.topReps} reps` }));
  const e1 = h.filter(e => e.e1rm).map(e => ({ date: e.date, v: +e.e1rm.toFixed(1), hollow: e.dateApprox }));
  const reps = h.map(e => ({ date: e.date, v: e.reps }));
  const vol = h.map(e => ({ date: e.date, v: e.volume }));
  const pct = v => v == null ? '—' : (v > 0 ? '+' : '') + f1(v) + ' %';
  let o = `<p class="muted">${esc(ex.group)}${ex.muscle && ex.muscle !== ex.group ? ' (' + esc(ex.muscle) + ')' : ''}${ex.secondary?.length ? ' · secondaires : ' + esc(ex.secondary.join(', ')) : ''} · ${esc(ex.equipment || '')} · ${esc(ex.movement || '')}</p>
    <div class="rec ${rec.kind}">${esc(rec.text)}</div>
    <div class="kpis">${kpi('Record réalisé', st.pr ? `${f1(st.pr.w)} kg × ${st.pr.r}` : '—', st.pr ? fdate(st.pr.date) : '')}
    ${kpi('1RM estimé', st.e1rmBest ? f1(st.e1rmBest.v) + ' kg' : '—', st.e1rmBest ? `Epley · ${st.e1rmBest.reliable ? 'théorique' : 'peu fiable (>12 reps)'}` : '', 'est-k')}
    ${kpi('Séances', st.count)}${kpi('Volume total', f0(st.volumeTotal) + ' kg')}</div>
    <div class="kpis">${kpi('30 j', pct(st.prog[30]))}${kpi('90 j', pct(st.prog[90]))}${kpi('180 j', pct(st.prog[180]))}${kpi('Tendance', trendBadge(tr.status) || '—')}</div>
    <p class="muted small">Progression = évolution du 1RM estimé entre la première et la dernière séance de la période. Les points creux sont des dates estimées (semaines du Sheets).</p>
    ${tr.notes.map(n => `<p class="note">${esc(n)}</p>`).join('')}
    <h4>Charge de travail max</h4>${lineChart([{ name: 'Charge', color: 'var(--green)', points: pts }], { unit: 'kg' })}
    <h4>1RM estimé (Epley)</h4>${lineChart([{ name: '1RM estimé', color: 'var(--accent)', points: e1, dashed: true }], { unit: 'kg' })}
    <h4>Répétitions totales par séance</h4>${barChart(reps, { color: 'var(--green)' })}
    <h4>Volume (charge × reps)</h4>${barChart(vol, { color: 'var(--green)', unit: 'kg' })}
    <h4>Historique</h4>`;
  for (const e of [...h].reverse()) o += `<div class="hist-row"><span>${fdate(e.date)}${e.dateApprox ? '*' : ''}</span><span>${e.sets.map(x => `${C.setLoad(x) != null ? f1(C.setLoad(x)) : '?'}×${x.r}${x.variant ? '≠' : ''}`).join('  ')}</span></div>`;
  if (!h.length) o += '<p class="muted">Aucune performance enregistrée.</p>';
  if (ex.link) o += `<p class="mt"><a href="${esc(ex.link)}" target="_blank" rel="noopener">Vidéo de l'exercice ↗</a></p>`;
  if (ex.note || ex.setting) o += `<p class="muted small">${esc([ex.note, ex.setting && 'Réglage : ' + ex.setting].filter(Boolean).join(' · '))}</p>`;
  o += `<div class="row gap mt"><button class="btn ghost grow" data-a="editExercise" data-id="${ex.id}">Modifier la fiche</button></div>`;
  return o;
}

function editExercise(ex, after) {
  const body = `<form>${field('Nom', inp('name', ex.name, 'required'))}
    <div class="grid2">${field('Groupe principal', sel('group', [...C.GROUPS, 'Autre'].map(g => [g, g]), ex.group))}${field('Muscle précis', inp('muscle', ex.muscle || ''))}</div>
    ${field('Muscles secondaires', inp('secondary', (ex.secondary || []).join(', ')), 'Séparés par des virgules')}
    <div class="grid2">${field('Matériel', sel('equipment', EQUIP, ex.equipment))}${field('Type de mouvement', sel('movement', [['polyarticulaire', 'Polyarticulaire'], ['isolation', 'Isolation']], ex.movement))}</div>
    <div class="grid2">${field('Fourchette de reps', inp('repRange', ex.repRange || '', 'placeholder="8-12"'))}${field('Repos (s)', `<input type="number" name="rest" value="${ex.rest ?? ''}">`)}</div>
    ${field('Lien vidéo', inp('link', ex.link || '', 'type="url"'))}${field('Notes / réglage machine', inp('note', ex.note || ''))}
    ${ex.inferredFields?.length ? `<p class="muted small">Matériel et type de mouvement ont été déduits du nom de l'exercice : vérifie-les.</p>` : ''}
    <button type="button" class="btn w100" data-save>Enregistrer</button>
    ${S.exercises.some(e => e.id === ex.id) ? `<button type="button" class="btn ghost w100 mt-s" data-arch>${ex.archived ? 'Réactiver' : 'Archiver'} l'exercice</button>` : ''}</form>`;
  const s = openSheet({ title: 'Fiche exercice', body, full: true });
  s.body.querySelector('[data-save]').onclick = async () => {
    const f = formData(s.body);
    Object.assign(ex, { name: f.name.trim(), group: f.group, muscle: f.muscle, secondary: f.secondary.split(',').map(x => x.trim()).filter(Boolean), equipment: f.equipment, movement: f.movement, repRange: f.repRange, rest: num(f.rest), link: f.link, note: f.note, inferredFields: [] });
    if (!ex.key) ex.key = C.exKey(ex.name);
    await put('exercises', ex); s.close(); toast('Exercice enregistré'); after && after(ex); rerender();
  };
  const a = s.body.querySelector('[data-arch]'); if (a) a.onclick = async () => { ex.archived = !ex.archived; await put('exercises', ex); s.close(); rerender(); };
}
export { editExercise, pickExercise };

actions({
  exSearch: (() => { let t; return el => { clearTimeout(t); t = setTimeout(() => { R.filters.ex.q = el.value; const pos = el.selectionStart; rerender(); const n = document.querySelector('[data-in=exSearch]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 250); }; })(),
  exGroup(el) { R.filters.ex.g = el.dataset.v; rerender(); },
  exEquip(el) { R.filters.ex.e = el.value; rerender(); },
  openExercise(el) { const ex = exById(el.dataset.id); openSheet({ title: ex.name, body: exerciseDetail(ex), full: true }); },
  editExercise(el) { editExercise(exById(el.dataset.id)); },
  newExercise() { editExercise({ id: uid('ex_'), name: '', group: 'Pectoraux', secondary: [], equipment: 'machine', movement: 'isolation', source: 'app' }); }
});

// ----------------------------- Analyse --------------------------------
function renderAnalysis() {
  const wk = C.weeklyTonnage(16);
  const to = todayStr();
  const lastSession = C.doneSessions().slice(-1)[0];
  // si l'historique est ancien, on analyse les 4 dernières semaines où il y a eu des séances
  const ref = lastSession && lastSession.date < addDays(to, -28) ? lastSession.date : to;
  const mv = C.muscleVolume(addDays(ref, -27), ref);
  const wkRef = ref !== to ? C.weeklyTonnage(16, ref) : wk;
  let h = card(`<h3>Tonnage hebdomadaire</h3>${ref !== to ? `<p class="muted small">Ta dernière séance date du ${fdate(ref)} : graphiques centrés sur cette période.</p>` : ''}
    ${barChart(wkRef.map(w => ({ date: w.date, v: w.v, note: w.n + ' séance(s)' })), { color: 'var(--green)', unit: 'kg', axisFmt: v => v >= 1000 ? (v / 1000) + 't' : v })}`);
  h += card(`<h3>Volume par groupe musculaire</h3><p class="muted small">Moyenne par semaine sur les 4 semaines jusqu'au ${fdate(ref)}. Séries directes = 1, indirectes = 0,5 (comme dans ton Sheets).</p>
    <table class="tbl"><tr><th>Groupe</th><th>Séries/sem.</th><th>Fréq./sem.</th><th>Tonnage</th></tr>
    ${C.GROUPS.map(g => { const m = mv[g]; return `<tr><td>${g}</td><td><b>${f1(m.perWeek)}</b></td><td>${f1(m.freq)}</td><td>${f0(m.tonnage / 4)} kg</td></tr>`; }).join('')}</table>`);
  // séances de la dernière semaine active
  const ss = C.doneSessions().filter(s => s.date >= addDays(ref, -6) && s.date <= ref);
  h += card(`<h3>Tonnage par séance (7 j jusqu'au ${fdate(ref)})</h3>${ss.map(s => `<div class="hist-row"><span>${fdate(s.date)} · ${esc(s.name)}</span><b>${f0(C.sessionTonnage(s))} kg</b></div>`).join('') || '<p class="muted">Aucune séance.</p>'}`);
  // exercices à surveiller
  const watch = S.exercises.map(e => ({ e, t: C.exerciseTrend(e.id) })).filter(x => x.t.status === 'stagnation' || x.t.status === 'regression');
  h += card(`<h3>À surveiller</h3>${watch.map(x => `<button class="list-i" data-a="openExercise" data-id="${x.e.id}"><div class="row between"><b>${esc(x.e.name)}</b>${trendBadge(x.t.status)}</div></button>`).join('') || '<p class="muted">Aucune stagnation ni régression détectée.</p>'}`);
  return h;
}
