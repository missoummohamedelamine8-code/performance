// =====================================================================
// views-activity.js — Activité quotidienne, pas, Apple Santé, récupération
// =====================================================================
import { S, esc, f0, f1, fdate, todayStr, addDays, rangeDays, sum, avg, num, patchDay, putMany, kvSet, parseD, mondayOf, dstr } from './core.js';
import * as C from './calc.js';
import { R, VIEWS, rerender } from './nav.js';
import { actions, openSheet, toast, card, kpi, badge, seg, field, inp, formData, scale, confirmDlg } from './ui.js';
import { barChart, calendar, lineChart } from './charts.js';
import { parseCSV } from './importer.js';

VIEWS.act = () => {
  const t = todayStr(); const st = C.stepStats(t); const goal = C.stepGoalAt(t);
  const sub = R.sub.act;
  let o = `<h1 class="title">Activité</h1>` + seg('act', [['pas', 'Pas'], ['jours', 'Journées'], ['sources', 'Sources']], sub, 'subtab');
  if (sub === 'pas') {
    const d = S.days[t] || {};
    o += card(`<div class="row between"><div><small class="muted">Aujourd'hui</small><div class="big-n">${f0(d.steps || 0)} <small>pas</small></div>
      <small class="muted">${d.stepsSource ? 'source : ' + esc(d.stepsSource) : 'non saisi'} · objectif ${f0(goal)}</small></div>
      <button class="btn" data-a="quickSteps">Saisir</button></div>`);
    o += card(`<div class="kpis">${kpi('Moy. 7 j', f0(st.avg7))}${kpi('Moy. 30 j', f0(st.avg30))}${kpi('Record', st.record ? f0(st.record.steps) : '—', st.record ? fdate(st.record.date) : '')}
      ${kpi('Objectif atteint', st.hit30 + ' j', 'sur 30 jours')}${kpi('Cette semaine', f0(st.week), st.prevWeek ? `sem. préc. ${f0(st.prevWeek)} (${st.week >= st.prevWeek ? '+' : ''}${f0((st.week / st.prevWeek - 1) * 100)} %)` : '')}
      ${kpi('Distance 30 j', f0(C.stepsToKm(st.total30, S.profile)) + ' km', 'estimée')}</div>`);
    const days30 = rangeDays(addDays(t, -29), t).map(dd => ({ date: dd, v: S.days[dd]?.steps || 0 }));
    o += card(`<h3>30 derniers jours</h3>${barChart(days30, { goal, color: 'color-mix(in srgb, var(--violet) 55%, transparent)', hitColor: 'var(--violet)' })}`);
    // comparaison semaine après semaine
    const weeks = []; let m = mondayOf(t);
    for (let i = 11; i >= 0; i--) { const s = addDays(m, -7 * i); const v = rangeDays(s, addDays(s, 6)).map(x => S.days[x]?.steps).filter(Boolean); weeks.push({ date: s, v: v.length ? Math.round(avg(v)) : 0, note: v.length + ' j renseignés' }); }
    o += card(`<h3>Moyenne quotidienne par semaine</h3>${barChart(weeks, { goal, color: 'var(--violet)' })}`);
    const cm = R.filters.calMonth || t.slice(0, 7); const [yy, mm] = cm.split('-').map(Number);
    const vals = {}; for (const dd of Object.values(S.days)) if (dd.steps) vals[dd.date] = dd.steps;
    o += card(`<div class="row between"><button class="icon-btn" data-a="calNav" data-d="-1">‹</button><h3>${new Date(yy, mm - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</h3><button class="icon-btn" data-a="calNav" data-d="1">›</button></div>${calendar(yy, mm - 1, vals, goal)}`);
    o += card(`<h3>Objectif de pas</h3><p class="muted small">Actuel : <b>${f0(goal)}</b> pas/jour. Tu peux définir un objectif différent par période (ex. semaines de cours / semaines de travail).</p>
      ${(S.stepGoals || []).map((g, i) => `<div class="hist-row"><span>Depuis le ${fdate(g.from)}</span><b>${f0(g.goal)}</b><button class="icon-btn" data-a="delGoal" data-i="${i}">✕</button></div>`).join('')}
      <button class="btn ghost w100" data-a="addGoal">+ Nouvel objectif à partir d'une date</button>`);
  } else if (sub === 'jours') {
    o += `<p class="muted small">Distinction des journées sédentaires et physiquement exigeantes, avec la dépense estimée.</p>`;
    for (const dd of rangeDays(addDays(t, -20), t).reverse()) {
      const d = S.days[dd] || {}; const e = C.dayEnergy(dd, { stepsMode: 'live' }); const k = C.dayKind(dd);
      o += `<button class="list-i" data-a="editDay" data-d="${dd}"><div class="row between"><b>${fdate(dd, true)}</b>${k ? badge(k, k === 'sédentaire' ? '' : k === 'active' ? 'ok' : 'warn') : ''}</div>
        <small>${d.steps ? f0(d.steps) + ' pas' : 'pas non saisis'}${d.workActive ? ' · travail actif' : ''}${e.sessions ? ' · muscu' : ''}${e.runs ? ' · course' : ''} · dépense ≈ ${f0(e.maintenance)} kcal</small></button>`;
    }
  } else {
    o += sourcesHelp();
  }
  return o;
};

function sourcesHelp() {
  return card(`<h3>Récupérer automatiquement les pas d'Apple Santé</h3>
    <p><b>Limite réelle :</b> une application web (PWA) ne peut pas lire Apple Santé (HealthKit est réservé aux apps natives). L'app ne lit pas non plus le podomètre en arrière-plan. Voici les solutions qui fonctionnent :</p>
    <ol class="small"><li><b>Raccourci iOS (recommandé, 2 taps/jour)</b> : un Raccourci lit tes pas, ta distance, tes calories actives et tes étages dans Santé, puis copie le résultat. Dans l'app, tu touches « Coller depuis Raccourcis ». Le guide pas à pas est dans <i>docs/GUIDE-APPLE-SANTE.md</i>.</li>
    <li><b>Export complet Apple Santé</b> (Santé › profil › Exporter toutes les données) : importe le fichier <i>export.xml</i> (ou <i>exportation.xml</i>) pour récupérer tout ton historique.</li>
    <li><b>CSV</b> (date;pas;…) depuis une autre app, ou <b>saisie manuelle</b>.</li>
    <li><b>Évolution possible</b> : une petite app native compagnon (Swift/HealthKit) qui envoie les données à la PWA — architecture décrite dans le guide.</li></ol>
    <div class="col gap mt"><button class="btn" data-a="pasteShortcut">Coller depuis Raccourcis</button>
    <label class="btn ghost">Importer export.xml Apple Santé<input type="file" accept=".xml,text/xml" hidden data-ch="importHealthXML"></label>
    <label class="btn ghost">Importer un CSV de pas<input type="file" accept=".csv,.txt" hidden data-ch="importStepsCSV"></label></div>
    <p class="muted small mt">Anti double comptage : ${S.profile.stepsIncludeRuns ? 'tes pas mesurés sont considérés comme incluant ceux de tes sorties course ; la part « course » est retirée de la marche dans le calcul énergétique.' : 'tes pas mesurés sont considérés comme n’incluant pas la course.'} (modifiable dans le profil)</p>`);
}

/** Accepte JSON {date, steps, distance, activeKcal, flights, standMin} ou liste, ou lignes « date;pas ». */
export function parseHealthPaste(txt) {
  txt = txt.trim(); const out = [];
  const push = o => { const date = normDate(o.date || o.jour || o.day); if (!date) return; const d = { date }; const st = num(o.steps ?? o.pas); if (st != null) d.steps = Math.round(st); const km = num(o.distance ?? o.distanceKm ?? o.km); if (km != null) d.walkKmMeasured = km > 200 ? km / 1000 : km; const ak = num(o.activeKcal ?? o.active ?? o.calories); if (ak != null) d.activeKcalMeasured = ak; const fl = num(o.flights ?? o.etages); if (fl != null) d.floors = fl; const sm = num(o.standMin ?? o.stand); if (sm != null) d.standMin = sm; const hr = num(o.hr ?? o.fc); if (hr != null) d.hrAvg = hr; out.push(d); };
  if (txt.startsWith('{') || txt.startsWith('[')) { const j = JSON.parse(txt); (Array.isArray(j) ? j : (j.days || [j])).forEach(push); return out; }
  const rows = parseCSV(txt); const head = rows[0].map(x => x.toLowerCase());
  const hasHead = head.some(x => /date|jour/.test(x));
  const keys = hasHead ? head.map(h => /date|jour/.test(h) ? 'date' : /pas|step/.test(h) ? 'steps' : /dist/.test(h) ? 'distance' : /kcal|calor|actif|active/.test(h) ? 'activeKcal' : /etage|étage|flight/.test(h) ? 'flights' : /debout|stand/.test(h) ? 'standMin' : h) : ['date', 'steps', 'distance', 'activeKcal', 'flights'];
  for (const r of rows.slice(hasHead ? 1 : 0)) { if (!r.length || !r[0]) continue; const o = {}; keys.forEach((k, i) => o[k] = r[i]); push(o); }
  return out;
}
function normDate(v) {
  if (!v) return null; v = String(v).trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/); if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`; }
  const d = new Date(v); return isNaN(d) ? null : dstr(d);
}

async function applyHealthDays(list, sourceLabel) {
  if (!list.length) { toast('Aucune donnée reconnue'); return; }
  const objs = list.map(d => {
    const cur = S.days[d.date] || { date: d.date };
    const o = Object.assign({}, cur);
    for (const [k, v] of Object.entries(d)) if (k !== 'date' && v != null) o[k] = v;
    if (d.steps != null) o.stepsSource = sourceLabel;
    o.updatedAt = Date.now(); return o;
  });
  await putMany('days', objs);
  toast(`${objs.length} jour(s) mis à jour`); rerender();
}

/** Lecture par morceaux de l'export Apple Santé (fichier parfois > 500 Mo). */
async function importHealthXML(file, onProgress) {
  const TYPES = { HKQuantityTypeIdentifierStepCount: 'steps', HKQuantityTypeIdentifierDistanceWalkingRunning: 'walkKmMeasured', HKQuantityTypeIdentifierActiveEnergyBurned: 'activeKcalMeasured', HKQuantityTypeIdentifierFlightsClimbed: 'floors', HKQuantityTypeIdentifierAppleStandTime: 'standMin' };
  const agg = {}; // date -> type -> source -> somme
  const CH = 8 * 1024 * 1024; let off = 0, rest = '';
  const re = /<Record type="(HKQuantityTypeIdentifier\w+)" sourceName="([^"]*)"[^>]*?unit="([^"]*)"[^>]*?startDate="(\d{4}-\d{2}-\d{2})[^"]*"[^>]*?value="([\d.]+)"/g;
  while (off < file.size) {
    const txt = rest + await file.slice(off, off + CH).text(); off += CH;
    const cut = txt.lastIndexOf('<Record'); const body = off < file.size ? txt.slice(0, cut) : txt; rest = off < file.size ? txt.slice(cut) : '';
    let m; re.lastIndex = 0;
    while ((m = re.exec(body))) {
      const k = TYPES[m[1]]; if (!k) continue;
      let v = parseFloat(m[5]); if (k === 'walkKmMeasured' && m[3] === 'm') v /= 1000; if (k === 'walkKmMeasured' && m[3] === 'mi') v *= 1.609;
      if (k === 'activeKcalMeasured' && m[3] === 'kJ') v /= 4.184;
      const a = (agg[m[4]] = agg[m[4]] || {}); const t = (a[k] = a[k] || {}); t[m[2]] = (t[m[2]] || 0) + v;
    }
    onProgress && onProgress(Math.min(1, off / file.size));
  }
  // iPhone + Apple Watch comptent souvent les mêmes pas : on garde la source la plus élevée du jour
  return Object.entries(agg).map(([date, types]) => {
    const d = { date }; for (const [k, src] of Object.entries(types)) { const v = Math.max(...Object.values(src)); d[k] = k === 'steps' || k === 'floors' || k === 'standMin' ? Math.round(v) : Math.round(v * 100) / 100; }
    return d;
  });
}

export function recoveryForm(date = todayStr()) {
  const d = S.days[date] || {};
  const s = openSheet({
    title: 'Bilan récupération', body: `<form>${field('Date', `<input type="date" name="date" value="${date}">`)}
    <div class="grid2">${field('Sommeil (h)', `<input type="number" step="0.25" inputmode="decimal" name="sleepH" value="${d.sleepH ?? ''}">`)}${field('Douleur', inp('pain', d.pain || '', 'placeholder="aucune"'))}</div>
    <label class="field"><span>Qualité du sommeil</span>${scale('sleepQ', d.sleepQ, 10, ['mauvaise', 'excellente'])}</label>
    <label class="field"><span>Fatigue générale</span>${scale('fatigue', d.fatigue, 10, ['en forme', 'épuisé'])}</label>
    <label class="field"><span>Courbatures</span>${scale('soreness', d.soreness, 10, ['aucune', 'fortes'])}</label>
    <label class="field"><span>Motivation</span>${scale('motivation', d.motivation, 10, ['nulle', 'maximale'])}</label>
    <label class="field"><span>Sensation de récupération</span>${scale('recovery', d.recovery, 10, ['pas récupéré', 'totalement'])}</label>
    <button type="button" class="btn w100" data-ok>Enregistrer</button></form>`
  });
  s.body.querySelector('[data-ok]').onclick = async () => {
    const f = formData(s.body); const p = {};
    for (const k of ['sleepH', 'sleepQ', 'fatigue', 'soreness', 'motivation', 'recovery']) p[k] = num(f[k]) ?? undefined;
    p.pain = f.pain || undefined;
    await patchDay(f.date || date, p); s.close(); toast('Bilan enregistré'); rerender();
  };
}

function dayForm(date) {
  const d = S.days[date] || {}; const e = C.dayEnergy(date, { stepsMode: 'live' });
  const s = openSheet({
    title: fdate(date, true), full: true, body: `<form>
    <div class="grid2">${field('Pas', `<input type="number" inputmode="numeric" name="steps" value="${d.steps ?? ''}">`)}${field('Poids à jeun (kg)', `<input type="number" step="0.1" inputmode="decimal" name="weight" value="${d.weight ?? ''}">`)}</div>
    <label class="chk-row"><input type="checkbox" name="workActive" ${d.workActive ? 'checked' : ''}> Journée de travail physiquement active (magasin, debout, réassort…)</label>
    <div class="grid2">${field('Temps debout (min)', `<input type="number" name="standMin" value="${d.standMin ?? ''}">`)}${field('Étages gravis', `<input type="number" name="floors" value="${d.floors ?? ''}">`)}
    ${field('Calories actives (montre)', `<input type="number" name="activeKcalMeasured" value="${d.activeKcalMeasured ?? ''}">`, 'Affichées à titre de comparaison')}${field('FC moyenne', `<input type="number" name="hrAvg" value="${d.hrAvg ?? ''}">`)}
    ${field('Tour de taille (cm)', `<input type="number" step="0.5" name="waist" value="${d.waist ?? ''}">`)}${field('Eau (ml)', `<input type="number" step="50" name="water" value="${d.water ?? ''}">`)}</div>
    <h4>Autres activités</h4><div id="others">${(d.other || []).map((o, i) => otherRow(o, i)).join('')}</div>
    <button type="button" class="btn ghost w100" data-add>+ Ajouter une activité (vélo, foot, natation…)</button>
    <div class="note mt">Dépense estimée : <b>${f0(e.maintenance)} kcal</b> (base ${f0(e.base)} + marche ${f0(e.walk)} + course ${f0(e.run)} + muscu ${f0(e.strength)} + debout ${f0(e.stand)} + autres ${f0(e.other)})${e.runStepsRemoved ? `<br>${f0(e.runStepsRemoved)} pas attribués à la course retirés de la marche (anti double comptage).` : ''}</div>
    <button type="button" class="btn w100 mt" data-ok>Enregistrer</button></form>`
  });
  s.body.querySelector('[data-add]').onclick = () => { const w = s.body.querySelector('#others'); w.insertAdjacentHTML('beforeend', otherRow({}, w.children.length)); };
  s.body.querySelector('[data-ok]').onclick = async () => {
    const f = formData(s.body); const p = {};
    for (const k of ['steps', 'weight', 'standMin', 'floors', 'activeKcalMeasured', 'hrAvg', 'waist', 'water']) p[k] = num(f[k]) ?? undefined;
    if (p.steps != null && p.steps !== d.steps) p.stepsSource = 'saisie manuelle';
    p.workActive = f.workActive || undefined;
    const other = []; s.body.querySelectorAll('.other-row').forEach(r => { const l = r.querySelector('[data-k=l]').value, m = num(r.querySelector('[data-k=m]').value), met = num(r.querySelector('[data-k=met]').value); if (l && m) other.push({ label: l, min: m, met: met || 5 }); });
    p.other = other.length ? other : undefined;
    await patchDay(date, p); s.close(); toast('Journée enregistrée'); rerender();
  };
}
function otherRow(o, i) { return `<div class="other-row grid3"><input data-k="l" placeholder="Activité" value="${esc(o.label || '')}"><input data-k="m" type="number" placeholder="min" value="${o.min ?? ''}"><input data-k="met" type="number" step="0.5" placeholder="MET (intensité)" value="${o.met ?? ''}" title="3 = léger, 5 = modéré, 8 = intense"></div>`; }

actions({
  quickSteps() {
    const t = todayStr(); const d = S.days[t] || {};
    const s = openSheet({ title: 'Pas du jour', body: `<form>${field('Date', `<input type="date" name="date" value="${t}">`)}${field('Nombre de pas', `<input type="number" inputmode="numeric" name="steps" value="${d.steps ?? ''}" autofocus>`)}
      <button type="button" class="btn w100" data-ok>Enregistrer</button><button type="button" class="btn ghost w100 mt-s" data-paste>Coller depuis Raccourcis</button></form>` });
    s.body.querySelector('[data-ok]').onclick = async () => { const f = formData(s.body); const v = num(f.steps); if (v == null) return; await patchDay(f.date, { steps: Math.round(v), stepsSource: 'saisie manuelle' }); s.close(); toast('Pas enregistrés'); rerender(); };
    s.body.querySelector('[data-paste]').onclick = () => { s.close(); ACT.pasteShortcut(); };
  },
  async toggleWork() { const t = todayStr(); const d = S.days[t] || {}; await patchDay(t, { workActive: d.workActive ? undefined : true }); rerender(); },
  calNav(el) { const cm = R.filters.calMonth || todayStr().slice(0, 7); const [y, m] = cm.split('-').map(Number); const d = new Date(y, m - 1 + +el.dataset.d, 1); R.filters.calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; rerender(); },
  editDay(el) { dayForm(el.dataset.d); },
  addGoal() {
    const s = openSheet({ title: 'Objectif de pas', body: `<form>${field('À partir du', `<input type="date" name="from" value="${todayStr()}">`)}${field('Pas par jour', `<input type="number" name="goal" value="${S.profile.stepGoal}">`)}<button type="button" class="btn w100" data-ok>Enregistrer</button></form>` });
    s.body.querySelector('[data-ok]').onclick = async () => { const f = formData(s.body); const g = num(f.goal); if (!g) return; const list = (S.stepGoals || []).filter(x => x.from !== f.from).concat([{ from: f.from, goal: g }]); await kvSet('stepGoals', list); s.close(); rerender(); };
  },
  async delGoal(el) { const list = [...S.stepGoals]; list.splice(+el.dataset.i, 1); await kvSet('stepGoals', list); rerender(); },
  async pasteShortcut() {
    let txt = '';
    try { txt = await navigator.clipboard.readText(); } catch (e) { }
    const s = openSheet({ title: 'Données du Raccourci', body: `<p class="muted small">Le texte copié par le Raccourci apparaît ci-dessous (sinon colle-le manuellement).</p><textarea rows="6" class="w100" placeholder='{"date":"2026-11-19","steps":12345,"distance":9.1,"activeKcal":520,"flights":8}'>${esc(txt)}</textarea><button class="btn w100 mt" data-ok>Importer</button>` });
    s.body.querySelector('[data-ok]').onclick = async () => {
      try { const list = parseHealthPaste(s.body.querySelector('textarea').value); s.close(); await applyHealthDays(list, 'Apple Santé (Raccourci)'); }
      catch (e) { toast('Format non reconnu : ' + e.message); }
    };
  },
  async importHealthXML(el) {
    const file = el.files[0]; if (!file) return; el.value = '';
    const s = openSheet({ title: 'Import Apple Santé', body: `<p>Lecture de ${esc(file.name)} (${f0(file.size / 1048576)} Mo)…</p><div class="pbar"><i id="hxp" style="width:0;background:var(--violet)"></i></div>` });
    try {
      const days = await importHealthXML(file, p => { const b = document.getElementById('hxp'); if (b) b.style.width = (p * 100) + '%'; });
      s.set(`<p><b>${days.length}</b> jours trouvés (${days[0]?.date || '?'} → ${days[days.length - 1]?.date || '?'}).</p><p class="muted small">Pour chaque jour, si l'iPhone et la montre ont compté les pas, la source la plus élevée est conservée afin d'éviter le double comptage. Les pas saisis à la main seront remplacés.</p><button class="btn w100" data-ok>Importer ces jours</button>`);
      s.body.querySelector('[data-ok]').onclick = async () => { s.close(); await applyHealthDays(days.sort((a, b) => a.date < b.date ? -1 : 1), 'Apple Santé (export)'); };
    } catch (e) { s.set(`<p class="c-red">Erreur : ${esc(e.message)}</p>`); }
  },
  async importStepsCSV(el) { const file = el.files[0]; if (!file) return; el.value = ''; try { await applyHealthDays(parseHealthPaste(await file.text()), 'CSV'); } catch (e) { toast('CSV non reconnu : ' + e.message); } },
  recoveryCheck() { recoveryForm(); },
  quickWeight() {
    const t = todayStr(); const d = S.days[t] || {};
    const s = openSheet({ title: 'Pesée', body: `<form>${field('Date', `<input type="date" name="date" value="${t}">`)}${field('Poids à jeun (kg)', `<input type="number" step="0.1" inputmode="decimal" name="weight" value="${d.weight ?? ''}" autofocus>`)}${field('Tour de taille (cm, facultatif)', `<input type="number" step="0.5" name="waist" value="${d.waist ?? ''}">`)}<button type="button" class="btn w100" data-ok>Enregistrer</button></form>` });
    s.body.querySelector('[data-ok]').onclick = async () => { const f = formData(s.body); const w = num(f.weight); if (!w) return; await patchDay(f.date, { weight: w, waist: num(f.waist) ?? undefined }); s.close(); toast('Pesée enregistrée'); rerender(); };
  }
});
import { ACTIONS as ACT } from './ui.js';
