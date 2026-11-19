// =====================================================================
// views-profile.js — Profil, paramètres, import/export, sauvegardes
// =====================================================================
import { S, put, putMany, del, clearStore, kvSet, getAllRaw, uid, esc, f0, f1, fdate, todayStr, num, saveProfile, saveSettings, download, requestPersist, addDays, dstr } from './core.js';
import * as C from './calc.js';
import * as I from './importer.js';
import { R, VIEWS, rerender, go } from './nav.js';
import { actions, openSheet, toast, card, kpi, badge, seg, field, inp, sel, formData, confirmDlg, closeAllSheets } from './ui.js';

export const APP_VERSION = '1.0.3';

VIEWS.profil = () => {
  const p = S.profile;
  let o = `<div class="row between"><h1 class="title">Profil</h1><button class="link" data-a="goTab" data-t="home">Fermer</button></div>`;
  o += card(`<h3>Mes informations</h3><form id="profForm"><div class="grid2">
    ${field('Sexe', sel('sex', [['m', 'Homme'], ['f', 'Femme']], p.sex))}${field('Âge', `<input type="number" name="age" value="${p.age}">`)}
    ${field('Taille (cm)', `<input type="number" name="height" value="${p.height}">`)}${field('Poids de référence (kg)', `<input type="number" step="0.1" name="weight" value="${p.weight}">`, `Saisi le ${fdate(p.weightDate)} ; remplacé par toute pesée plus récente`)}
    ${field('Objectif', sel('goal', [['bulk', 'Prise de masse'], ['maintain', 'Maintien'], ['cut', 'Sèche']], p.goal))}${field('Séances / semaine', `<input type="number" name="trainingFreq" value="${p.trainingFreq}">`)}
    ${field('Objectif de pas', `<input type="number" name="stepGoal" value="${p.stepGoal}">`)}${field('Niveau d’activité habituel', sel('activityLevel', [['variable', 'Variable (cours / travail en magasin)'], ['sedentaire', 'Plutôt sédentaire'], ['actif', 'Plutôt actif']], p.activityLevel), 'Indicatif : le calcul utilise tes pas réels')}
    ${field('Pas « journée de travail active »', `<input type="number" name="activeWorkSteps" value="${p.activeWorkSteps}">`, 'Utilisé si tu coches « travail actif » sans saisir tes pas')}${field('Pas inclus dans la base', `<input type="number" name="baselineSteps" value="${p.baselineSteps}">`, 'Déjà comptés dans BMR × 1,2')}
    ${field('Longueur de foulée (cm)', `<input type="number" name="strideCm" value="${p.strideCm ?? ''}" placeholder="${f0(C.strideM(p) * 100)} (estimée)">`)}${field('Repos par défaut (s)', `<input type="number" name="defaultRest" value="${p.defaultRest}">`)}
    ${field('Objectif d’eau (ml)', `<input type="number" step="250" name="waterGoal" value="${p.waterGoal}">`)}</div>
    <label class="chk-row"><input type="checkbox" name="stepsIncludeRuns" ${p.stepsIncludeRuns ? 'checked' : ''}> Mes pas mesurés incluent ceux de mes sorties course (anti double comptage)</label>
    <h4>Incréments de charge suggérés (kg)</h4><div class="grid3">${Object.entries(p.increments).map(([k, v]) => field(k, `<input type="number" step="0.25" name="inc_${k}" value="${v}">`)).join('')}</div>
    <button type="button" class="btn w100" data-a="saveProfile">Enregistrer</button></form>
    <p class="muted small">Métabolisme de base (Mifflin-St Jeor) : <b>${f0(C.bmr(Object.assign({}, p, { weight: C.weightAt(todayStr()) })))} kcal</b> avec ${f1(C.weightAt(todayStr()))} kg.</p>`);

  const pending = S.staging.filter(s => s.status === 'pending'), done = S.staging.filter(s => s.status === 'committed');
  o += card(`<h3>Google Sheets & imports</h3>
    <p class="small">Exporte ton Google Sheets (Fichier › Télécharger › Microsoft Excel .xlsx) puis importe-le ici. Les feuilles <b>TRAINING</b> (séances) et <b>TRACKING</b> (poids, pas) sont reconnues automatiquement. Les données restent <b>en attente</b> jusqu'à ta validation, et une réimportation ne crée pas de doublons.</p>
    <button class="btn w100" data-a="openImport">Importer un fichier (.xlsx, .csv, .json)</button>
    ${pending.map(s => `<button class="banner mt-s" data-a="openStaging" data-id="${s.id}">En attente : ${esc(s.fileName || s.source)} — ${s.diff.newSessions} nouvelles séances</button>`).join('')}
    ${done.length ? `<details class="mt-s"><summary class="small">Imports validés (${done.length})</summary>${done.map(s => `<div class="hist-row small"><span>${fdate(dstr(new Date(s.committedAt)))} · ${esc(s.fileName || s.source)}</span><span>${s.result?.sessions || 0} séances<button class="link small" data-a="rollback" data-id="${s.id}">annuler</button></span></div>`).join('')}</details>` : ''}
    ${S.sessions.some(s => s.source === 'sheet') ? (() => { const last = S.sessions.filter(s => s.source === 'sheet' && s.week != null).sort((a, b) => b.week - a.week || (a.date < b.date ? 1 : -1))[0]; return `<details class="mt-s"><summary class="small">Recaler les dates des séances du Sheets</summary>
    <p class="small muted">Le Sheets numérote les semaines sans année. Indique le lundi d'une semaine connue : toutes les séances importées sont replacées à leur jour habituel. Actuellement, la semaine ${last.week} (la plus récente) commence le ${fdate(addDays(last.date, -((new Date(last.date + 'T12:00').getDay() + 6) % 7)))}.</p>
    <form id="redateForm"><div class="grid2">${field('Semaine n°', `<input type="number" name="week" value="${last.week}">`)}${field('commence le lundi', `<input type="date" name="date" value="">`)}</div>
    <button type="button" class="btn ghost w100" data-a="redate">Recaler les dates</button></form></details>`; })() : ''}
    <details class="mt-s"><summary class="small">Connexion directe à Google Sheets (avancé)</summary>
    <p class="small muted">Lecture seule via l'API Google, uniquement si tu crées un identifiant OAuth (Client ID) dans Google Cloud et autorises l'adresse de l'app. Sans cela, aucune synchronisation automatique n'est possible — utilise l'export .xlsx. Voir <i>docs/GUIDE-IMPORT-GOOGLE-SHEETS.md</i>.</p>
    <form id="gForm">${field('Client ID OAuth', inp('clientId', S.settings.google.clientId))}${field('ID du Google Sheets', inp('spreadsheetId', S.settings.google.spreadsheetId), 'La partie entre /d/ et /edit dans l’URL')}
    <button type="button" class="btn ghost w100" data-a="googleFetch">Se connecter et lire le Sheets</button></form></details>`);

  o += card(`<h3>Sauvegarde & restauration</h3>
    <p class="small">Tes données sont stockées uniquement sur cet appareil (IndexedDB). Exporte régulièrement une sauvegarde complète (fichier JSON) vers Fichiers / iCloud Drive.${S.settings.lastBackupAt ? ` Dernière : ${fdate(dstr(new Date(S.settings.lastBackupAt)))}.` : ' <b>Aucune sauvegarde exportée pour l’instant.</b>'}</p>
    <div class="col gap"><button class="btn" data-a="exportJSON">Exporter une sauvegarde complète (JSON)</button>
    <label class="btn ghost">Restaurer une sauvegarde<input type="file" accept=".json,application/json" hidden data-ch="restoreJSON"></label>
    <button class="btn ghost" data-a="exportCSV">Exporter les séances (CSV)</button><button class="btn ghost" data-a="exportNutriCSV">Exporter le journal alimentaire (CSV)</button>
    <button class="btn ghost" data-a="snapshots">Copies automatiques locales</button></div>
    <p class="muted small mt-s">Une copie automatique locale est faite chaque jour à l'ouverture et avant chaque import ou restauration (5 dernières conservées). Elle ne protège pas contre la perte du téléphone : l'export reste indispensable.</p>`);

  const r = S.settings.reminders;
  o += card(`<h3>Rappels</h3><form id="remForm">
    <label class="chk-row"><input type="checkbox" name="weigh" ${r.weigh ? 'checked' : ''}> Rappel de pesée les ${['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'].map((d, i) => `<label class="mini"><input type="checkbox" name="wd_${i}" ${r.weighDays.includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</label>
    <label class="chk-row"><input type="checkbox" name="training" ${r.training ? 'checked' : ''}> Rappel des séances prévues</label>
    <label class="chk-row"><input type="checkbox" name="nutrition" ${r.nutrition ? 'checked' : ''}> Rappel de saisie nutritionnelle (le soir)</label>
    ${field('Rappel de sauvegarde tous les (jours)', `<input type="number" name="backupEveryDays" value="${r.backupEveryDays}">`)}
    <button type="button" class="btn w100" data-a="saveReminders">Enregistrer</button></form>
    <p class="muted small">Les rappels s'affichent à l'ouverture de l'app. Une web-app ne peut pas programmer seule des notifications locales sur iPhone : pour être notifié même app fermée, ajoute les rappels à ton calendrier.</p>
    <button class="btn ghost w100" data-a="exportICS">Ajouter les rappels au calendrier (.ics)</button>`);

  o += card(`<h3>Apple Santé</h3><p class="small">Une PWA ne peut pas accéder directement à HealthKit. Utilise le Raccourci iOS (onglet Activité › Sources) ou l'export Apple Santé. Guide : <i>docs/GUIDE-APPLE-SANTE.md</i>.</p><button class="btn ghost w100" data-a="goSources">Ouvrir les sources de données</button>`);
  o += card(`<h3>Stockage</h3><div id="storageInfo" class="small muted">…</div><button class="btn ghost w100 mt-s" data-a="persist">Demander un stockage persistant</button>
    <button class="btn ghost danger w100 mt" data-a="resetAll">Effacer toutes les données de l'app</button><p class="muted small center mt">Version ${APP_VERSION}</p>`);
  setTimeout(storageInfo, 0);
  return o;
};

async function storageInfo() {
  const el = document.getElementById('storageInfo'); if (!el) return;
  let t = `${S.sessions.length} séances · ${S.exercises.length} exercices · ${Object.keys(S.days).length} jours · ${S.runs.length} sorties · ${S.foodLog.length} aliments journalisés · ${S.foods.length} produits`;
  try { const e = await navigator.storage.estimate(); const pers = await navigator.storage.persisted?.(); t += `<br>Espace utilisé : ${f1(e.usage / 1048576)} Mo${pers ? ' · stockage persistant ✓' : ' · stockage non persistant (peut être purgé par le système si l’espace manque)'}`; } catch (e) { }
  el.innerHTML = t;
}

// ----------------------------- Sauvegardes -----------------------------
async function blobToDataURL(b) { return new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); }
async function dataURLToBlob(u) { return (await fetch(u)).blob(); }
export async function buildBackup(withPhotos = true) {
  const data = { profile: S.profile, settings: S.settings, calib: S.calib, stepGoals: S.stepGoals };
  for (const s of ['exercises', 'templates', 'sessions', 'runs', 'foods', 'foodLog', 'recipes']) data[s] = S[s];
  data.days = Object.values(S.days);
  data.staging = S.staging.filter(s => s.status === 'pending');
  const out = { app: 'performance-muscu-nutrition', version: 1, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), data };
  if (withPhotos) { const ph = await getAllRaw('photos'); out.photos = await Promise.all(ph.map(async p => ({ id: p.id, date: p.date, blob: await blobToDataURL(p.blob), thumb: p.thumb ? await blobToDataURL(p.thumb) : null }))); }
  return out;
}
export async function autoSnapshot(reason = 'auto') {
  try {
    if (!S.sessions.length && !Object.keys(S.days).length && !S.foodLog.length) return;
    const b = await buildBackup(false);
    await put('backups', { id: 'bk_' + Date.now(), at: Date.now(), reason, data: b });
    const all = (await getAllRaw('backups')).sort((a, c) => c.at - a.at);
    for (const x of all.slice(5)) await del('backups', x.id);
    S.settings.lastAutoSnapshot = Date.now(); await saveSettings();
  } catch (e) { console.warn('snapshot', e); }
}
async function restore(b, mode) {
  await autoSnapshot('avant restauration');
  const d = b.data;
  if (mode === 'replace') for (const s of ['exercises', 'templates', 'sessions', 'runs', 'foods', 'foodLog', 'recipes', 'days', 'staging']) await clearStore(s);
  for (const s of ['exercises', 'templates', 'sessions', 'runs', 'foods', 'foodLog', 'recipes', 'staging']) if (d[s]) await putMany(s, d[s]);
  if (d.days) await putMany('days', d.days);
  if (mode === 'replace' || !S.profile) { await kvSet('profile', Object.assign({}, S.profile, d.profile)); await kvSet('settings', Object.assign({}, S.settings, d.settings)); if (d.calib) await kvSet('calib', d.calib); if (d.stepGoals) await kvSet('stepGoals', d.stepGoals); }
  if (b.photos) for (const p of b.photos) await put('photos', { id: p.id, date: p.date, blob: await dataURLToBlob(p.blob), thumb: p.thumb ? await dataURLToBlob(p.thumb) : null });
}

function csvCell(v) { v = v == null ? '' : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

// ----------------------------- Import / staging ------------------------
function importSheet() {
  const s = openSheet({
    title: 'Importer', body: `<p class="small">Formats acceptés :</p><ul class="small"><li><b>.xlsx</b> exporté depuis Google Sheets (recommandé)</li><li><b>.json</b> « import-initial-google-sheets.json » fourni avec l'app, ou sauvegarde de l'app</li><li><b>.csv</b> d'une feuille, ou tableau « date ; séance ; exercice ; série ; reps ; poids »</li></ul>
    <label class="btn w100">Choisir un fichier<input type="file" accept=".xlsx,.xls,.csv,.tsv,.txt,.json" hidden id="impFile"></label><div id="impMsg" class="mt-s"></div>`
  });
  s.body.querySelector('#impFile').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    const msg = s.body.querySelector('#impMsg'); msg.innerHTML = '<p class="muted">Analyse du fichier…</p>';
    try {
      const wb = await I.readWorkbook(file);
      if (wb.backup) { s.close(); restoreDialog(wb.backup); return; }
      const parsed = I.analyseWorkbook(wb);
      if (!parsed.sessions.length && !parsed.days.length) { msg.innerHTML = `<p class="note warn">Aucune donnée exploitable trouvée.<br>${parsed.warnings.map(esc).join('<br>')}</p>`; return; }
      await autoSnapshot('avant import');
      const st = await I.stageImport(parsed, { source: 'fichier', fileName: file.name });
      s.close(); stagingSheet(st); rerender();
    } catch (err) { console.error(err); msg.innerHTML = `<p class="note warn">Import impossible : ${esc(err.message)}</p>`; }
  };
}

function stagingSheet(st) {
  const d = st.diff;
  const byTpl = {}; for (const x of st.sessions) (byTpl[x.name] = byTpl[x.name] || []).push(x);
  const dates = st.sessions.map(x => x.date).filter(Boolean).sort();
  const daysDates = (st.days || []).map(x => x.date).sort();
  const sheetCheck = st.sessions.filter(x => x.sheetTonnage).map(x => { const t = x.sets.reduce((a, y) => a + ((y.w ?? y.wInferred ?? 0) * (y.r || 0)), 0); return { x, t, diff: Math.abs(t - x.sheetTonnage) / x.sheetTonnage }; });
  const okCheck = sheetCheck.filter(c => c.diff < 0.02).length;
  const s = openSheet({
    title: 'Vérifier avant intégration', full: true, body: `
    <p class="small">Fichier : <b>${esc(st.fileName || st.source)}</b>. Rien n'est encore intégré à ton historique.</p>
    <div class="kpis">${kpi('Séances', st.sessions.length, `${d.newSessions} nouvelles · ${d.updatedSessions} modifiées · ${d.sameSessions} identiques`)}${kpi('Séries', d.sets)}${kpi('Exercices', st.exercises.length, d.newExercises + ' nouveaux')}${kpi('Jours (poids/pas)', (st.days || []).length, `${d.newDays} nouveaux`)}</div>
    ${d.conflicts ? `<p class="note warn">${d.conflicts} séance(s) modifiée(s) dans l'app ne seront pas écrasées.</p>` : ''}
    ${st.anchor ? `<h4>Dates des séances</h4><p class="small">Le Sheets numérote les semaines. ${st.anchor.detected ? `Repère trouvé : <b>${esc(st.anchor.label)}</b> → lundi ${fdate(st.anchor.date)}.` : 'Aucun repère de date trouvé.'} Les séances sont placées au jour habituel indiqué dans « Répartition des trainings ». Corrige si besoin :</p>
      <div class="grid2">${field('Semaine n°', `<input type="number" id="aw" value="${st.anchor.week}">`)}${field('commence le lundi', `<input type="date" id="ad" value="${st.anchor.date || ''}">`)}</div><button class="btn ghost w100" id="reanchor">Recalculer les dates</button>
      <p class="small mt-s">Période : ${dates.length ? fdate(dates[0]) + ' → ' + fdate(dates[dates.length - 1]) : '—'} · semaines ${st.weeks?.[0] ?? '?'} à ${st.weeks?.[st.weeks.length - 1] ?? '?'}</p>` : ''}
    <h4>Séances détectées</h4>${st.templates.map(t => `<div class="hist-row"><span><b>${esc(t.name)}</b><small class="d-block muted">${t.exercises.length} exercices · ${t.day != null ? 'jour : ' + ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][t.day] : 'jour non trouvé'}</small></span><span>${(byTpl[t.name] || []).length} séances</span></div>`).join('')}
    ${sheetCheck.length ? `<p class="small mt-s">Contrôle : tonnage recalculé identique à celui du Sheets pour <b>${okCheck}/${sheetCheck.length}</b> séances.${okCheck < sheetCheck.length ? ' Les écarts viennent des charges laissées vides dans le Sheets (reprises de la série précédente) ou de formules du Sheets.' : ''}</p>` : ''}
    ${(st.days || []).length ? `<p class="small">Suivi journalier : ${fdate(daysDates[0])} → ${fdate(daysDates[daysDates.length - 1])} · ${(st.days || []).filter(x => x.weight).length} pesées · ${(st.days || []).filter(x => x.steps).length} jours avec pas.</p>` : ''}
    <h4>Exercices</h4><div class="chips">${st.exercises.map(e => `<span class="chip">${esc(e.name)} <small>· ${esc(e.group)}</small></span>`).join('')}</div>
    ${st.warnings.length ? `<details class="mt" open><summary>Points à vérifier (${st.warnings.length})</summary><ul class="small">${st.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
    <p class="muted small mt">Aucune charge ni performance n'est inventée : les cellules vides restent vides (une charge vide entre deux séries renseignées est marquée « reprise de la série précédente »).</p>
    <button class="btn w100 big mt" id="commit">Valider l'intégration</button><button class="btn ghost w100 mt-s" id="discard">Abandonner cet import</button>`
  });
  const ra = s.body.querySelector('#reanchor');
  if (ra) ra.onclick = async () => { const w = num(s.body.querySelector('#aw').value), dt = s.body.querySelector('#ad').value; if (!w || !dt) return toast('Semaine et date requises'); I.reanchor(st, dt, w); await put('staging', st); s.close(); stagingSheet(st); };
  s.body.querySelector('#commit').onclick = async () => {
    try { const r = await I.commitImport(st); s.close(); toast(`Intégré : ${r.sessions} séances, ${r.days} jours, ${r.exercises} exercices`); go('muscu', 'historique'); }
    catch (e) { toast(e.message, 4000); }
  };
  s.body.querySelector('#discard').onclick = async () => { if (await confirmDlg('Abandonner cet import ? Ton historique n’est pas modifié.')) { await I.discardImport(st.id); s.close(); rerender(); } };
}

function restoreDialog(b) {
  const d = b.data || {};
  const s = openSheet({
    title: 'Restaurer une sauvegarde', body: `<p class="small">Sauvegarde du ${b.exportedAt ? new Date(b.exportedAt).toLocaleString('fr-FR') : '?'} : ${d.sessions?.length || 0} séances, ${d.days?.length || 0} jours, ${d.foodLog?.length || 0} entrées alimentaires, ${b.photos?.length || 0} photos.</p>
    <button class="btn w100" data-m="merge">Fusionner avec mes données actuelles</button><p class="muted small">Ajoute et met à jour, ne supprime rien.</p>
    <button class="btn ghost danger w100 mt" data-m="replace">Tout remplacer par cette sauvegarde</button><p class="muted small">Efface les données actuelles (une copie locale est faite avant).</p>`
  });
  s.body.querySelectorAll('[data-m]').forEach(btn => btn.onclick = async () => {
    const m = btn.dataset.m;
    if (m === 'replace' && !await confirmDlg('Remplacer TOUTES les données actuelles par cette sauvegarde ?', { danger: true, ok: 'Tout remplacer', detail: 'Tes séances, journaux et réglages actuels seront effacés. Une copie automatique locale est créée juste avant.' })) return;
    await restore(b, m); s.close(); toast('Sauvegarde restaurée'); rerender();
  });
}

actions({
  openImport() { importSheet(); },
  async redate() {
    const f = formData(document.getElementById('redateForm')); const w = num(f.week);
    if (!w || !f.date) { toast('Indique la semaine et la date du lundi'); return; }
    const d = new Date(f.date + 'T12:00'); if (d.getDay() !== 1 && !await confirmDlg(`Le ${fdate(f.date)} n'est pas un lundi. Continuer quand même ?`)) return;
    await autoSnapshot('avant recalage des dates');
    const n = await I.redateSheetSessions(w, f.date); toast(`${n} séance(s) redatée(s)`); rerender();
  },
  openStaging(el) { const st = S.staging.find(x => x.id === el.dataset.id); if (st) stagingSheet(st); },
  async rollback(el) {
    const st = S.staging.find(x => x.id === el.dataset.id);
    if (await confirmDlg(`Annuler l'import « ${st.fileName || st.source} » ?`, { danger: true, ok: 'Supprimer ses séances', detail: 'Les séances issues de cet import (non modifiées dans l’app) seront supprimées. Exercices, jours et séances types sont conservés.' })) { await autoSnapshot('avant annulation import'); const n = await I.rollbackImport(st.id); await del('staging', st.id); toast(n + ' séances retirées'); rerender(); }
  },
  async googleFetch() {
    const f = formData(document.getElementById('gForm')); S.settings.google = { clientId: f.clientId.trim(), spreadsheetId: f.spreadsheetId.trim() }; await saveSettings();
    try { toast('Connexion à Google…'); const wb = await I.fetchGoogleSheets(S.settings.google); const parsed = I.analyseWorkbook(wb); await autoSnapshot('avant import'); const st = await I.stageImport(parsed, { source: 'Google Sheets (API)', fileName: 'Google Sheets' }); stagingSheet(st); rerender(); }
    catch (e) { toast('Google : ' + e.message, 5000); }
  },
  async saveProfile() {
    const f = formData(document.getElementById('profForm')); const p = S.profile;
    const w = num(f.weight); if (w != null && w !== p.weight) p.weightDate = todayStr();
    for (const k of ['age', 'height', 'weight', 'trainingFreq', 'stepGoal', 'activeWorkSteps', 'baselineSteps', 'defaultRest', 'waterGoal']) { const v = num(f[k]); if (v != null) p[k] = v; }
    p.sex = f.sex; p.goal = f.goal; p.activityLevel = f.activityLevel; p.strideCm = num(f.strideCm); p.stepsIncludeRuns = !!f.stepsIncludeRuns;
    for (const k of Object.keys(p.increments)) { const v = num(f['inc_' + k]); if (v != null) p.increments[k] = v; }
    await saveProfile(); toast('Profil enregistré'); rerender();
  },
  async saveReminders() {
    const f = formData(document.getElementById('remForm'));
    S.settings.reminders = { weigh: !!f.weigh, weighDays: [0, 1, 2, 3, 4, 5, 6].filter(i => f['wd_' + i]), training: !!f.training, nutrition: !!f.nutrition, backupEveryDays: num(f.backupEveryDays) || 0 };
    await saveSettings(); toast('Rappels enregistrés');
  },
  exportICS() {
    const r = S.settings.reminders; const BY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const d0 = todayStr().replace(/-/g, '');
    const ev = (id, title, rrule, time) => `BEGIN:VEVENT\r\nUID:${id}@perf-app\r\nDTSTAMP:${d0}T000000Z\r\nDTSTART:${d0}T${time}00\r\nRRULE:${rrule}\r\nSUMMARY:${title}\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:PT0M\r\nDESCRIPTION:${title}\r\nEND:VALARM\r\nEND:VEVENT\r\n`;
    let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Performance//FR\r\n';
    if (r.weigh && r.weighDays.length) ics += ev('weigh', 'Pesée à jeun', `FREQ=WEEKLY;BYDAY=${r.weighDays.map(i => BY[i]).join(',')}`, '0730');
    if (r.nutrition) ics += ev('nutri', 'Saisir mon journal alimentaire', 'FREQ=DAILY', '2100');
    if (r.training) for (const t of S.templates.filter(x => x.day != null && !x.archived)) ics += ev('tr-' + t.id, 'Séance : ' + t.name, `FREQ=WEEKLY;BYDAY=${BY[t.day]}`, '1800');
    if (r.backupEveryDays) ics += ev('backup', 'Exporter la sauvegarde Performance', `FREQ=DAILY;INTERVAL=${r.backupEveryDays}`, '2000');
    ics += 'END:VCALENDAR\r\n';
    download('rappels-performance.ics', ics, 'text/calendar');
  },
  async exportJSON() {
    const b = await buildBackup(true);
    download(`sauvegarde-performance-${todayStr()}.json`, JSON.stringify(b));
    S.settings.lastBackupAt = Date.now(); await saveSettings(); toast('Sauvegarde exportée'); rerender();
  },
  async restoreJSON(el) {
    const file = el.files[0]; if (!file) return; el.value = '';
    try { const b = JSON.parse(await file.text()); if (b.app !== 'performance-muscu-nutrition') throw new Error('Ce fichier n’est pas une sauvegarde de l’app'); restoreDialog(b); }
    catch (e) { toast(e.message, 4000); }
  },
  exportCSV() {
    const ex = id => S.exercises.find(e => e.id === id);
    let csv = 'date;date_estimee;seance;exercice;groupe;serie;reps;poids_kg;poids_deduit_kg;rpe_seance;source;remarque\n';
    for (const s of C.doneSessions()) for (const x of s.sets || []) csv += [s.date, s.dateApprox ? 'oui' : '', s.name, ex(x.exId)?.name, ex(x.exId)?.group, x.setIdx, x.r, x.w, x.wInferred, s.rpe, s.source, x.note].map(csvCell).join(';') + '\n';
    download(`seances-${todayStr()}.csv`, '﻿' + csv, 'text/csv');
  },
  exportNutriCSV() {
    let csv = 'date;repas;aliment;marque;quantite_g_ml;kcal;proteines;glucides;lipides\n';
    for (const e of [...S.foodLog].sort((a, b) => a.date < b.date ? -1 : 1)) { const n = C.entryNutr(e); csv += [e.date, e.meal, e.name, e.brand, Math.round(e.grams), Math.round(n.kcal), n.p.toFixed(1), n.c.toFixed(1), n.f.toFixed(1)].map(csvCell).join(';') + '\n'; }
    download(`journal-alimentaire-${todayStr()}.csv`, '﻿' + csv, 'text/csv');
  },
  async snapshots() {
    const all = (await getAllRaw('backups')).sort((a, b) => b.at - a.at);
    const s = openSheet({ title: 'Copies automatiques', body: all.map(b => `<div class="hist-row"><span>${new Date(b.at).toLocaleString('fr-FR')}<small class="d-block muted">${esc(b.reason)} · ${b.data.data.sessions.length} séances</small></span><span><button class="btn small" data-dl="${b.id}">Exporter</button> <button class="btn small ghost" data-rs="${b.id}">Restaurer</button></span></div>`).join('') || '<p class="muted">Aucune copie.</p>' });
    s.body.querySelectorAll('[data-dl]').forEach(btn => btn.onclick = () => { const b = all.find(x => x.id === btn.dataset.dl); download(`copie-${new Date(b.at).toISOString().slice(0, 10)}.json`, JSON.stringify(b.data)); });
    s.body.querySelectorAll('[data-rs]').forEach(btn => btn.onclick = () => { const b = all.find(x => x.id === btn.dataset.rs); s.close(); restoreDialog(b.data); });
  },
  goSources() { go('act', 'sources'); },
  async persist() { const ok = await requestPersist(); toast(ok ? 'Stockage persistant accordé' : 'Refusé par le navigateur (installer l’app sur l’écran d’accueil aide)'); storageInfo(); },
  async resetAll() {
    if (!await confirmDlg('Effacer TOUTES les données de l’app sur cet appareil ?', { danger: true, ok: 'Continuer', detail: 'Séances, historique importé, journal alimentaire, photos, réglages. Exporte une sauvegarde avant !' })) return;
    if (!await confirmDlg('Dernière confirmation : cette action est irréversible.', { danger: true, ok: 'Tout effacer' })) return;
    for (const s of ['exercises', 'templates', 'sessions', 'runs', 'days', 'foods', 'foodLog', 'recipes', 'staging', 'photos', 'kv']) await clearStore(s);
    location.reload();
  }
});
