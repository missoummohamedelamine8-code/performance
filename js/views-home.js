// =====================================================================
// views-home.js — Accueil : tableau de bord quotidien + bilan hebdo
// =====================================================================
import { S, esc, f0, f1, fdate, relDay, todayStr, addDays, mondayOf, rangeDays, sum, avg, fdur, fpace, dayDiff } from './core.js';
import * as C from './calc.js';
import { R, VIEWS, go } from './nav.js';
import { actions, card, kpi, badge, est } from './ui.js';
import { ring, bar } from './charts.js';

VIEWS.home = () => {
  const t = todayStr();
  const day = S.days[t] || {};
  const tg = C.dayTarget(t);
  const intake = C.dayIntake(t);
  const goal = C.stepGoalAt(t);
  const st = C.stepStats(t);
  const h = new Date().getHours();
  let o = `<p class="muted small">${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    <h1 class="title">${h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir'}</h1>`;
  if (S.active) o += `<button class="banner live" data-a="resumeWorkout">● Séance en cours : ${esc(S.active.name)} — reprendre</button>`;
  o += reminders();
  if (!S.sessions.length && !Object.keys(S.days).length) o += card(`<h3>Bienvenue</h3><p>Pour démarrer avec tes vraies données, importe ton Google Sheets de suivi (musculation, poids, pas).</p><button class="btn" data-a="openImport">Importer mon Google Sheets</button>`, 'accent-l');

  // ---- Activité
  const steps = day.steps || 0;
  const km = C.stepsToKm(steps, S.profile);
  o += card(`<div class="card-h"><h3 class="c-violet">Activité</h3><button class="link" data-a="goTab" data-t="act">Détails</button></div>
    <div class="row gap center-y">${ring(steps / goal, 'var(--violet)', f0(steps), `/ ${f0(goal)} pas`)}
    <div class="grow kpis col">${kpi('Objectif', f0(Math.min(100, steps / goal * 100)) + ' %')}${kpi('Distance', f1(km) + ' km', 'estimée')}</div></div>
    <div class="kpis mt-s">${kpi('Dépense marche', '≈ ' + f0(tg.walk) + ' kcal', 'au-delà du niveau de base')}${kpi('Moy. 7 j', f0(st.avg7), st.avg7 ? (steps >= st.avg7 ? '▲ au-dessus' : '▼ en dessous') : '')}</div>
    <div class="row gap mt-s"><button class="btn ghost grow" data-a="quickSteps">Saisir mes pas</button><button class="btn ghost grow ${day.workActive ? 'on' : ''}" data-a="toggleWork">${day.workActive ? '✓ ' : ''}Journée de travail active</button></div>`);

  // ---- Nutrition
  const rem = tg.kcal - intake.kcal;
  o += card(`<div class="card-h"><h3 class="c-yellow">Nutrition</h3><button class="link" data-a="goTab" data-t="nutri">Journal</button></div>
    <div class="row between"><div><small class="muted">Objectif du jour ${est()}</small><div class="big-n">${f0(tg.kcal)} <small>kcal</small></div>
    <small class="muted">Maintenance ≈ ${f0(tg.maintenance)} ± ${f0(tg.unc)} · ${tg.adj ? (tg.adj > 0 ? '+' : '') + tg.adj + ' (' + goalLabel() + ')' : goalLabel()}</small></div>
    <div class="right"><small class="muted">${rem >= 0 ? 'Restant' : 'Dépassement'}</small><div class="big-n ${rem < 0 ? 'c-red' : ''}">${f0(Math.abs(rem))}</div><small class="muted">consommé ${f0(intake.kcal)}</small></div></div>
    ${bar(intake.kcal / tg.kcal, 'var(--yellow)')}
    <div class="macros mt-s">${macro('Protéines', intake.p, tg.macros.p)}${macro('Glucides', intake.c, tg.macros.c)}${macro('Lipides', intake.f, tg.macros.f)}</div>
    <p class="muted small mt-s">Pas pris en compte : ${f0(tg.steps)} (${esc(tg.stepsSource)}). L'objectif s'ajuste au fil de la journée.</p>
    <div class="row gap mt-s"><button class="btn ghost grow" data-a="nutriAdd">+ Aliment</button><button class="btn ghost grow" data-a="nutriScan">Scanner</button></div>`);

  // ---- Musculation
  const done = C.doneSessions();
  const last = done[done.length - 1];
  const nt = C.nextTemplate(t);
  const wk = mondayOf(t);
  const thisWeek = done.filter(s => s.date >= wk && s.date <= t);
  const prevWeek = done.filter(s => s.date >= addDays(wk, -7) && s.date < wk);
  const tonW = sum(thisWeek.map(C.sessionTonnage)), tonP = sum(prevWeek.map(C.sessionTonnage));
  const prs = C.recentPRs(30).slice(0, 3);
  o += card(`<div class="card-h"><h3 class="c-green">Musculation</h3><button class="link" data-a="goTab" data-t="muscu">Séances</button></div>
    ${nt ? `<div class="row between"><div><small class="muted">Prochaine séance suggérée</small><b class="d-block">${esc(nt.tpl.name)}</b><small class="muted">${esc(nt.why)}</small></div><button class="btn" data-a="startTpl" data-id="${nt.tpl.id}">Démarrer</button></div>` : ''}
    <div class="kpis mt-s">${kpi('Cette semaine', `${thisWeek.length} / ${S.profile.trainingFreq}`, 'séances')}${kpi('Tonnage sem.', f0(tonW) + ' kg', tonP ? (tonW >= tonP ? '▲ ' : '▼ ') + f0(Math.abs(tonW - tonP)) + ' vs sem. préc.' : '')}
    ${kpi('Dernière', last ? esc(last.name) : '—', last ? relDay(last.date) + (last.dateApprox ? ' (date estimée)' : '') : '')}</div>
    ${prs.length ? `<small class="muted d-block mt-s">Records récents</small>${prs.map(p => `<div class="hist-row"><span>${esc(p.ex.name)}</span><b>${f1(p.w)} kg × ${p.r}</b></div>`).join('')}` : ''}`);

  // ---- Course
  const runs = S.runs; const lr = runs[runs.length - 1];
  if (lr) {
    const prev = runs.slice(0, -1).filter(r => Math.abs(r.distKm - lr.distKm) / lr.distKm < 0.2).slice(-1)[0];
    const dp = prev ? C.pace(lr) - C.pace(prev) : null;
    o += card(`<div class="card-h"><h3 class="c-blue">Course</h3><button class="link" data-a="goTab" data-t="course">Sorties</button></div>
      <div class="kpis">${kpi('Dernière', relDay(lr.date), C.RUN_TYPES[lr.type] || '')}${kpi('Distance', f1(lr.distKm) + ' km')}${kpi('Durée', fdur(lr.durSec))}${kpi('Allure', fpace(C.pace(lr)) + ' /km', dp != null ? (dp < 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(dp)) + ' s/km vs sortie comparable' : '')}</div>`);
  } else o += card(`<div class="card-h"><h3 class="c-blue">Course</h3><button class="link" data-a="addRun">+ Ajouter une sortie</button></div><p class="muted small">Aucune sortie enregistrée.</p>`);

  // ---- Récupération
  const y = S.days[addDays(t, -1)] || {};
  const rc = C.recoverySignals(t);
  o += card(`<div class="card-h"><h3 class="c-violet">Récupération</h3><button class="link" data-a="recoveryCheck">Faire mon bilan</button></div>
    <div class="kpis">${kpi('Sommeil', day.sleepH ? f1(day.sleepH) + ' h' : (y.sleepH ? f1(y.sleepH) + ' h' : '—'), day.sleepQ ? 'qualité ' + day.sleepQ + '/10' : '')}${kpi('Fatigue', day.fatigue ? day.fatigue + '/10' : '—')}${kpi('Courbatures', day.soreness ? day.soreness + '/10' : '—')}${kpi('Douleur', day.pain ? esc(day.pain) : '—')}</div>
    ${rc.acwr.ratio ? `<p class="small mt-s">Charge 7 j / 28 j : <b>${rc.acwr.ratio.toFixed(2)}</b> (${rc.acwr.zone})</p>` : ''}
    ${rc.signals.length ? `<div class="note warn">${rc.signals.map(esc).join('<br>')}${rc.suggestDeload ? '<br><b>Plusieurs signaux convergent : une semaine à volume réduit (−30 à −50 % de séries) pourrait t’aider.</b> Ce n’est pas un diagnostic.' : ''}</div>` : ''}`);

  o += weekly(t);
  return o;
};

function goalLabel() { return { bulk: 'prise de masse', maintain: 'maintien', cut: 'sèche' }[S.profile.goal]; }
function macro(l, v, t) { return `<div class="macro"><small>${l}</small><b>${f0(v)}<span>/${f0(t)} g</span></b>${bar(v / t, 'var(--yellow)', 'thin')}</div>`; }

function weekly(t) {
  const wk = mondayOf(t); const days = rangeDays(wk, t);
  const done = C.doneSessions().filter(s => s.date >= wk && s.date <= t);
  const runs = S.runs.filter(r => r.date >= wk && r.date <= t);
  const steps = days.map(d => S.days[d]?.steps).filter(Boolean);
  const w0 = C.weightTrend(addDays(wk, -1), addDays(wk, -1))[0], w1 = C.weightTrend(t, t)[0];
  const logged = days.filter(C.dayLogged);
  const kc = avg(logged.map(d => C.dayIntake(d).kcal));
  const okDays = logged.filter(d => { const i = C.dayIntake(d).kcal, g = C.dayTarget(d).kcal; return Math.abs(i - g) / g <= 0.1; }).length;
  const protOk = logged.filter(d => C.dayIntake(d).p >= C.dayTarget(d).macros.p * 0.9).length;
  return card(`<h3>Bilan de la semaine <small class="muted">depuis lundi</small></h3>
    <div class="kpis">${kpi('Séances muscu', done.length)}${kpi('Sorties course', runs.length)}${kpi('Pas (total)', f0(sum(steps)))}${kpi('Moy. pas/jour', f0(avg(steps)))}
    ${kpi('Volume muscu', f0(sum(done.map(C.sessionTonnage))) + ' kg')}${kpi('Poids (tendance)', w0 && w1 ? ((w1.v - w0.v) >= 0 ? '+' : '') + f1(w1.v - w0.v) + ' kg' : '—')}
    ${kpi('Moy. calorique', kc ? f0(kc) + ' kcal' : '—', logged.length ? logged.length + ' j saisis' : '')}${kpi('Objectifs nutri', logged.length ? `${okDays}/${logged.length} j` : '—', logged.length ? `protéines ok ${protOk}/${logged.length} j` : '')}</div>`);
}

function reminders() {
  const r = S.settings.reminders; const t = todayStr(); const out = [];
  const wd = new Date().getDay();
  if (r.weigh && r.weighDays.includes(wd) && !S.days[t]?.weight) out.push(['Pesée du jour (à jeun) non saisie', 'quickWeight']);
  if (r.nutrition && new Date().getHours() >= 20 && C.dayIntake(t).n === 0) out.push(['Journal alimentaire vide aujourd’hui', 'goNutri']);
  const lastB = S.settings.lastBackupAt;
  if (r.backupEveryDays && (!lastB || (Date.now() - lastB) / 86400000 > r.backupEveryDays) && (S.sessions.length || Object.keys(S.days).length)) out.push([lastB ? `Dernière sauvegarde il y a ${Math.floor((Date.now() - lastB) / 86400000)} j` : 'Aucune sauvegarde exportée', 'exportJSON']);
  if (r.training) { const nt = C.nextTemplate(t); if (nt && nt.tpl.day === wd && !C.doneSessions().some(s => s.date === t)) out.push([`Séance prévue aujourd’hui : ${nt.tpl.name}`, 'goMuscu']); }
  return out.map(([txt, a]) => `<button class="banner soft" data-a="${a}">${esc(txt)}</button>`).join('');
}

actions({
  goTab(el) { go(el.dataset.t); },
  goNutri() { go('nutri'); },
  goMuscu() { go('muscu', 'seances'); },
});
