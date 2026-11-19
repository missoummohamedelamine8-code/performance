// =====================================================================
// calc.js — calculs : énergie, nutrition, musculation, course, récupération
// Toutes les fonctions sont pures (pas d'accès DOM) pour pouvoir être testées.
// =====================================================================
import { S, addDays, todayStr, dayDiff, mondayOf, rangeDays, clamp, sum, avg, norm, parseD } from './core.js';

// ---------------------------------------------------------------------
// 1. ÉNERGIE
// ---------------------------------------------------------------------
export const KCAL_PER_KG = 7700;      // ordre de grandeur pour 1 kg de masse corporelle
export const WALK_NET = 0.50;         // kcal / kg / km au-dessus du repos (marche 4-6 km/h)
export const RUN_NET = 0.95;          // kcal / kg / km au-dessus du repos (course)
export const BASE_FACTOR = 1.2;       // métabolisme de base × 1,2 = vie courante + thermogenèse alimentaire

export function bmr(p) { // Mifflin-St Jeor
  return 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'f' ? -161 : 5);
}
export function strideM(p) { return p.strideCm ? p.strideCm / 100 : p.height * (p.sex === 'f' ? 0.413 : 0.415) / 100; }
export function stepsToKm(steps, p) { return (steps || 0) * strideM(p) / 1000; }

const RUN_RPE_DEFAULT = { ef: 4, continu: 6, fractionne: 8, recup: 3 };
export function runRpe(r) { return r.rpe ?? RUN_RPE_DEFAULT[r.type] ?? 5; }
export function runStepsEstimate(r) { return Math.round((r.durSec || 0) / 60 * (r.cadence || 160)); }
export function runKcal(r, weight) { return (r.distKm || 0) * weight * RUN_NET; }

// MET de la musculation selon l'effort ressenti (Compendium : 3,5 modéré → 6 vigoureux)
export function strengthMet(rpe) { return clamp(3.5 + ((rpe ?? 7) - 6) * 0.5, 3, 6); }
export function strengthKcal(sess, weight) {
  const h = (sess.durationMin || 70) / 60;
  return (strengthMet(sess.rpe) - 1) * weight * h;
}

/** Poids de référence à une date : dernière pesée connue ≤ date, sinon profil. */
export function weightAt(date) {
  let best = null;
  for (const d of Object.values(S.days)) if (d.weight && d.date <= date && (!best || d.date > best.date)) best = d;
  const pd = S.profile.weightDate;
  // le poids saisi dans le profil prime s'il est plus récent que la dernière pesée
  if (pd && pd <= date && (!best || pd >= best.date)) return S.profile.weight;
  return best ? best.weight : S.profile.weight;
}

/** Moyenne des pas mesurés sur n jours avant `date` (exclue). */
export function stepsAvg(date, n = 7) {
  const v = []; for (let i = 1; i <= n; i++) { const d = S.days[addDays(date, -i)]; if (d && d.steps) v.push(d.steps); }
  return v.length ? avg(v) : null;
}

/**
 * Dépense énergétique estimée d'une journée, détaillée et sans double comptage.
 * opts.stepsMode : 'live' (pas réels) | 'avg7' | 'auto'
 */
export function dayEnergy(date, opts = {}) {
  const p = Object.assign({}, S.profile, { weight: weightAt(date) });
  const day = S.days[date] || {};
  const runs = S.runs.filter(r => r.date === date);
  const sessions = S.sessions.filter(s => s.date === date && s.status !== 'pending');

  // --- pas
  let steps = null, stepsSource = 'aucune';
  const mode = opts.stepsMode || S.profile.targetBasis || 'live';
  const a7 = stepsAvg(date, 7);
  if (mode === 'avg7' && a7) { steps = a7; stepsSource = 'moyenne 7 j'; }
  else if (day.steps) { steps = day.steps; stepsSource = day.stepsSource || 'mesuré'; }
  else if (day.workActive) { steps = p.activeWorkSteps; stepsSource = 'estimé (journée de travail active)'; }
  else if (a7 && date >= todayStr()) { steps = a7; stepsSource = 'moyenne 7 j (pas du jour non saisis)'; }
  else { steps = p.baselineSteps; stepsSource = 'par défaut (pas non saisis)'; }
  return Object.assign({ date }, energyCore(p, { steps, stepsSource, workActive: day.workActive, standMin: day.standMin, other: day.other }, runs, sessions));
}

/** Cœur du calcul, indépendant des données stockées (sert aussi aux scénarios de test). */
export function energyCore(p, day, runs = [], sessions = []) {
  const b = bmr(p);
  const base = b * BASE_FACTOR;
  const steps = day.steps ?? p.baselineSteps, stepsSource = day.stepsSource || 'scénario';
  // --- anti double comptage : les pas de course sont retirés de la marche
  const runStepsEst = sum(runs.map(runStepsEstimate));
  const runStepsRemoved = (p.stepsIncludeRuns && stepsSource !== 'par défaut (pas non saisis)') ? Math.min(runStepsEst, Math.max(0, steps - p.baselineSteps)) : 0;
  const walkSteps = Math.max(0, steps - runStepsRemoved);
  const extraSteps = Math.max(0, walkSteps - p.baselineSteps);
  const walkKm = stepsToKm(extraSteps, p);
  const walk = walkKm * p.weight * WALK_NET;

  const run = sum(runs.map(r => runKcal(r, p.weight)));
  const strength = sum(sessions.map(s => strengthKcal(s, p.weight)));
  // Station debout prolongée (travail en magasin) : petit surplus, au-delà de 2 h
  let stand = 0;
  if (day.standMin) stand = Math.max(0, day.standMin - 120) * 0.15 * p.weight / 70;
  else if (day.workActive) stand = 4 * 60 * 0.15 * p.weight / 70;
  const other = sum((day.other || []).map(o => (Math.max(1, o.met || 4) - 1) * p.weight * (o.min || 0) / 60));

  const activity = walk + run + strength + stand + other;
  const model = base + activity;
  const factor = S.calib?.factor || 1;
  const maintenance = model * factor;
  // incertitude : ±8 % sur le métabolisme, ±30 % sur l'activité
  const unc = Math.sqrt((base * 0.08) ** 2 + (activity * 0.3) ** 2) * factor;
  const totalSteps = steps;
  return {
    bmr: b, base, walk, walkKm, extraSteps, run, strength, stand, other, activity, model, factor, maintenance, unc,
    steps: totalSteps, stepsSource, runStepsRemoved, runs: runs.length, sessions: sessions.length,
    distKm: stepsToKm(totalSteps, p), weight: p.weight
  };
}

/** Scénarios de contrôle affichés dans l'app (et utilisés par les tests). */
export function energyScenarios(p = S.profile) {
  const sc = [
    { label: '4 000 pas', day: { steps: 4000, stepsSource: 'scénario' } },
    { label: '10 000 pas', day: { steps: 10000, stepsSource: 'scénario' } },
    { label: '18 000 pas (travail en magasin)', day: { steps: 18000, stepsSource: 'scénario', workActive: true } },
    { label: '20 000 pas + musculation 75 min (RPE 8)', day: { steps: 20000, stepsSource: 'scénario', workActive: true }, sessions: [{ durationMin: 75, rpe: 8 }] },
    { label: '12 000 pas dont 5 km de course (30 min)', day: { steps: 12000, stepsSource: 'scénario' }, runs: [{ distKm: 5, durSec: 1800 }] }
  ];
  return sc.map(s => Object.assign({ label: s.label }, energyCore(p, s.day, s.runs || [], s.sessions || [])));
}

export function goalAdjust(p = S.profile) {
  if (p.goal === 'bulk') return +Math.abs(p.surplus || 0);
  if (p.goal === 'cut') return -Math.abs(p.deficit || 0);
  return 0;
}

export function macroTargets(kcal, p = S.profile, weight = p.weight) {
  const defP = { bulk: 1.8, maintain: 2.0, cut: 2.2 }[p.goal] || 2;
  const defF = { bulk: 1.0, maintain: 0.9, cut: 0.8 }[p.goal] || 0.9;
  const o = p.macroOverride || {};
  const prot = o.p ?? Math.round((p.proteinPerKg ?? defP) * weight);
  const fat = o.f ?? Math.round((p.fatPerKg ?? defF) * weight);
  const carbs = o.c ?? Math.max(0, Math.round((kcal - prot * 4 - fat * 9) / 4));
  return { p: prot, f: fat, c: carbs, kcalFromMacros: prot * 4 + fat * 9 + carbs * 4 };
}

export function dayTarget(date, opts) {
  const e = dayEnergy(date, opts);
  const adj = goalAdjust();
  const kcal = S.profile.kcalOverride ? S.profile.kcalOverride : Math.round(e.maintenance + adj);
  return Object.assign(e, { adj, kcal, macros: macroTargets(kcal, S.profile, e.weight), fixed: !!S.profile.kcalOverride });
}

// ---------------------------------------------------------------------
// 2. NUTRITION — journal
// ---------------------------------------------------------------------
export function entryNutr(e) {
  const k = (e.grams || 0) / 100; const n = e.per100 || {};
  const g = x => (n[x] ?? null) === null ? null : n[x] * k;
  return { kcal: g('kcal') || 0, p: g('p') || 0, c: g('c') || 0, f: g('f') || 0, sugar: g('sugar'), sat: g('sat'), fiber: g('fiber'), salt: g('salt') };
}
export function dayIntake(date) {
  const entries = S.foodLog.filter(e => e.date === date);
  const t = { kcal: 0, p: 0, c: 0, f: 0, fiber: 0, sugar: 0, sat: 0, salt: 0, n: entries.length };
  for (const e of entries) { const n = entryNutr(e); for (const k of ['kcal', 'p', 'c', 'f', 'fiber', 'sugar', 'sat', 'salt']) t[k] += n[k] || 0; }
  const d = S.days[date];
  // Apports saisis globalement (ex : import du Sheets) si pas de journal détaillé
  if (!entries.length && d && d.kcalIn) { t.kcal = d.kcalIn; t.p = d.pIn || 0; t.c = d.cIn || 0; t.f = d.fIn || 0; t.n = 1; t.fromSummary = true; }
  return t;
}
export function dayLogged(date) { const d = S.days[date]; return (d && d.logComplete) || dayIntake(date).kcal > 800; }

// ---------------------------------------------------------------------
// 3. POIDS : tendance et calibration de la maintenance
// ---------------------------------------------------------------------
export function weightSeries(from, to) {
  return Object.values(S.days).filter(d => d.weight && d.date >= from && d.date <= to).sort((a, b) => a.date < b.date ? -1 : 1).map(d => ({ date: d.date, v: d.weight }));
}
/** Moyenne mobile exponentielle (α = 0,1) jour par jour, insensible aux variations d'eau. */
export function weightTrend(from, to) {
  const all = weightSeries('0000-00-00', to);
  if (!all.length) return [];
  let ema = all[0].v; const out = []; let i = 0;
  // pas de prolongation au-delà de la dernière pesée (la tendance serait inventée)
  for (const day of rangeDays(all[0].date, all[all.length - 1].date)) {
    while (i < all.length && all[i].date === day) { ema = ema + 0.1 * (all[i].v - ema); i++; }
    if (day >= from) out.push({ date: day, v: ema });
  }
  return out;
}
export function linSlope(points) { // points [{x, y}] -> pente
  if (points.length < 2) return null;
  const mx = avg(points.map(p => p.x)), my = avg(points.map(p => p.y));
  let n = 0, d = 0; for (const p of points) { n += (p.x - mx) * (p.y - my); d += (p.x - mx) ** 2; }
  return d ? n / d : null;
}
/** Vitesse d'évolution du poids (kg/semaine) sur n jours, par régression sur les pesées. */
export function weightRate(days = 28, to = todayStr()) {
  const from = addDays(to, -days + 1);
  const pts = weightSeries(from, to);
  if (pts.length < 4 || dayDiff(pts[0].date, pts[pts.length - 1].date) < Math.min(10, days / 2)) return null;
  const s = linSlope(pts.map(p => ({ x: dayDiff(from, p.date), y: p.v })));
  return s === null ? null : { perWeek: s * 7, n: pts.length, from: pts[0].date, to: pts[pts.length - 1].date };
}

/**
 * Calibration : compare apports réels et évolution du poids pour estimer la maintenance réelle.
 * Ne s'applique que si les données sont suffisantes ; ajustement progressif (30 % de l'écart).
 */
export function computeCalibration(to = todayStr(), windowDays = 28) {
  const from = addDays(to, -windowDays + 1);
  const days = rangeDays(from, to);
  const logged = days.filter(dayLogged);
  const rate = weightRate(windowDays, to);
  const res = { from, to, windowDays, loggedDays: logged.length, weighIns: weightSeries(from, to).length, ok: false, reasons: [] };
  if (logged.length < windowDays * 0.7) res.reasons.push(`Journal alimentaire complet sur au moins ${Math.ceil(windowDays * 0.7)} jours (actuellement ${logged.length}).`);
  if (!rate) res.reasons.push('Au moins 4 pesées réparties sur 2 semaines.');
  if (res.reasons.length) return res;
  const intake = avg(logged.map(d => dayIntake(d).kcal));
  const saved = S.calib?.factor || 1;
  const model = avg(logged.map(d => dayEnergy(d, { stepsMode: 'live' }).model));
  const observed = intake - rate.perWeek / 7 * KCAL_PER_KG;
  const raw = clamp(observed / model, 0.8, 1.2);
  const proposed = +(saved + 0.3 * (raw - saved)).toFixed(3);
  return Object.assign(res, { ok: true, intake, model, observed, rate, raw, current: saved, proposed });
}

export function weightAlerts() {
  const out = []; const p = S.profile; const r = weightRate(21);
  if (!r) return out;
  const pct = r.perWeek / weightAt(todayStr()) * 100;
  if (p.goal === 'bulk') {
    if (pct > 0.5) out.push({ lvl: 'warn', t: `Prise de poids rapide : ${pct.toFixed(2)} %/semaine (${r.perWeek.toFixed(2)} kg). Au-delà d'environ 0,25–0,5 %/semaine, une part croissante est souvent de la graisse. Envisage de réduire le surplus.` });
    else if (pct < 0.05) out.push({ lvl: 'info', t: `Poids quasi stable (${r.perWeek.toFixed(2)} kg/semaine) alors que tu es en prise de masse : le surplus réel est peut-être trop faible.` });
  } else if (p.goal === 'cut') {
    if (pct < -1) out.push({ lvl: 'warn', t: `Perte rapide : ${pct.toFixed(2)} %/semaine. Au-delà de ~1 %/semaine, le risque de perte musculaire et de fatigue augmente. Envisage de réduire le déficit.` });
    else if (pct > -0.15) out.push({ lvl: 'info', t: `Perte très lente (${r.perWeek.toFixed(2)} kg/semaine). Vérifie la régularité du journal alimentaire avant de modifier le déficit.` });
  } else if (Math.abs(pct) > 0.4) out.push({ lvl: 'info', t: `Ton poids varie de ${r.perWeek.toFixed(2)} kg/semaine alors que l'objectif est le maintien.` });
  return out;
}

// ---------------------------------------------------------------------
// 4. MUSCULATION
// ---------------------------------------------------------------------
export const GROUPS = ['Pectoraux', 'Dos', 'Épaules', 'Biceps', 'Triceps', 'Quadriceps', 'Ischio-jambiers', 'Fessiers', 'Adducteurs', 'Mollets', 'Abdominaux'];
const MUSCLE_MAP = [
  [/abdo|gainage|core|oblique/, 'Abdominaux'], [/tricep/, 'Triceps'], [/bicep/, 'Biceps'], [/pector|\bpecs?\b/, 'Pectoraux'], [/dorsal|dos|trap|lomb/, 'Dos'], [/delto|epaule/, 'Épaules'], [/bicep/, 'Biceps'], [/tricep/, 'Triceps'],
  [/quad/, 'Quadriceps'], [/ischio/, 'Ischio-jambiers'], [/fess|glut/, 'Fessiers'], [/adduct/, 'Adducteurs'], [/mollet|calf/, 'Mollets'], [/abdo|gainage|core/, 'Abdominaux']
];
export function muscleGroup(m) { const n = norm(m); for (const [re, g] of MUSCLE_MAP) if (re.test(n)) return g; return m ? 'Autre' : null; }
export function guessEquipment(name) {
  const n = norm(name);
  if (/haltere|db\b/.test(n)) return 'haltères';
  if (/poulie|cable|vis a vis|corde|tirage|pulldown|sa triceps|crunch poulie/.test(n)) return 'poulie';
  if (/barre|rdl|souleve/.test(n)) return 'barre';
  if (/machine|presse|leg |hack|chest press|smith|pec deck|adducteur|abducteur|chest supported/.test(n)) return 'machine';
  if (/traction|pompe|dips|crunch|releve|gainage|sit up|russian|squat bulgare/.test(n)) return 'poids du corps';
  return 'autre';
}
export function guessMovement(name, muscles) {
  const n = norm(name);
  if (/developpe|squat|presse|rdl|souleve|traction|tirage|row|rowing|dips|hack|fente|chest press|militaire/.test(n)) return 'polyarticulaire';
  if ((muscles || []).filter(Boolean).length >= 3) return 'polyarticulaire';
  return 'isolation';
}
export function exKey(name) { return norm(name).replace(/\s+/g, ' '); }

export function e1rm(w, r) { if (!w || !r) return null; return r === 1 ? w : w * (1 + r / 30); }
export const setLoad = s => (s.w ?? s.wInferred ?? null);

/** Toutes les séances validées, ordre chronologique. */
export function doneSessions() { return S.sessions.filter(s => s.status !== 'pending'); }

/** Historique d'un exercice : une entrée par séance. */
export function exerciseHistory(exId) {
  const out = [];
  for (const s of doneSessions()) {
    const sets = (s.sets || []).filter(x => x.exId === exId && x.r > 0);
    if (!sets.length) continue;
    const comparable = sets.filter(x => !x.variant);
    const withLoad = comparable.filter(x => setLoad(x) > 0);
    let best = null, top = null;
    for (const x of withLoad) {
      const e = e1rm(setLoad(x), x.r);
      if (!best || e > best) best = e;
      if (!top || setLoad(x) > setLoad(top) || (setLoad(x) === setLoad(top) && x.r > top.r)) top = x;
    }
    out.push({
      date: s.date, sessionId: s.id, dateApprox: !!s.dateApprox, sets, comparable,
      e1rm: best, top, topLoad: top ? setLoad(top) : null, topReps: top ? top.r : (Math.max(...sets.map(x => x.r))),
      reps: sum(sets.map(x => x.r)), volume: sum(withLoad.map(x => setLoad(x) * x.r)),
      inferred: sets.some(x => x.w == null && x.wInferred != null), variant: sets.some(x => x.variant)
    });
  }
  return out;
}

export function exerciseStats(exId) {
  const h = exerciseHistory(exId);
  const st = { history: h, count: h.length, last: h[h.length - 1] || null };
  // Record réellement réalisé : charge max soulevée (et meilleures reps à cette charge)
  let pr = null, prE = null;
  for (const e of h) for (const x of e.comparable) {
    const l = setLoad(x); if (!l) continue;
    if (!pr || l > pr.w || (l === pr.w && x.r > pr.r)) pr = { w: l, r: x.r, date: e.date, inferred: x.w == null };
    const v = e1rm(l, x.r); if (!prE || v > prE.v) prE = { v, w: l, r: x.r, date: e.date, reliable: x.r <= 12 };
  }
  st.pr = pr; st.e1rmBest = prE;
  st.volumeTotal = sum(h.map(e => e.volume));
  const today = todayStr();
  st.prog = {};
  for (const days of [30, 90, 180]) {
    const ref = st.last ? st.last.date : today;
    const win = h.filter(e => e.date >= addDays(ref, -days) && e.e1rm);
    if (win.length >= 2) st.prog[days] = (win[win.length - 1].e1rm / win[0].e1rm - 1) * 100;
    else st.prog[days] = null;
  }
  return st;
}

/** Analyse d'évolution : amélioration / stagnation / régression / changement probable d'exercice. */
export function exerciseTrend(exId) {
  const h = exerciseHistory(exId).filter(e => e.e1rm);
  const r = { status: 'insuffisant', notes: [] };
  if (h.length < 2) return r;
  const last = h[h.length - 1], prev = h[h.length - 2];
  if (prev.topLoad && last.topLoad && last.topLoad < prev.topLoad * 0.75) {
    r.notes.push(`Charge passée de ${prev.topLoad} à ${last.topLoad} kg : changement de matériel, de variante ou d'exercice ? Les comparaisons sont peut-être faussées.`);
    r.changed = true;
  }
  if (h.length >= 5) {
    const recent = Math.max(...h.slice(-3).map(e => e.e1rm));
    const before = Math.max(...h.slice(-6, -3).map(e => e.e1rm));
    const span = dayDiff(h[h.length - 6 >= 0 ? h.length - 6 : 0].date, last.date);
    if (recent > before * 1.01) r.status = 'progression';
    else if (recent < before * 0.95) r.status = 'regression';
    else r.status = span >= 21 ? 'stagnation' : 'stable';
  } else {
    r.status = last.e1rm > prev.e1rm * 1.01 ? 'progression' : last.e1rm < prev.e1rm * 0.95 ? 'regression' : 'stable';
  }
  return r;
}

export function parseRange(s) {
  if (!s) return null;
  const m = String(s).match(/(\d+)\s*[-–à]\s*(\d+)/); if (m) return [+m[1], +m[2]];
  const n = String(s).match(/\d+/); return n ? [+n[0], +n[0]] : null;
}

/**
 * Recommandation de charge pour la prochaine séance (double progression).
 * Ne modifie jamais rien : c'est une suggestion affichée.
 */
export function recommend(exId, plan) {
  const ex = S.exercises.find(e => e.id === exId);
  const h = exerciseHistory(exId);
  const range = plan?.range || parseRange(ex?.repRange) || [8, 12];
  const [lo, hi] = range;
  if (!h.length) return { kind: 'new', text: 'Pas encore d’historique : choisis une charge qui te laisse 1 à 3 répétitions en réserve dans la fourchette ' + lo + '–' + hi + '.' };
  const last = h[h.length - 1];
  const sets = last.comparable.filter(x => setLoad(x) > 0);
  if (!sets.length) return { kind: 'info', text: `Dernière fois : ${last.sets.map(x => x.r).join(' / ')} reps (charge non renseignée).` };
  const top = Math.max(...sets.map(setLoad));
  const atTop = sets.filter(x => setLoad(x) === top);
  const inc = S.profile.increments[ex?.equipment || 'autre'] ?? 2.5;
  const trend = exerciseTrend(exId);
  const allHi = atTop.length >= Math.min(2, plan?.sets || 2) && atTop.every(x => x.r >= hi);
  const anyLow = atTop.filter(x => x.r < lo).length >= Math.ceil(atTop.length / 2);
  const prev = h[h.length - 2];
  const prevLow = prev && prev.comparable.filter(x => setLoad(x) === top && x.r < lo).length > 0;
  const lastTxt = `Dernière fois (${last.date}) : ${atTop.map(x => x.r).join(' / ')} reps à ${top} kg`;
  let out;
  if (allHi && inc > 0) out = { kind: 'up', load: +(top + inc).toFixed(2), text: `${lastTxt}. Toutes les séries au sommet de la fourchette (${hi}) → tu peux tenter ${+(top + inc).toFixed(2)} kg en visant ${lo}+ reps.` };
  else if (allHi) out = { kind: 'up', text: `${lastTxt}. Fourchette atteinte : ajoute une répétition, du lest ou ralentis la phase excentrique.` };
  else if (anyLow && prevLow) out = { kind: 'down', load: +(top * 0.92).toFixed(1), text: `${lastTxt}. Deux séances sous ${lo} reps : garde une marge, éventuellement ~${+(top * 0.92).toFixed(1)} kg pour revenir dans la fourchette.` };
  else if (anyLow) out = { kind: 'keep', load: top, text: `${lastTxt}. Sous la fourchette : garde ${top} kg et vise ${lo} reps propres avant d'augmenter.` };
  else out = { kind: 'keep', load: top, text: `${lastTxt}. Garde ${top} kg et essaie d'ajouter 1 rep sur les séries les plus faibles.` };
  if (trend.status === 'stagnation') out.text += ' Stagnation depuis plusieurs séances : vérifie sommeil/récupération, ou change de fourchette ou de variante.';
  if (trend.changed) out.text += ' (Comparaison à confirmer : grosse variation de charge récente.)';
  if (last.inferred) out.text += ' Certaines charges de la dernière séance étaient vides dans le Sheets (reprises de la série précédente).';
  return out;
}

export function sessionTonnage(s) { return sum((s.sets || []).filter(x => x.r > 0 && setLoad(x) > 0).map(x => setLoad(x) * x.r)); }
export function sessionSetsCount(s) { return (s.sets || []).filter(x => x.r > 0).length; }

/** Volume par groupe musculaire sur une période : séries directes (1) + indirectes (0,5), tonnage direct. */
export function muscleVolume(from, to) {
  const res = {}; for (const g of GROUPS) res[g] = { sets: 0, indirect: 0, tonnage: 0, sessions: new Set() };
  for (const s of doneSessions()) {
    if (s.date < from || s.date > to) continue;
    for (const x of s.sets || []) {
      if (!(x.r > 0)) continue;
      const ex = S.exercises.find(e => e.id === x.exId); if (!ex) continue;
      const g = ex.group; if (res[g]) { res[g].sets += 1; res[g].tonnage += (setLoad(x) || 0) * x.r; res[g].sessions.add(s.id); }
      for (const m of ex.secondary || []) { const g2 = muscleGroup(m); if (res[g2] && g2 !== g) res[g2].indirect += 0.5; }
    }
  }
  const weeks = Math.max(1, (dayDiff(from, to) + 1) / 7);
  for (const g of GROUPS) { res[g].freq = res[g].sessions.size / weeks; res[g].sessions = res[g].sessions.size; res[g].perWeek = (res[g].sets + res[g].indirect) / weeks; }
  return res;
}

export function weeklyTonnage(weeks = 12, to = todayStr()) {
  const out = []; let m = mondayOf(to);
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(m, -7 * i), end = addDays(start, 6);
    const ss = doneSessions().filter(s => s.date >= start && s.date <= end);
    out.push({ date: start, v: sum(ss.map(sessionTonnage)), n: ss.length });
  }
  return out;
}

export function recentPRs(days = 30) {
  const out = []; const from = addDays(todayStr(), -days);
  for (const ex of S.exercises) {
    const h = exerciseHistory(ex.id); let bestBefore = 0;
    for (const e of h) {
      for (const x of e.comparable) {
        const l = setLoad(x); if (!l) continue;
        if (e.date >= from && l > bestBefore && bestBefore > 0) out.push({ ex, date: e.date, w: l, r: x.r, prev: bestBefore });
      }
      for (const x of e.comparable) bestBefore = Math.max(bestBefore, setLoad(x) || 0);
    }
  }
  const uniq = {}; for (const p of out) { const k = p.ex.id; if (!uniq[k] || p.w > uniq[k].w) uniq[k] = p; }
  return Object.values(uniq).sort((a, b) => a.date < b.date ? 1 : -1);
}

/**
 * Numéro de semaine du programme pour une date, dans la continuité du Sheets
 * (« Semaine 15 », puis 16, 17… pour les séances enregistrées dans l'app).
 */
export function programWeek(date) {
  const ref = S.sessions.filter(s => s.source === 'sheet' && s.week != null).reduce((a, b) => (!a || b.week > a.week) ? b : a, null);
  if (ref) return ref.week + Math.round(dayDiff(mondayOf(ref.date), mondayOf(date)) / 7);
  const first = doneSessions()[0];
  return first ? 1 + Math.round(dayDiff(mondayOf(first.date), mondayOf(date)) / 7) : null;
}

/** Prochaine séance suggérée selon le jour habituel puis la rotation observée. */
export function nextTemplate(date = todayStr()) {
  const tpls = S.templates.filter(t => !t.archived && t.exercises?.length);
  if (!tpls.length) return null;
  const wd = parseD(date).getDay();
  const weekStart = mondayOf(date);
  const doneThisWeek = new Set(doneSessions().filter(s => s.date >= weekStart && s.date <= date).map(s => s.templateId));
  const today = tpls.find(t => t.day === wd && !doneThisWeek.has(t.id));
  if (today) return { tpl: today, why: 'prévue ce jour dans ton organisation' };
  // sinon : la séance non faite cette semaine dont le jour prévu est le plus proche
  const pending = tpls.filter(t => !doneThisWeek.has(t.id)).sort((a, b) => ((a.day ?? 9) + 6) % 7 - ((b.day ?? 9) + 6) % 7);
  if (pending.length) return { tpl: pending[0], why: 'pas encore faite cette semaine' };
  const last = {}; for (const s of doneSessions()) last[s.templateId] = s.date;
  const oldest = [...tpls].sort((a, b) => (last[a.id] || '') < (last[b.id] || '') ? -1 : 1)[0];
  return { tpl: oldest, why: 'la plus ancienne de ta rotation' };
}

// ---------------------------------------------------------------------
// 5. COURSE
// ---------------------------------------------------------------------
export function pace(r) { return r.distKm ? r.durSec / r.distKm : null; }
export function speed(r) { return r.durSec ? r.distKm / (r.durSec / 3600) : null; }
/** Prédiction de Riegel (t2 = t1 × (d2/d1)^1,06) depuis la meilleure sortie récente ≥ 2,5 km. */
export function predictTime(distKm, days = 180) {
  const from = addDays(todayStr(), -days);
  const c = S.runs.filter(r => r.date >= from && r.distKm >= 2.5 && r.durSec > 0);
  if (!c.length) return null;
  let best = null;
  for (const r of c) { const t = r.durSec * Math.pow(distKm / r.distKm, 1.06); if (!best || t < best.t) best = { t, from: r }; }
  best.extrapolation = best.from.distKm < distKm * 0.5;
  return best;
}
export function sameDistanceGroups() {
  const g = {};
  for (const r of S.runs) {
    if (!r.distKm) continue; const k = (Math.round(r.distKm * 2) / 2).toFixed(1);
    (g[k] = g[k] || []).push(r);
  }
  return Object.entries(g).filter(([, a]) => a.length >= 2).map(([k, a]) => ({ dist: +k, runs: a.sort((x, y) => x.date < y.date ? -1 : 1) }));
}
export const RUN_TYPES = { ef: 'Endurance fondamentale', continu: 'Course continue', fractionne: 'Fractionné', recup: 'Récupération' };

// ---------------------------------------------------------------------
// 6. RÉCUPÉRATION & CHARGE
// ---------------------------------------------------------------------
export function dayLoad(date) {
  let l = 0, est = false;
  for (const s of doneSessions().filter(s => s.date === date)) { l += (s.rpe ?? 7) * (s.durationMin || 70); if (s.rpe == null || !s.durationMin) est = true; }
  for (const r of S.runs.filter(r => r.date === date)) { l += runRpe(r) * (r.durSec || 0) / 60; if (r.rpe == null) est = true; }
  return { l, est };
}
/** Charge aiguë (7 j) comparée à la moyenne hebdomadaire des 28 jours précédents. */
export function acwr(to = todayStr()) {
  const acute = sum(rangeDays(addDays(to, -6), to).map(d => dayLoad(d).l));
  const chronicDays = rangeDays(addDays(to, -34), addDays(to, -7));
  const chronic = sum(chronicDays.map(d => dayLoad(d).l)) / 4;
  const activeWeeks = [0, 1, 2, 3].filter(w => sum(rangeDays(addDays(to, -34 + w * 7), addDays(to, -28 + w * 7)).map(d => dayLoad(d).l)) > 0).length;
  if (chronic <= 0 || activeWeeks < 3) return { acute, chronic, ratio: null, zone: 'insuffisant' };
  const ratio = acute / chronic;
  const zone = ratio < 0.8 ? 'basse' : ratio <= 1.3 ? 'stable' : ratio <= 1.5 ? 'hausse' : 'forte hausse';
  return { acute, chronic, ratio, zone };
}

export function recoverySignals(to = todayStr()) {
  const out = [];
  const days = rangeDays(addDays(to, -6), to).map(d => S.days[d]).filter(Boolean);
  const sleep = avg(days.map(d => d.sleepH)); const fatigue = avg(days.map(d => d.fatigue));
  const sore = avg(days.map(d => d.soreness)); const mot = avg(days.map(d => d.motivation));
  const pain = days.filter(d => d.pain && String(d.pain).trim());
  if (sleep !== null && sleep < 6.5) out.push(`Sommeil moyen de ${sleep.toFixed(1)} h sur 7 jours.`);
  if (fatigue !== null && fatigue >= 7) out.push(`Fatigue ressentie élevée (${fatigue.toFixed(1)}/10 en moyenne).`);
  if (sore !== null && sore >= 7) out.push(`Courbatures importantes (${sore.toFixed(1)}/10).`);
  if (mot !== null && mot <= 3) out.push(`Motivation basse (${mot.toFixed(1)}/10).`);
  if (pain.length) out.push(`Douleur signalée ${pain.length} jour(s) : « ${pain[pain.length - 1].pain} ».`);
  const a = acwr(to);
  if (a.ratio && a.ratio > 1.5) out.push(`Charge des 7 derniers jours ${a.ratio.toFixed(2)}× supérieure à ta moyenne : augmentation rapide.`);
  const reg = S.exercises.filter(e => { const h = exerciseHistory(e.id); const l = h[h.length - 1]; return l && l.date >= addDays(to, -10) && exerciseTrend(e.id).status === 'regression'; });
  if (reg.length >= 2) out.push(`Baisse de performance sur ${reg.length} exercices ces 10 derniers jours (${reg.slice(0, 3).map(e => e.name).join(', ')}).`);
  const s = doneSessions(); const rpeHigh = s.filter(x => x.date >= addDays(to, -13) && x.rpe >= 9).length;
  if (rpeHigh >= 4) out.push(`${rpeHigh} séances à RPE ≥ 9 en 2 semaines.`);
  return { signals: out, sleep, fatigue, sore, mot, acwr: a, suggestDeload: out.length >= 2 };
}

// ---------------------------------------------------------------------
// 7. ACTIVITÉ
// ---------------------------------------------------------------------
export function stepGoalAt(date) {
  const g = [...(S.stepGoals || [])].filter(x => x.from <= date).sort((a, b) => a.from < b.from ? 1 : -1)[0];
  return g ? g.goal : S.profile.stepGoal;
}
export function stepStats(to = todayStr()) {
  const get = n => rangeDays(addDays(to, -n + 1), to).map(d => S.days[d]?.steps).filter(x => x > 0);
  const all = Object.values(S.days).filter(d => d.steps > 0);
  const rec = all.reduce((b, d) => (!b || d.steps > b.steps) ? d : b, null);
  const w0 = get(7), w1 = rangeDays(addDays(to, -13), addDays(to, -7)).map(d => S.days[d]?.steps).filter(x => x > 0);
  const hit30 = rangeDays(addDays(to, -29), to).filter(d => (S.days[d]?.steps || 0) >= stepGoalAt(d)).length;
  return { avg7: avg(w0), avg30: avg(get(30)), record: rec, week: sum(w0), prevWeek: sum(w1), daysWith7: w0.length, hit30, total30: sum(get(30)) };
}
/** Classification de la journée : sédentaire / active / très exigeante. */
export function dayKind(date) {
  const d = S.days[date] || {}; const e = dayEnergy(date, { stepsMode: 'live' });
  const score = (d.steps || 0) / 1000 + (d.workActive ? 4 : 0) + (d.standMin ? d.standMin / 60 : 0) + e.sessions * 3 + e.runs * 4;
  if (!d.steps && !d.workActive && !e.sessions && !e.runs) return null;
  return score >= 20 ? 'très exigeante' : score >= 10 ? 'active' : 'sédentaire';
}
