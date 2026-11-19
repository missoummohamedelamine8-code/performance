// =====================================================================
// views-progress.js — Progrès : musculation, course, activité, morphologie, nutrition
// =====================================================================
import { S, put, del, uid, esc, f0, f1, fdate, todayStr, addDays, rangeDays, sum, avg, mondayOf, num, patchDay, getRaw, getAllRaw, fpace, fdur } from './core.js';
import * as C from './calc.js';
import { R, VIEWS, rerender } from './nav.js';
import { actions, openSheet, toast, card, kpi, seg, field, formData, confirmDlg } from './ui.js';
import { lineChart, barChart } from './charts.js';
import { trendBadge } from './views-train.js';

const PERIODS = [[7, '7 j'], [30, '30 j'], [90, '90 j'], [180, '6 mois'], [365, '1 an']];

VIEWS.prog = () => {
  const sub = R.sub.prog; const P = R.period; const to = todayStr(); const from = addDays(to, -P + 1);
  let o = `<h1 class="title">Progrès</h1>` + seg('prog', [['muscu', 'Muscu'], ['course', 'Course'], ['activite', 'Activité'], ['morpho', 'Morpho'], ['nutri', 'Nutrition']], sub, 'subtab')
    + `<div class="seg small mt-s">${PERIODS.map(([v, l]) => `<button class="${v === P ? 'on' : ''}" data-a="period" data-v="${v}">${l}</button>`).join('')}</div>`;
  if (sub === 'muscu') o += muscu(from, to, P);
  else if (sub === 'course') o += course(from, to);
  else if (sub === 'activite') o += activity(from, to, P);
  else if (sub === 'morpho') o += morpho(from, to);
  else o += nutrition(from, to);
  return o;
};

function bucket(from, to, P) { return P <= 31 ? 'day' : 'week'; }

function muscu(from, to, P) {
  const ss = C.doneSessions().filter(s => s.date >= from && s.date <= to);
  const all = C.doneSessions();
  let o = '';
  if (!ss.length && all.length) o += `<p class="note small">Aucune séance sur la période. Dernière séance : ${fdate(all[all.length - 1].date)} — élargis la période (6 mois / 1 an).</p>`;
  const weeks = Math.max(1, P / 7);
  o += card(`<div class="kpis">${kpi('Séances', ss.length, f1(ss.length / weeks) + '/sem.')}${kpi('Tonnage', f1(sum(ss.map(C.sessionTonnage)) / 1000) + ' t')}${kpi('Séries', f0(sum(ss.map(C.sessionSetsCount))))}${kpi('Records', C.recentPRs(P).length, 'sur la période')}</div>`);
  const pts = [];
  if (P <= 31) for (const s of ss) pts.push({ date: s.date, v: C.sessionTonnage(s), note: s.name });
  else { let m = mondayOf(from); while (m <= to) { const e = addDays(m, 6); const w = ss.filter(s => s.date >= m && s.date <= e); pts.push({ date: m, v: sum(w.map(C.sessionTonnage)), note: w.length + ' séance(s)' }); m = addDays(m, 7); } }
  o += card(`<h3>Tonnage ${P <= 31 ? 'par séance' : 'par semaine'}</h3>${barChart(pts, { color: 'var(--green)', unit: 'kg', axisFmt: v => v >= 1000 ? (v / 1000) + 't' : v })}`);
  const mv = C.muscleVolume(from, to);
  o += card(`<h3>Volume et fréquence par groupe</h3><table class="tbl"><tr><th>Groupe</th><th>Séries/sem.</th><th>Fréq.</th><th>Tonnage</th></tr>${C.GROUPS.map(g => `<tr><td>${g}</td><td>${f1(mv[g].perWeek)}</td><td>${f1(mv[g].freq)}/sem</td><td>${f0(mv[g].tonnage)}</td></tr>`).join('')}</table>`);
  // records et 1RM
  const ex = S.exercises.map(e => ({ e, st: C.exerciseStats(e.id), tr: C.exerciseTrend(e.id) })).filter(x => x.st.count).sort((a, b) => (b.st.e1rmBest?.v || 0) - (a.st.e1rmBest?.v || 0));
  o += card(`<h3>Records personnels</h3><p class="muted small">Record = charge réellement soulevée. 1RM = estimation théorique (Epley), indicative.</p>
    <table class="tbl"><tr><th>Exercice</th><th>Record</th><th>1RM est.</th><th></th></tr>${ex.map(x => `<tr data-a="openExercise" data-id="${x.e.id}" class="click"><td>${esc(x.e.name)}</td><td>${x.st.pr ? f1(x.st.pr.w) + '×' + x.st.pr.r : '—'}</td><td class="muted">${x.st.e1rmBest ? '≈' + f0(x.st.e1rmBest.v) : '—'}</td><td>${trendBadge(x.tr.status)}</td></tr>`).join('')}</table>`);
  const top = ex.slice(0, 4);
  if (top.length) o += card(`<h3>Évolution des charges (principaux exercices)</h3>${lineChart(top.map((x, i) => ({ name: x.e.name, color: ['var(--green)', 'var(--accent)', '#6fdc8c', '#c7f08a'][i], points: x.st.history.filter(h => h.date >= from && h.topLoad).map(h => ({ date: h.date, v: h.topLoad })) })).filter(s => s.points.length), { unit: 'kg' })}`);
  if (top.length) o += card(`<h3>Évolution des répétitions</h3>${lineChart(top.map((x, i) => ({ name: x.e.name, color: ['var(--green)', 'var(--accent)', '#6fdc8c', '#c7f08a'][i], points: x.st.history.filter(h => h.date >= from).map(h => ({ date: h.date, v: h.reps })) })).filter(s => s.points.length), { fmt: f0 })}`);
  return o;
}

function course(from, to) {
  const rs = S.runs.filter(r => r.date >= from && r.date <= to);
  const best = (d) => S.runs.filter(r => r.distKm >= d * 0.97).sort((a, b) => C.pace(a) - C.pace(b))[0];
  let o = card(`<div class="kpis">${kpi('Distance', f1(sum(rs.map(r => r.distKm))) + ' km', rs.length + ' sorties')}${kpi('Cumul total', f1(sum(S.runs.map(r => r.distKm))) + ' km')}${kpi('Allure moy.', rs.length ? fpace(sum(rs.map(r => r.durSec)) / sum(rs.map(r => r.distKm))) + '/km' : '—')}${kpi('Plus longue', rs.length ? f1(Math.max(...rs.map(r => r.distKm))) + ' km' : '—')}</div>`);
  o += card(`<h3>Meilleures allures</h3>${[3, 5, 10].map(d => { const b = best(d); return `<div class="hist-row"><span>≥ ${d} km</span><b>${b ? fpace(C.pace(b)) + '/km · ' + fdate(b.date) : '—'}</b></div>`; }).join('')}`);
  const wk = []; let m = mondayOf(from); while (m <= to) { const e = addDays(m, 6); wk.push({ date: m, v: +sum(S.runs.filter(r => r.date >= m && r.date <= e).map(r => r.distKm)).toFixed(1) }); m = addDays(m, 7); }
  o += card(`<h3>Distance hebdomadaire</h3>${barChart(wk, { color: 'var(--blue)', unit: 'km', fmt: f1 })}`);
  const hr = rs.filter(r => r.hrAvg && r.distKm);
  o += card(`<h3>Évolution cardiovasculaire</h3>${hr.length >= 2 ? lineChart([{ name: 'Allure / FC', color: 'var(--blue)', points: hr.map(r => ({ date: r.date, v: +(r.distKm / (r.durSec / 3600) / r.hrAvg * 1000).toFixed(1), note: `FC ${r.hrAvg}` })) }], { fmt: f1 }) + '<p class="muted small">Indice d’efficacité = vitesse (km/h) / FC moyenne × 1000 : s’il augmente, tu cours plus vite pour le même effort cardiaque. Compare surtout des sorties du même type.</p>' : '<p class="muted small">Renseigne la FC moyenne de tes sorties pour suivre ton évolution cardiovasculaire.</p>'}`);
  return o;
}

function activity(from, to, P) {
  const days = rangeDays(from, to).map(d => ({ date: d, v: S.days[d]?.steps || 0 }));
  const withV = days.filter(d => d.v);
  let o = card(`<div class="kpis">${kpi('Moyenne', f0(avg(withV.map(d => d.v))), withV.length + ' j renseignés')}${kpi('Total', f0(sum(withV.map(d => d.v))))}${kpi('Distance', f0(C.stepsToKm(sum(withV.map(d => d.v)), S.profile)) + ' km', 'estimée')}${kpi('Objectif atteint', withV.filter(d => d.v >= C.stepGoalAt(d.date)).length + ' j')}</div>`);
  if (P <= 31) o += card(`<h3>Pas par jour</h3>${barChart(days, { goal: S.profile.stepGoal, color: 'var(--violet)' })}`);
  const wk = []; let m = mondayOf(from); while (m <= to) { const v = rangeDays(m, addDays(m, 6)).map(d => S.days[d]?.steps).filter(Boolean); wk.push({ date: m, v: sum(v), note: `moy. ${f0(avg(v))}/j` }); m = addDays(m, 7); }
  o += card(`<h3>Total hebdomadaire</h3>${barChart(wk, { color: 'var(--violet)', axisFmt: v => v >= 1000 ? (v / 1000) + 'k' : v })}`);
  const mo = {}; for (const d of withV) { const k = d.date.slice(0, 7); (mo[k] = mo[k] || []).push(d.v); }
  o += card(`<h3>Total mensuel</h3>${Object.entries(mo).map(([k, v]) => `<div class="hist-row"><span>${new Date(k + '-15').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</span><b>${f0(sum(v))} · moy. ${f0(avg(v))}/j</b></div>`).join('') || '<p class="muted">—</p>'}`);
  return o;
}

function morpho(from, to) {
  const w = C.weightSeries(from, to); const tr = C.weightTrend(from, to);
  const rate = C.weightRate(Math.min(28, R.period));
  let o = card(`<div class="row between"><h3>Poids</h3><button class="btn small" data-a="quickWeight">+ Pesée</button></div>
    <div class="kpis">${kpi('Dernière pesée', w.length ? f1(w[w.length - 1].v) + ' kg' : '—', w.length ? fdate(w[w.length - 1].date) : '')}${kpi('Tendance', tr.length ? f1(tr[tr.length - 1].v) + ' kg' : '—', 'moyenne mobile')}${kpi('Évolution', rate ? (rate.perWeek >= 0 ? '+' : '') + f1(rate.perWeek) + ' kg/sem' : '—')}${kpi('Variation période', w.length >= 2 && tr.length ? (tr[tr.length - 1].v - tr[0].v >= 0 ? '+' : '') + f1(tr[tr.length - 1].v - tr[0].v) + ' kg' : '—')}</div>
    ${lineChart([{ name: 'Pesées', color: 'color-mix(in srgb, var(--text) 45%, transparent)', points: w, width: 1 }, { name: 'Tendance (moy. mobile)', color: 'var(--accent)', points: tr, dots: false, width: 2.5 }], { unit: 'kg' })}
    <p class="muted small">La tendance lisse les variations d’eau et de digestion : c’est elle qui sert aux calculs, jamais une pesée isolée.</p>`);
  const waist = Object.values(S.days).filter(d => d.waist && d.date >= from).sort((a, b) => a.date < b.date ? -1 : 1).map(d => ({ date: d.date, v: d.waist }));
  o += card(`<h3>Tour de taille</h3>${waist.length ? lineChart([{ name: 'Taille', color: 'var(--yellow)', points: waist }], { unit: 'cm' }) : '<p class="muted small">Facultatif : renseigne-le lors d’une pesée.</p>'}`);
  const ms = Object.values(S.days).filter(d => d.measures).sort((a, b) => a.date < b.date ? 1 : -1);
  o += card(`<div class="row between"><h3>Mensurations</h3><button class="btn small" data-a="addMeasures">+ Ajouter</button></div>${ms.slice(0, 6).map(d => `<div class="hist-row small"><span>${fdate(d.date)}</span><span>${Object.entries(d.measures).map(([k, v]) => `${k} ${v}`).join(' · ')}</span></div>`).join('') || '<p class="muted small">Bras, cuisse, poitrine, hanches… (facultatif)</p>'}`);
  o += card(`<div class="row between"><h3>Photos de progression</h3><label class="btn small">+ Photo<input type="file" accept="image/*" hidden data-ch="addPhoto"></label></div><div id="photos" class="photos"><p class="muted small">Stockées uniquement sur ton téléphone.</p></div>`);
  setTimeout(loadPhotos, 0);
  return o;
}
async function loadPhotos() {
  const el = document.getElementById('photos'); if (!el) return;
  const ph = (await getAllRaw('photos')).sort((a, b) => a.date < b.date ? 1 : -1);
  if (!ph.length) return;
  el.innerHTML = ph.map(p => `<figure data-a="openPhoto" data-id="${p.id}"><img src="${URL.createObjectURL(p.thumb || p.blob)}" alt="Photo du ${fdate(p.date)}"><figcaption>${fdate(p.date)}</figcaption></figure>`).join('');
}
async function shrink(file, max) {
  const img = await createImageBitmap(file); const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
}

function nutrition(from, to) {
  const days = rangeDays(from, to).filter(C.dayLogged);
  const rows = days.map(d => { const i = C.dayIntake(d); const t = C.dayTarget(d); return { date: d, kcal: i.kcal, p: i.p, maint: t.maintenance, target: t.kcal }; });
  const bal = rows.map(r => r.kcal - r.maint);
  const cal = C.computeCalibration();
  let o = card(`<div class="kpis">${kpi('Moy. calorique', rows.length ? f0(avg(rows.map(r => r.kcal))) : '—', rows.length + ' j saisis')}${kpi('Moy. protéines', rows.length ? f0(avg(rows.map(r => r.p))) + ' g' : '—')}
    ${kpi('Surplus / déficit moyen', rows.length ? (avg(bal) >= 0 ? '+' : '') + f0(avg(bal)) + ' kcal' : '—', 'vs maintenance estimée', 'est-k')}${kpi('Maintenance réelle', cal.ok ? '≈ ' + f0(cal.observed) : '—', cal.ok ? 'apports − variation de poids' : 'données insuffisantes', 'est-k')}</div>`);
  const wk = []; let m = mondayOf(from); while (m <= to) { const e = addDays(m, 6); const r = rows.filter(x => x.date >= m && x.date <= e); wk.push({ date: m, v: r.length ? Math.round(avg(r.map(x => x.kcal))) : 0, note: r.length + ' j' }); m = addDays(m, 7); }
  o += card(`<h3>Moyenne calorique hebdomadaire</h3>${barChart(wk, { color: 'var(--yellow)', unit: 'kcal' })}`);
  const tr = C.weightTrend(from, to);
  o += card(`<h3>Poids et apports</h3>${lineChart([{ name: 'Apports (kcal/100)', color: 'var(--yellow)', points: rows.map(r => ({ date: r.date, v: r.kcal / 100 })) }, { name: 'Poids tendance (kg)', color: 'var(--accent)', points: tr.filter((_, i) => i % 2 === 0), dots: false }], {})}
    <p class="muted small">Apports affichés en centaines de kcal pour partager l’axe avec le poids.</p>`);
  return o;
}

actions({
  period(el) { R.period = +el.dataset.v; rerender(); },
  addMeasures() {
    const s = openSheet({ title: 'Mensurations (cm)', body: `<form>${field('Date', `<input type="date" name="date" value="${todayStr()}">`)}<div class="grid2">${['Bras', 'Avant-bras', 'Poitrine', 'Taille', 'Hanches', 'Cuisse', 'Mollet', 'Cou'].map(k => field(k, `<input type="number" step="0.5" name="${k}">`)).join('')}</div><button type="button" class="btn w100" data-ok>Enregistrer</button></form>` });
    s.body.querySelector('[data-ok]').onclick = async () => { const f = formData(s.body); const m = {}; for (const [k, v] of Object.entries(f)) if (k !== 'date' && num(v)) m[k] = num(v); if (!Object.keys(m).length) return; await patchDay(f.date, { measures: m, waist: m.Taille ?? S.days[f.date]?.waist }); s.close(); rerender(); };
  },
  async addPhoto(el) {
    const file = el.files[0]; if (!file) return; el.value = '';
    try { const blob = await shrink(file, 1600), thumb = await shrink(file, 360); await put('photos', { id: uid('ph_'), date: todayStr(), blob, thumb }); toast('Photo enregistrée'); rerender(); }
    catch (e) { toast('Photo illisible'); }
  },
  async openPhoto(el) {
    const p = await getRaw('photos', el.dataset.id);
    const s = openSheet({ title: 'Photo du ' + fdate(p.date), full: true, body: `<img class="w100" src="${URL.createObjectURL(p.blob)}" alt=""><button class="btn ghost danger w100 mt" data-del>Supprimer la photo</button>` });
    s.body.querySelector('[data-del]').onclick = async () => { if (await confirmDlg('Supprimer définitivement cette photo ?', { danger: true, ok: 'Supprimer' })) { await del('photos', p.id); s.close(); rerender(); } };
  }
});
