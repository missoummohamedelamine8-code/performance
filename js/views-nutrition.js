// =====================================================================
// views-nutrition.js — Nutrition : journal, objectifs, produits, recettes
// =====================================================================
import { S, put, del, uid, esc, f0, f1, fdate, todayStr, addDays, num, norm, patchDay, saveProfile, kvSet, avg, rangeDays } from './core.js';
import * as C from './calc.js';
import * as F from './foods.js';
import { R, VIEWS, rerender } from './nav.js';
import { actions, openSheet, toast, card, kpi, badge, seg, field, inp, sel, formData, confirmDlg, est, topSheet } from './ui.js';
import { bar } from './charts.js';

const MEALS = [['petitdej', 'Petit-déjeuner'], ['dejeuner', 'Déjeuner'], ['collation', 'Collation'], ['diner', 'Dîner']];
const mealLabel = k => (MEALS.find(m => m[0] === k) || [k, k])[1];
const defaultMeal = () => { const h = new Date().getHours(); return h < 10 ? 'petitdej' : h < 15 ? 'dejeuner' : h < 18 ? 'collation' : 'diner'; };

VIEWS.nutri = () => {
  const sub = R.sub.nutri;
  let o = `<h1 class="title">Nutrition</h1>` + seg('nutri', [['journal', 'Journal'], ['objectifs', 'Objectifs'], ['aliments', 'Mes aliments'], ['recettes', 'Recettes']], sub, 'subtab');
  if (sub === 'journal') o += journal();
  else if (sub === 'objectifs') o += objectives();
  else if (sub === 'aliments') o += myLibrary();
  else o += recipes();
  return o;
};

// ------------------------------ Journal -------------------------------
function journal() {
  const d = R.date; const tg = C.dayTarget(d); const it = C.dayIntake(d); const day = S.days[d] || {};
  let o = `<div class="row between datebar"><button class="icon-btn" data-a="nDay" data-d="-1">‹</button><b>${d === todayStr() ? "Aujourd'hui" : fdate(d, true)}</b><button class="icon-btn" data-a="nDay" data-d="1" ${d >= todayStr() ? 'disabled' : ''}>›</button></div>`;
  o += card(`<div class="row between"><div><small class="muted">Objectif ${tg.fixed ? '(fixé manuellement)' : est()}</small><div class="big-n">${f0(tg.kcal)} <small>kcal</small></div></div>
    <div class="right"><small class="muted">Consommé</small><div class="big-n">${f0(it.kcal)}</div><small class="${tg.kcal - it.kcal < 0 ? 'c-red' : 'muted'}">${tg.kcal - it.kcal >= 0 ? 'reste ' + f0(tg.kcal - it.kcal) : '+' + f0(it.kcal - tg.kcal)}</small></div></div>
    ${bar(it.kcal / tg.kcal, 'var(--yellow)')}
    <div class="macros mt-s">${['p', 'c', 'f'].map(k => `<div class="macro"><small>${{ p: 'Protéines', c: 'Glucides', f: 'Lipides' }[k]}</small><b>${f0(it[k])}<span>/${f0(tg.macros[k])} g</span></b>${bar(it[k] / tg.macros[k], 'var(--yellow)', 'thin')}</div>`).join('')}</div>
    <details class="mt-s"><summary class="small">Comment est calculé l'objectif ?</summary>${breakdown(tg)}</details>
    ${it.fromSummary ? '<p class="note small">Apports issus du résumé importé (Sheets), pas du journal détaillé.</p>' : ''}`);
  for (const [k, l] of MEALS) {
    const es = S.foodLog.filter(e => e.date === d && e.meal === k);
    const kc = es.reduce((s, e) => s + C.entryNutr(e).kcal, 0);
    o += card(`<div class="card-h"><h3>${l} <small class="muted">${f0(kc)} kcal</small></h3><button class="btn small" data-a="nutriAdd" data-meal="${k}">+ Ajouter</button></div>
      ${es.map(e => { const n = C.entryNutr(e); return `<button class="list-i" data-a="editEntry" data-id="${e.id}"><div class="row between"><b>${esc(e.name)}</b><span>${f0(n.kcal)} kcal</span></div><small>${esc(e.brand || '')}${e.brand ? ' · ' : ''}${f0(e.qty)} ${esc(e.qtyUnit || e.unit || 'g')}${e.qtyUnit === 'portion' ? ` (${f0(e.grams)} ${e.unit})` : ''} · P ${f0(n.p)} · G ${f0(n.c)} · L ${f0(n.f)}</small></button>`; }).join('')}
      ${es.length ? `<button class="link small" data-a="saveMealRecipe" data-meal="${k}">Enregistrer ce repas comme repas récurrent</button>` : ''}`);
  }
  const water = day.water || 0;
  o += card(`<div class="card-h"><h3>Hydratation <small class="muted">facultatif</small></h3><span>${f1(water / 1000)} / ${f1(S.profile.waterGoal / 1000)} L</span></div>${bar(water / S.profile.waterGoal, 'var(--blue)')}
    <div class="row gap mt-s">${[250, 500, 750].map(v => `<button class="btn ghost grow" data-a="water" data-v="${v}">+${v} ml</button>`).join('')}<button class="btn ghost" data-a="water" data-v="-250">−</button></div>`);
  o += `<label class="chk-row card"><input type="checkbox" data-ch="logComplete" ${day.logComplete ? 'checked' : ''}> Journée saisie en entier (utilisée pour calibrer ta maintenance réelle)</label>`;
  return o;
}

function breakdown(tg) {
  const row = (l, v, cls = '') => `<div class="hist-row ${cls}"><span>${l}</span><b>${v}</b></div>`;
  return `<div class="small">${row('Métabolisme de base (Mifflin-St Jeor)', f0(tg.bmr))}${row('Vie courante + digestion (×1,2)', '+' + f0(tg.base - tg.bmr))}
    ${row(`Marche : ${f0(tg.extraSteps)} pas au-delà de ${f0(S.profile.baselineSteps)} (≈ ${f1(tg.walkKm)} km)`, '+' + f0(tg.walk))}
    ${tg.runStepsRemoved ? row(`Pas de course retirés de la marche (anti double comptage)`, '−' + f0(tg.runStepsRemoved) + ' pas') : ''}
    ${row('Course', '+' + f0(tg.run))}${row('Musculation', '+' + f0(tg.strength))}${row('Station debout / travail actif', '+' + f0(tg.stand))}${row('Autres activités', '+' + f0(tg.other))}
    ${tg.factor !== 1 ? row('Calibration sur tes données réelles', '×' + tg.factor.toFixed(3)) : ''}
    ${row('= Maintenance estimée', f0(tg.maintenance) + ' ± ' + f0(tg.unc), 'tot')}${row('Objectif (' + { bulk: 'surplus', maintain: 'maintien', cut: 'déficit' }[S.profile.goal] + ')', (tg.adj >= 0 ? '+' : '') + tg.adj)}
    ${row('= Calories cibles', f0(tg.kcal), 'tot')}<p class="muted">Pas utilisés : ${esc(tg.stepsSource)}. Ce sont des estimations, pas des mesures.</p></div>`;
}

// ------------------------------ Objectifs -----------------------------
function objectives() {
  const p = S.profile; const t = todayStr(); const tg = C.dayTarget(t);
  const cal = C.computeCalibration();
  const rate = C.weightRate(28);
  const alerts = C.weightAlerts();
  let o = card(`<h3>Objectif physique</h3>${seg('goal', [['bulk', 'Prise de masse'], ['maintain', 'Maintien'], ['cut', 'Sèche']], p.goal, 'setGoal')}
    <form class="mt" id="goalForm"><div class="grid2">${p.goal === 'bulk' ? field('Surplus (kcal/j)', `<input type="number" step="25" name="surplus" value="${p.surplus}">`, 'Modéré : 150–300') : ''}
    ${p.goal === 'cut' ? field('Déficit (kcal/j)', `<input type="number" step="25" name="deficit" value="${p.deficit}">`, 'Modéré : 300–500') : ''}
    ${field('Base du calcul', sel('targetBasis', [['live', 'Pas réels du jour'], ['avg7', 'Moyenne 7 jours (plus stable)']], p.targetBasis))}
    ${field('Objectif fixe (kcal)', `<input type="number" name="kcalOverride" value="${p.kcalOverride ?? ''}" placeholder="dynamique">`, 'Vide = adapté à l’activité')}</div>
    <h4>Macronutriments (g/jour)</h4><div class="grid3">${field('Protéines', `<input type="number" name="mp" value="${p.macroOverride.p ?? ''}" placeholder="${tg.macros.p}">`)}${field('Lipides', `<input type="number" name="mf" value="${p.macroOverride.f ?? ''}" placeholder="${tg.macros.f}">`)}${field('Glucides', `<input type="number" name="mc" value="${p.macroOverride.c ?? ''}" placeholder="${tg.macros.c}">`)}</div>
    <p class="muted small">Par défaut : protéines ${{ bulk: 1.8, maintain: 2.0, cut: 2.2 }[p.goal]} g/kg (priorité au muscle), lipides ${{ bulk: 1.0, maintain: 0.9, cut: 0.8 }[p.goal]} g/kg, glucides = le reste. Laisse vide pour le calcul automatique.</p>
    <button type="button" class="btn w100" data-a="saveGoal">Enregistrer</button></form>`);
  o += card(`<h3>Aujourd'hui</h3><div class="kpis">${kpi('Calories cibles', f0(tg.kcal))}${kpi('Maintenance estimée', f0(tg.maintenance), '± ' + f0(tg.unc), 'est-k')}${kpi('Ajustement activité', '+' + f0(tg.activity), 'vs base ' + f0(tg.base))}${kpi('Surplus / déficit', (tg.adj >= 0 ? '+' : '') + tg.adj)}
    ${kpi('Protéines', tg.macros.p + ' g')}${kpi('Glucides', tg.macros.c + ' g')}${kpi('Lipides', tg.macros.f + ' g')}</div>${breakdown(tg)}`);
  o += card(`<h3>Suivi de l'objectif</h3>${rate ? `<p>Tendance du poids (régression sur 4 semaines, ${rate.n} pesées) : <b>${rate.perWeek >= 0 ? '+' : ''}${f1(rate.perWeek * 1000 / 1000)} kg/semaine</b>.</p>` : '<p class="muted">Pas assez de pesées pour une tendance fiable (4 pesées sur 2 semaines minimum).</p>'}
    ${alerts.map(a => `<p class="note ${a.lvl}">${esc(a.t)}</p>`).join('')}
    ${p.goal === 'cut' && C.recoverySignals().fatigue >= 7 ? '<p class="note warn">Fatigue persistante pendant la sèche : envisage de réduire le déficit ou de faire quelques jours à la maintenance.</p>' : ''}`);
  o += card(`<h3>Calibration de la maintenance</h3>
    <p class="small">L'app compare tes apports réels et l'évolution de ton poids (tendance, pas les pesées isolées) pour corriger progressivement son estimation. Facteur actuel : <b>×${(S.calib.factor || 1).toFixed(3)}</b>${S.calib.updatedAt ? ' (mis à jour le ' + fdate(S.calib.updatedAt) + ')' : ''}.</p>
    ${cal.ok ? `<div class="kpis">${kpi('Apport moyen', f0(cal.intake))}${kpi('Variation poids', f1(cal.rate.perWeek) + ' kg/sem')}${kpi('Dépense observée', f0(cal.observed), '', 'est-k')}${kpi('Modèle', f0(cal.model))}</div>
      <p class="small">Écart brut ×${cal.raw.toFixed(3)} → ajustement progressif proposé : <b>×${cal.proposed.toFixed(3)}</b> (30 % de l'écart, au plus une fois par semaine).</p>
      <button class="btn w100" data-a="applyCalib">Appliquer maintenant</button>`
      : `<p class="muted small">Pas encore assez de données sur 28 jours :</p><ul class="small">${cal.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>`}
    ${S.calib.factor !== 1 ? '<button class="btn ghost w100 mt-s" data-a="resetCalib">Réinitialiser la calibration</button>' : ''}
    ${(S.calib.history || []).length ? `<details class="mt-s"><summary class="small">Historique</summary>${S.calib.history.map(h => `<div class="hist-row small"><span>${fdate(h.date)}</span><b>×${h.factor.toFixed(3)}</b></div>`).join('')}</details>` : ''}`);
  o += card(`<h3>Scénarios de contrôle</h3><p class="muted small">Pour ton profil actuel (${S.profile.weight} kg, ${S.profile.height} cm, ${S.profile.age} ans), sans calibration :</p>
    <table class="tbl"><tr><th>Journée</th><th>Activité</th><th>Maintenance</th></tr>${C.energyScenarios().map(s => `<tr><td>${esc(s.label)}</td><td>+${f0(s.activity)}</td><td><b>${f0(s.model)}</b></td></tr>`).join('')}</table>
    <p class="muted small">Marche : ≈ ${C.WALK_NET} kcal/kg/km au-delà du repos, foulée ≈ ${f0(C.strideM(S.profile) * 100)} cm. Course : ≈ ${C.RUN_NET} kcal/kg/km. Musculation : MET 3,5–6 selon le RPE.</p>`);
  return o;
}

// ------------------------------ Mes aliments --------------------------
function myLibrary() {
  const favs = F.myFoods().filter(f => f.fav), freq = F.frequentFoods(15), mine = F.myFoods().filter(f => f.source === 'user');
  const item = f => `<button class="list-i" data-a="openFood" data-id="${f.id}"><div class="row between"><b>${esc(f.name)}</b><span>${f0(f.per100?.kcal)} kcal/100${f.unit === 'ml' ? 'ml' : 'g'}</span></div><small>${esc(f.brand || '')}${f.fav ? ' · ★' : ''}${f.useCount ? ' · ' + f.useCount + '×' : ''}${f.lastPortion ? ' · portion habituelle ' + f0(f.lastPortion) + (f.unit || 'g') : ''}</small></button>`;
  let o = `<div class="row gap"><button class="btn grow" data-a="nutriAdd">Rechercher</button><button class="btn ghost grow" data-a="nutriScan">Scanner</button><button class="btn ghost grow" data-a="newFood">Créer</button></div>`;
  o += card(`<h3>Repas récurrents</h3>${S.recipes.map(r => `<div class="list-i row between"><div data-a="openRecipe" data-id="${r.id}" class="grow"><b>${esc(r.name)}</b><small class="d-block">${r.items.length} aliments · ${f0(r.items.reduce((s, e) => s + C.entryNutr(e).kcal, 0))} kcal</small></div><button class="btn small" data-a="addRecipe" data-id="${r.id}">+</button></div>`).join('') || '<p class="muted small">Ajoute des aliments à un repas puis « Enregistrer ce repas comme repas récurrent », ou crée-en un ici.</p>'}
    <button class="btn ghost w100" data-a="newRecipe">+ Nouveau repas / recette perso</button>`);
  o += card(`<h3>Favoris</h3>${favs.map(item).join('') || '<p class="muted small">Touche ★ sur une fiche produit pour l’ajouter.</p>'}`);
  o += card(`<h3>Les plus consommés</h3>${freq.map(item).join('') || '<p class="muted small">Vide pour l’instant.</p>'}`);
  o += card(`<h3>Mes fiches produit</h3>${mine.map(item).join('') || '<p class="muted small">Produits créés à la main à partir de l’emballage.</p>'}`);
  return o;
}

// ------------------------------ Recettes halal -------------------------
function recipes() {
  const f = R.filters.rec || (R.filters.rec = { goal: '', kmax: '', pmin: '', cmax: '', fmax: '' });
  const list = F.RECIPES.map(r => Object.assign({ m: F.recipeMacros(r) }, r)).filter(r =>
    (!f.goal || r.goal.includes(f.goal)) && (!num(f.kmax) || r.m.kcal <= num(f.kmax)) && (!num(f.pmin) || r.m.p >= num(f.pmin)) && (!num(f.cmax) || r.m.c <= num(f.cmax)) && (!num(f.fmax) || r.m.f <= num(f.fmax)));
  let o = `<p class="muted small">Recettes simples, 100 % halal (viandes certifiées halal, sans porc ni alcool), ingrédients de supermarché, transportables, sans congélateur. Valeurs nutritionnelles estimées à partir de moyennes génériques.</p>
    <form class="card" id="recF"><div class="grid3">${field('Objectif', sel('goal', [['', 'Tous'], ['bulk', 'Masse'], ['maintain', 'Maintien'], ['cut', 'Sèche']], f.goal, 'data-ch="recFilter"'))}${field('kcal max', `<input type="number" name="kmax" value="${f.kmax}" data-ch="recFilter">`)}${field('Prot. min', `<input type="number" name="pmin" value="${f.pmin}" data-ch="recFilter">`)}
    ${field('Gluc. max', `<input type="number" name="cmax" value="${f.cmax}" data-ch="recFilter">`)}${field('Lip. max', `<input type="number" name="fmax" value="${f.fmax}" data-ch="recFilter">`)}</div></form>`;
  for (const r of list) o += card(`<div data-a="openHalal" data-id="${r.id}"><div class="row between"><h3>${esc(r.name)}</h3><small>${r.time} min</small></div>
    <div class="chips">${r.tags.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>
    <p class="small mt-s"><b>${f0(r.m.kcal)} kcal</b> · P ${f0(r.m.p)} g · G ${f0(r.m.c)} g · L ${f0(r.m.f)} g ${est()}</p></div>`);
  return o + (list.length ? '' : '<p class="muted">Aucune recette ne correspond aux filtres.</p>');
}

// ------------------------------ Recherche / ajout ---------------------
let addCtx = { meal: null, date: null };
function searchSheet(meal) {
  addCtx = { meal: meal || defaultMeal(), date: R.date };
  const quick = [...F.recentFoods(8)];
  const s = openSheet({
    title: 'Ajouter — ' + mealLabel(addCtx.meal), full: true, body: `
    <div class="row gap"><input class="search grow" id="fq" placeholder="Produit, marque ou code-barres…" autocomplete="off"><button class="btn" id="fscan" aria-label="Scanner">▦</button></div>
    <details class="mt-s"><summary class="small">Filtres (marque, enseigne, catégorie)</summary><div class="grid3 mt-s"><input id="fb" placeholder="Marque"><input id="fs" placeholder="Enseigne (Lidl…)"><input id="fc" placeholder="Catégorie"></div></details>
    <div id="fres" class="mt-s">${quick.length ? '<h4>Récents</h4>' + quick.map(foodItem).join('') : ''}${S.recipes.length ? '<h4>Repas récurrents</h4>' + S.recipes.map(r => `<button class="list-i" data-a="addRecipe" data-id="${r.id}"><b>${esc(r.name)}</b><small>${r.items.length} aliments</small></button>`).join('') : ''}</div>
    <div id="fonline"></div>
    <button class="btn ghost w100 mt" data-a="newFood">Produit introuvable ? Créer une fiche</button>`
  });
  const q = s.body.querySelector('#fq');
  const filters = () => ({ brand: s.body.querySelector('#fb').value.trim(), store: s.body.querySelector('#fs').value.trim(), category: s.body.querySelector('#fc').value.trim() });
  const run = async () => {
    const v = q.value.trim(); const res = s.body.querySelector('#fres'); const on = s.body.querySelector('#fonline');
    if (!v && !filters().brand && !filters().store) return;
    if (/^\d{8,14}$/.test(v)) { on.innerHTML = ''; res.innerHTML = '<p class="muted">Recherche du code-barres…</p>'; lookupBarcode(v, s); return; }
    const loc = await F.localSearch(v, filters());
    res.innerHTML = loc.length ? '<h4>Dans ta bibliothèque et la table CIQUAL</h4>' + loc.map(foodItem).join('') : '<p class="muted small">Rien en local.</p>';
    on.innerHTML = `<button class="btn ghost w100 mt-s" id="fgo">Chercher « ${esc(v)} » dans Open Food Facts (marques, supermarchés)</button>`;
    on.querySelector('#fgo').onclick = () => online(v, filters(), on, 1);
  };
  let tmr; q.oninput = () => { clearTimeout(tmr); tmr = setTimeout(run, 300); };
  q.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const v = q.value.trim(); if (v) online(v, filters(), s.body.querySelector('#fonline'), 1); } };
  s.body.querySelector('#fscan').onclick = () => scanSheet();
  setTimeout(() => q.focus(), 300);
}
async function online(q, f, host, page) {
  host.innerHTML = '<p class="muted">Recherche en ligne…</p>';
  try {
    const r = await F.offSearch(q, f, page);
    host.innerHTML = `<h4>Open Food Facts <small class="muted">${f0(r.count)} résultats</small></h4>` + (r.filteredOut ? '<p class="note small">Aucun résultat ne correspond à l’enseigne / catégorie indiquée sur cette page : résultats non filtrés affichés.</p>' : '') + (r.items.map(foodItem).join('') || '<p class="muted">Aucun produit.</p>') +
      (r.count > page * 30 ? `<button class="btn ghost w100" id="fmore">Plus de résultats</button>` : '');
    host._items = Object.assign(host._items || {}, Object.fromEntries(r.items.map(i => [i.id, i])));
    window._offCache = Object.assign(window._offCache || {}, host._items);
    const m = host.querySelector('#fmore'); if (m) m.onclick = () => online(q, f, host, page + 1);
  } catch (e) { host.innerHTML = `<p class="note warn">${esc(navigator.onLine ? e.message : 'Hors ligne : la recherche en ligne est indisponible. Ta bibliothèque et la table CIQUAL restent accessibles.')}</p>`; }
}
function foodItem(f) {
  window._offCache = window._offCache || {}; window._offCache[f.id] = f;
  const v = F.VERIF[f.verified] || ['', ''];
  return `<button class="list-i food" data-a="openFood" data-id="${esc(f.id)}">${f.image ? `<img src="${esc(f.image)}" alt="" loading="lazy">` : '<span class="ph"></span>'}<div class="grow"><div class="row between"><b>${esc(f.name)}</b><span>${f0(f.per100?.kcal)}</span></div>
    <small>${esc(f.brand || f.category || '')} · P ${f1(f.per100?.p)} · G ${f1(f.per100?.c)} · L ${f1(f.per100?.f)} /100${f.unit === 'ml' ? 'ml' : 'g'}${f.fav ? ' · ★' : ''}</small>${v[1] === 'bad' || v[1] === 'warn' ? `<small class="c-${v[1] === 'bad' ? 'red' : 'yellow'} d-block">${esc(v[0])}</small>` : ''}</div></button>`;
}
function findFood(id) { return S.foods.find(f => f.id === id) || (window._offCache || {})[id]; }

async function lookupBarcode(code, parentSheet) {
  const mine = S.foods.find(f => f.barcode === code && !f.deleted);
  if (mine) { foodSheet(mine); return; }
  try {
    const p = await F.offByBarcode(code);
    if (p) { foodSheet(p); return; }
    toast('Produit inconnu : crée sa fiche à partir de l’emballage');
    foodForm({ barcode: code });
  } catch (e) { toast(navigator.onLine ? e.message : 'Hors ligne : impossible de chercher ce code-barres'); foodForm({ barcode: code }); }
}

function scanSheet() {
  const s = openSheet({ title: 'Scanner un code-barres', body: `<div id="scanbox" class="scanbox"></div><p class="muted small center">Vise le code-barres (EAN-13). Autorise l'accès à l'appareil photo.</p>
    <div class="row gap"><input id="manualCode" inputmode="numeric" class="grow" placeholder="ou saisis le code"><button class="btn" id="mc">OK</button></div>`, onClose: () => F.stopScanner() });
  s.body.querySelector('#mc').onclick = () => { const v = s.body.querySelector('#manualCode').value.trim(); if (v) { s.close(); lookupBarcode(v); } };
  F.startScanner('scanbox', code => { s.close(); toast('Code ' + code); lookupBarcode(code); }).catch(e => { s.body.querySelector('#scanbox').innerHTML = `<p class="note warn">Caméra indisponible : ${esc(e.message || e)}. Saisis le code à la main.</p>`; });
}

function nutrRows(per, factor, unit) {
  const L = [['kcal', 'Énergie', 'kcal'], ['p', 'Protéines', 'g'], ['c', 'Glucides', 'g'], ['sugar', '  dont sucres', 'g'], ['f', 'Lipides', 'g'], ['sat', '  dont saturés', 'g'], ['fiber', 'Fibres', 'g'], ['salt', 'Sel', 'g']];
  return `<table class="tbl nutr"><tr><th></th><th>100 ${unit}</th><th>Portion</th></tr>${L.map(([k, l, u]) => `<tr><td>${l}</td><td>${per[k] == null ? '—' : f1(per[k]) + ' ' + u}</td><td>${per[k] == null ? '—' : '<b>' + f1(per[k] * factor) + '</b>'}</td></tr>`).join('')}</table>`;
}

function foodSheet(food, entry) {
  const unit = food.unit || 'g';
  const portions = food.portions || [];
  const initQty = entry ? entry.qty : (food.lastPortion || portions[0]?.g || 100);
  const initUnit = entry ? (entry.qtyUnit || unit) : unit;
  const v = F.VERIF[food.verified] || ['', ''];
  const s = openSheet({
    title: entry ? 'Modifier' : food.name, full: true, body: `
    <div class="row gap">${food.image ? `<img class="pimg" src="${esc(food.image)}" alt="">` : ''}<div class="grow"><h3>${esc(food.name)}</h3><small class="muted">${esc(food.brand || '')}${food.quantity ? ' · ' + esc(food.quantity) : ''}${food.barcode ? ' · EAN ' + esc(food.barcode) : ''}</small>
    <div class="mt-s">${badge(v[0], v[1])}</div><small class="muted d-block">${esc(food.sourceLabel || '')}${food.lastChecked ? ' · fiche modifiée le ' + fdate(food.lastChecked) : ''}</small></div></div>
    <form class="mt"><div class="grid3">${field('Quantité', `<input type="number" step="any" inputmode="decimal" name="qty" value="${initQty}">`)}
    ${field('Unité', sel('qu', [[unit, unit], ...portions.map((p, i) => ['p' + i, p.label])].concat([['portion', 'portion(s) perso']]), initUnit === 'portion' && entry?.portionIdx != null ? 'p' + entry.portionIdx : initUnit))}
    ${field('Repas', sel('meal', MEALS, entry?.meal || addCtx.meal || defaultMeal()))}</div>
    <div id="pn"></div>
    <button type="button" class="btn w100 big" data-add>${entry ? 'Enregistrer' : 'Ajouter au journal'}</button>
    <div class="row gap mt-s"><button type="button" class="btn ghost grow" data-fav>${S.foods.find(f => f.id === food.id)?.fav ? '★ Favori' : '☆ Favori'}</button><button type="button" class="btn ghost grow" data-edit>Corriger la fiche</button></div>
    ${entry ? '<button type="button" class="btn ghost danger w100 mt-s" data-del>Retirer du journal</button>' : ''}
    ${food.ingredients ? `<details class="mt"><summary class="small">Ingrédients</summary><p class="small">${esc(food.ingredients)}</p></details>` : ''}
    ${food.allergens ? `<p class="small"><b>Allergènes :</b> ${esc(food.allergens)}</p>` : ''}
    ${food.verified === 'partial' || food.verified === 'incomplete' ? '<p class="note small">Base collaborative : compare avec l’emballage. « Corriger la fiche » crée ta version vérifiée, prioritaire ensuite.</p>' : ''}</form>`
  });
  const grams = () => {
    const f = formData(s.body); const q = num(f.qty) || 0;
    if (f.qu.startsWith('p') && f.qu !== 'portion') return q * portions[+f.qu.slice(1)].g;
    if (f.qu === 'portion') return q * (portions[0]?.g || 100);
    return q;
  };
  const upd = () => { s.body.querySelector('#pn').innerHTML = `<p class="small">= <b>${f0(grams())} ${unit}</b></p>` + nutrRows(food.per100 || {}, grams() / 100, unit); };
  s.body.addEventListener('input', upd); s.body.addEventListener('change', upd); upd();
  s.body.querySelector('[data-add]').onclick = async () => {
    const f = formData(s.body); const g = grams(); if (!g) return;
    const saved = await F.touchFood(food, g);
    const e = Object.assign(entry || { id: uid('log_'), date: addCtx.date || R.date, createdAt: Date.now() }, {
      meal: f.meal, foodId: saved.id, name: saved.name, brand: saved.brand, unit, grams: g, qty: num(f.qty), qtyUnit: f.qu.startsWith('p') && f.qu !== 'portion' ? 'portion' : f.qu, portionIdx: f.qu.startsWith('p') && f.qu !== 'portion' ? +f.qu.slice(1) : null,
      per100: Object.assign({}, saved.per100), source: saved.source
    });
    await put('foodLog', e); s.close(); const ts = topSheet(); if (ts && !entry) ts.close();
    toast(`${saved.name} : ${f0(C.entryNutr(e).kcal)} kcal ajoutées`); rerender();
  };
  s.body.querySelector('[data-fav]').onclick = async () => { const saved = await F.saveFood(food); saved.fav = !saved.fav; await put('foods', saved); s.body.querySelector('[data-fav]').textContent = saved.fav ? '★ Favori' : '☆ Favori'; };
  s.body.querySelector('[data-edit]').onclick = () => { s.close(); foodForm(Object.assign({}, food, { id: food.source === 'user' ? food.id : undefined, source: 'user' })); };
  const d = s.body.querySelector('[data-del]'); if (d) d.onclick = async () => { await del('foodLog', entry.id); s.close(); rerender(); };
}

function foodForm(food = {}) {
  const p = food.per100 || {};
  const nf = (k, l) => field(l, `<input type="number" step="any" inputmode="decimal" name="${k}" value="${p[k] ?? ''}">`);
  const s = openSheet({
    title: food.id ? 'Modifier la fiche' : 'Nouveau produit', full: true, body: `<form>
    ${field('Nom du produit', inp('name', food.name || '', 'required'))}<div class="grid2">${field('Marque', inp('brand', food.brand || ''))}${field('Code-barres', inp('barcode', food.barcode || '', 'inputmode="numeric"'))}
    ${field('Unité', sel('unit', [['g', 'g (solide)'], ['ml', 'ml (liquide)']], food.unit || 'g'))}${field('Enseigne', inp('stores', food.stores || ''))}</div>
    <h4>Valeurs pour 100 g / 100 ml (emballage)</h4><div class="grid2">${nf('kcal', 'Énergie (kcal)')}${nf('p', 'Protéines')}${nf('c', 'Glucides')}${nf('sugar', 'dont sucres')}${nf('f', 'Lipides')}${nf('sat', 'dont saturés')}${nf('fiber', 'Fibres')}${nf('salt', 'Sel')}</div>
    <div class="grid2">${field('Portion habituelle (libellé)', inp('plabel', food.portions?.[0]?.label || '', 'placeholder="1 pot"'))}${field('Portion (g ou ml)', `<input type="number" name="pg" value="${food.portions?.[0]?.g ?? ''}">`)}</div>
    ${field('Ingrédients', `<textarea name="ingredients" rows="2">${esc(food.ingredients || '')}</textarea>`)}${field('Allergènes', inp('allergens', food.allergens || ''))}
    <button type="button" class="btn w100" data-ok>Enregistrer la fiche</button></form>`
  });
  s.body.querySelector('[data-ok]').onclick = async () => {
    const f = formData(s.body); if (!f.name || num(f.kcal) == null) { toast('Nom et calories requis'); return; }
    const per100 = {}; for (const k of ['kcal', 'p', 'c', 'sugar', 'f', 'sat', 'fiber', 'salt']) per100[k] = num(f[k]);
    const out = Object.assign({}, food, {
      id: food.id || (f.barcode && S.foods.find(x => x.barcode === f.barcode)?.id) || uid('food_'), name: f.name, brand: f.brand, barcode: f.barcode || null, unit: f.unit, stores: f.stores, per100,
      portions: num(f.pg) ? [{ label: f.plabel || 'Portion', g: num(f.pg) }] : [], ingredients: f.ingredients, allergens: f.allergens,
      source: 'user', sourceLabel: 'Fiche personnelle (saisie depuis l’emballage)', verified: 'user', lastChecked: todayStr(), basedOn: food.source !== 'user' ? food.id : undefined
    });
    // une fiche perso avec le même code-barres remplace la version Open Food Facts
    if (out.barcode) for (const o of S.foods.filter(x => x.barcode === out.barcode && x.id !== out.id)) { o.deleted = true; await put('foods', o); }
    delete out._n; await put('foods', out); s.close(); toast('Fiche enregistrée'); foodSheet(out);
  };
}

function recipeSheet(r) {
  const s = openSheet({
    title: r.name || 'Repas récurrent', full: true, body: `<form>${field('Nom', inp('name', r.name || ''))}
    ${r.items.map((e, i) => `<div class="hist-row"><span>${esc(e.name)}</span><input type="number" class="w80" name="g_${i}" value="${f0(e.grams)}"> ${esc(e.unit || 'g')}<button type="button" class="icon-btn" data-rm="${i}">✕</button></div>`).join('') || '<p class="muted">Aucun aliment.</p>'}
    <p class="small">Total : <b>${f0(r.items.reduce((s2, e) => s2 + C.entryNutr(e).kcal, 0))} kcal</b> · P ${f0(r.items.reduce((s2, e) => s2 + C.entryNutr(e).p, 0))} g</p>
    <button type="button" class="btn w100" data-ok>Enregistrer</button><button type="button" class="btn ghost w100 mt-s" data-add>Ajouter ce repas au journal</button>
    ${S.recipes.some(x => x.id === r.id) ? '<button type="button" class="btn ghost danger w100 mt-s" data-del>Supprimer</button>' : ''}</form>`
  });
  const read = () => { const f = formData(s.body); r.name = f.name || r.name || 'Repas'; r.items.forEach((e, i) => { const g = num(f['g_' + i]); if (g) { e.grams = g; e.qty = g; e.qtyUnit = e.unit; } }); };
  s.body.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { read(); r.items.splice(+b.dataset.rm, 1); s.close(); recipeSheet(r); });
  s.body.querySelector('[data-ok]').onclick = async () => { read(); await put('recipes', r); s.close(); toast('Repas enregistré'); rerender(); };
  s.body.querySelector('[data-add]').onclick = async () => { read(); await addRecipeToLog(r); s.close(); };
  const d = s.body.querySelector('[data-del]'); if (d) d.onclick = async () => { if (await confirmDlg('Supprimer ce repas récurrent ?', { danger: true, ok: 'Supprimer' })) { await del('recipes', r.id); s.close(); rerender(); } };
}
async function addRecipeToLog(r, meal) {
  const m = meal || addCtx.meal || defaultMeal(); const date = addCtx.date || R.date;
  for (const e of r.items) await put('foodLog', Object.assign({}, e, { id: uid('log_'), date, meal: m, recipeId: r.id, createdAt: Date.now() }));
  toast(`${r.name} ajouté (${mealLabel(m)})`); rerender();
}

actions({
  nDay(el) { R.date = addDays(R.date, +el.dataset.d); if (R.date > todayStr()) R.date = todayStr(); rerender(); },
  nutriAdd(el) { searchSheet(el?.dataset?.meal); },
  nutriScan() { addCtx = { meal: defaultMeal(), date: R.date }; scanSheet(); },
  openFood(el) { const f = findFood(el.dataset.id); if (f) foodSheet(f); },
  editEntry(el) { const e = S.foodLog.find(x => x.id === el.dataset.id); const f = S.foods.find(x => x.id === e.foodId) || { id: e.foodId, name: e.name, brand: e.brand, unit: e.unit, per100: e.per100, source: e.source }; addCtx = { meal: e.meal, date: e.date }; foodSheet(f, e); },
  newFood() { foodForm({}); },
  async water(el) { const d = S.days[R.date] || {}; await patchDay(R.date, { water: Math.max(0, (d.water || 0) + +el.dataset.v) }); rerender(); },
  async logComplete(el) { await patchDay(R.date, { logComplete: el.checked || undefined }); },
  saveMealRecipe(el) { const items = S.foodLog.filter(e => e.date === R.date && e.meal === el.dataset.meal).map(e => ({ foodId: e.foodId, name: e.name, brand: e.brand, unit: e.unit, grams: e.grams, qty: e.qty, qtyUnit: e.qtyUnit, per100: e.per100, source: e.source })); recipeSheet({ id: uid('rec_'), name: mealLabel(el.dataset.meal) + ' habituel', items }); },
  newRecipe() { recipeSheet({ id: uid('rec_'), name: '', items: [] }); },
  openRecipe(el) { recipeSheet(JSON.parse(JSON.stringify(S.recipes.find(r => r.id === el.dataset.id)))); },
  async addRecipe(el) { const r = S.recipes.find(x => x.id === el.dataset.id); const ts = topSheet(); await addRecipeToLog(r); if (ts) ts.close(); },
  setGoal(el) { S.profile.goal = el.dataset.v; saveProfile(); rerender(); },
  async saveGoal() {
    const f = formData(document.getElementById('goalForm')); const p = S.profile;
    if (f.surplus !== undefined) p.surplus = num(f.surplus) ?? p.surplus; if (f.deficit !== undefined) p.deficit = num(f.deficit) ?? p.deficit;
    p.targetBasis = f.targetBasis; p.kcalOverride = num(f.kcalOverride); p.macroOverride = { p: num(f.mp), f: num(f.mf), c: num(f.mc) };
    await saveProfile(); toast('Objectifs enregistrés'); rerender();
  },
  async applyCalib() { const c = C.computeCalibration(); if (!c.ok) return; const h = (S.calib.history || []).concat([{ date: todayStr(), factor: c.proposed, raw: c.raw }]); await kvSet('calib', { factor: c.proposed, updatedAt: todayStr(), history: h.slice(-30) }); toast('Calibration appliquée'); rerender(); },
  async resetCalib() { if (await confirmDlg('Revenir au modèle théorique (facteur ×1) ?')) { await kvSet('calib', { factor: 1, updatedAt: todayStr(), history: S.calib.history || [] }); rerender(); } },
  recFilter() { const f = formData(document.getElementById('recF')); R.filters.rec = f; rerender(); },
  openHalal(el) {
    const r = F.RECIPES.find(x => x.id === el.dataset.id); const m = F.recipeMacros(r);
    const s = openSheet({
      title: r.name, full: true, body: `<div class="chips">${r.tags.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div><p class="small mt-s">${r.time} min · conservation : ${esc(r.keeps)} · halal</p>
      <div class="kpis">${kpi('Calories', f0(m.kcal), 'estimées', 'est-k')}${kpi('Protéines', f0(m.p) + ' g')}${kpi('Glucides', f0(m.c) + ' g')}${kpi('Lipides', f0(m.f) + ' g')}</div>
      <h4>Ingrédients (1 portion)</h4>${r.items.map(([n, g]) => `<div class="hist-row"><span>${esc(n)}</span><b>${g} g</b></div>`).join('')}
      <h4>Préparation</h4><ol class="small">${r.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
      <p class="muted small">Valeurs calculées avec des moyennes génériques (cru). Pour plus de précision, ajoute tes produits réels au journal.</p>
      <div class="row gap">${sel('meal', MEALS, defaultMeal(), 'id="hm" class="grow"')}<button class="btn grow" data-add>Ajouter au journal</button></div>`
    });
    s.body.querySelector('[data-add]').onclick = async () => {
      const meal = s.body.querySelector('#hm').value; addCtx = { meal, date: R.date };
      await addRecipeToLog({ id: r.id, name: r.name, items: r.items.map(([n, g]) => { const f = F.ingFood(n); return { foodId: f.id, name: n, brand: '', unit: 'g', grams: g, qty: g, qtyUnit: 'g', per100: f.per100, source: 'generic' }; }) }, meal);
      s.close();
    };
  }
});
