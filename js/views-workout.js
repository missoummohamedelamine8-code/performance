// =====================================================================
// views-workout.js — mode entraînement (salle)
// L'état est sauvegardé à chaque action : une fermeture accidentelle
// de l'app ne fait rien perdre.
// =====================================================================
import { S, kvSet, put, uid, esc, f1, todayStr, num, patchDay, pad } from './core.js';
import * as C from './calc.js';
import { rerender } from './nav.js';
import { actions, openSheet, confirmDlg, toast, field, inp, formData, scale, beep, vibrate, unlockAudio } from './ui.js';

const exById = id => S.exercises.find(e => e.id === id);
let tick = null;
const save = () => kvSet('activeWorkout', S.active);

export async function startWorkout(tpl) {
  unlockAudio();
  if (S.active) {
    if (!await confirmDlg(`Une séance est déjà en cours (${S.active.name}). La remplacer ?`, { ok: 'Remplacer', danger: true, detail: 'La séance en cours sera perdue si elle n’est pas terminée.' })) return resume();
  }
  const items = (tpl.exercises || []).map(x => planItem(x.exId, x.sets, x.ranges, x.rest, x.superset));
  S.active = { id: uid('ses_'), templateId: tpl.id, name: tpl.name, startedAt: Date.now(), date: todayStr(), items, idx: 0, view: S.settings.workoutView || 'focus', restEnd: null };
  await save();
  // bilan avant séance (facultatif)
  preCheck(() => open());
}
function planItem(exId, sets = 3, ranges = [], rest = null, superset = false) {
  const h = C.exerciseHistory(exId); const last = h[h.length - 1];
  const n = Math.max(1, sets || 3);
  return {
    exId, rest: rest || exById(exId)?.rest || S.profile.defaultRest, superset,
    ranges: Array.from({ length: n }, (_, i) => ranges?.[i] || ranges?.[0] || exById(exId)?.repRange || ''),
    sets: Array.from({ length: n }, (_, i) => {
      const p = last?.sets[i] || last?.sets[last.sets.length - 1];
      return { w: null, r: null, done: false, prevW: p ? C.setLoad(p) : null, prevR: p ? p.r : null };
    })
  };
}

function preCheck(next) {
  const d = S.days[todayStr()] || {};
  const s = openSheet({
    title: 'Bilan avant séance (facultatif)', body: `<form>
    <div class="grid2">${field('Durée de sommeil (h)', `<input type="number" step="0.25" inputmode="decimal" name="sleepH" value="${d.sleepH ?? ''}">`)}${field('Douleur éventuelle', inp('pain', d.pain || '', 'placeholder="ex. épaule droite"'))}</div>
    <label class="field"><span>Qualité du sommeil</span>${scale('sleepQ', d.sleepQ, 10, ['mauvaise', 'excellente'])}</label>
    <label class="field"><span>Fatigue générale</span>${scale('fatigue', d.fatigue, 10, ['en forme', 'épuisé'])}</label>
    <label class="field"><span>Courbatures</span>${scale('soreness', d.soreness, 10, ['aucune', 'fortes'])}</label>
    <label class="field"><span>Motivation</span>${scale('motivation', d.motivation, 10, ['nulle', 'maximale'])}</label>
    <label class="field"><span>Sensation de récupération</span>${scale('recovery', d.recovery, 10, ['pas récupéré', 'totalement'])}</label>
    <div class="row gap"><button type="button" class="btn ghost grow" data-skip>Passer</button><button type="button" class="btn grow" data-ok>Enregistrer et commencer</button></div></form>`,
    onClose: () => { }
  });
  s.body.querySelector('[data-skip]').onclick = () => { s.close(); next(); };
  s.body.querySelector('[data-ok]').onclick = async () => {
    const f = formData(s.body); const p = {};
    for (const k of ['sleepH', 'sleepQ', 'fatigue', 'soreness', 'motivation', 'recovery']) { const v = num(f[k]); if (v != null) p[k] = v; }
    if (f.pain) p.pain = f.pain;
    await patchDay(todayStr(), p); s.close(); next();
  };
}

export function resume() { if (S.active) open(); }
function open() {
  let el = document.getElementById('workout');
  el.hidden = false; document.body.classList.add('in-workout');
  draw();
  clearInterval(tick); tick = setInterval(updateClock, 500);
}
function close() {
  clearInterval(tick); const el = document.getElementById('workout'); el.hidden = true; el.innerHTML = '';
  document.body.classList.remove('in-workout'); rerender();
}

function lastPerfTxt(it) {
  const h = C.exerciseHistory(it.exId); const l = h[h.length - 1];
  if (!l) return 'Première fois sur cet exercice';
  return `Dernière fois (${l.date.split('-').reverse().slice(0, 2).join('/')}) : ` + l.sets.map(x => `${C.setLoad(x) != null ? f1(C.setLoad(x)) : '?'}×${x.r}`).join(' · ');
}

function setRow(it, i, si) {
  const s = it.sets[si];
  return `<div class="wset ${s.done ? 'done' : ''}" data-i="${i}" data-s="${si}">
    <span class="wset-n">${si + 1}</span><span class="wset-t">${esc(it.ranges[si] || '')}</span>
    <input type="number" inputmode="decimal" step="0.25" placeholder="${s.prevW ?? 'kg'}" value="${s.w ?? ''}" data-f="w" aria-label="Charge série ${si + 1}">
    <input type="number" inputmode="numeric" placeholder="${s.prevR ?? 'reps'}" value="${s.r ?? ''}" data-f="r" aria-label="Répétitions série ${si + 1}">
    <button class="wcheck" data-a="wDone" data-i="${i}" data-s="${si}" aria-label="Valider la série">${s.done ? '✓' : '○'}</button></div>`;
}

function exBlock(it, i, full) {
  const ex = exById(it.exId); const rec = C.recommend(it.exId, { range: C.parseRange(it.ranges[0]), sets: it.sets.length });
  return `<div class="wex ${full ? 'full' : ''}">
    <div class="row between"><div><small class="muted">${i + 1}/${S.active.items.length} · ${esc(ex?.group || '')}${it.superset ? ' · superset' : ''}</small><h2>${esc(ex?.name || 'Exercice')}</h2></div>
    <div class="row"><button class="icon-btn" data-a="wSwap" data-i="${i}" title="Remplacer (matériel indisponible)">⇄</button><button class="icon-btn" data-a="wRemoveEx" data-i="${i}" title="Retirer">✕</button></div></div>
    <p class="muted small">${esc(lastPerfTxt(it))}</p>
    ${full ? `<div class="rec ${rec.kind}">${esc(rec.text)}</div>` : ''}
    <div class="wset head"><span>#</span><span>Obj.</span><span>kg</span><span>reps</span><span></span></div>
    ${it.sets.map((_, si) => setRow(it, i, si)).join('')}
    <div class="row gap mt-s"><button class="btn ghost small grow" data-a="wAddSet" data-i="${i}">+ Série</button><button class="btn ghost small grow" data-a="wDelSet" data-i="${i}">− Série</button>
    <button class="btn ghost small grow" data-a="wRest" data-i="${i}">Repos ${it.rest}s</button></div></div>`;
}

function draw() {
  const A = S.active; const el = document.getElementById('workout');
  const done = A.items.reduce((n, it) => n + it.sets.filter(s => s.done).length, 0), total = A.items.reduce((n, it) => n + it.sets.length, 0);
  let body;
  if (!A.items.length) body = `<p class="muted center mt">Aucun exercice. Ajoute-en un pour commencer.</p>`;
  else if (A.view === 'focus') {
    A.idx = Math.min(A.idx, A.items.length - 1);
    body = exBlock(A.items[A.idx], A.idx, true) + `<div class="row gap mt"><button class="btn ghost big grow" data-a="wPrev" ${A.idx === 0 ? 'disabled' : ''}>← Précédent</button><button class="btn big grow" data-a="wNext" ${A.idx >= A.items.length - 1 ? 'disabled' : ''}>Suivant →</button></div>
      <div class="dots">${A.items.map((it, i) => `<button class="${i === A.idx ? 'on' : ''} ${it.sets.every(s => s.done) ? 'ok' : ''}" data-a="wGo" data-i="${i}" aria-label="Exercice ${i + 1}"></button>`).join('')}</div>`;
  } else body = A.items.map((it, i) => exBlock(it, i, false)).join('');
  el.innerHTML = `<header class="wh"><button class="icon-btn" data-a="wMin" aria-label="Réduire">⌄</button><div class="grow center"><b>${esc(A.name)}</b><small id="wClock" class="muted"></small></div>
    <button class="icon-btn" data-a="wView" aria-label="Changer de vue">${A.view === 'focus' ? '☰' : '▣'}</button></header>
    <div class="wprog"><i style="width:${total ? done / total * 100 : 0}%"></i></div>
    <main class="wb">${body}<button class="btn ghost w100 mt" data-a="wAddEx">+ Ajouter un exercice</button>
    <button class="btn w100 mt big" data-a="wFinish">Terminer la séance</button>
    <button class="btn ghost danger w100 mt-s" data-a="wCancel">Abandonner</button></main>
    <div id="restBar" class="restbar" ${A.restEnd ? '' : 'hidden'}><div><small>Repos</small><b id="restLeft">0:00</b></div>
    <button class="btn ghost small" data-a="wRestAdj" data-d="-15">−15</button><button class="btn ghost small" data-a="wRestAdj" data-d="15">+15</button><button class="btn small" data-a="wRestSkip">Passer</button></div>`;
  el.querySelectorAll('.wset input').forEach(inpEl => inpEl.addEventListener('input', () => {
    const row = inpEl.closest('.wset'); const s = A.items[+row.dataset.i].sets[+row.dataset.s];
    s[inpEl.dataset.f] = num(inpEl.value); save();
  }));
  updateClock();
}

function updateClock() {
  const A = S.active; if (!A) return;
  const c = document.getElementById('wClock'); if (c) { const m = Math.floor((Date.now() - A.startedAt) / 60000); c.textContent = `${m} min`; }
  const bar = document.getElementById('restBar'); if (!bar) return;
  if (A.restEnd) {
    const left = Math.round((A.restEnd - Date.now()) / 1000);
    bar.hidden = false; document.getElementById('restLeft').textContent = left >= 0 ? `${Math.floor(left / 60)}:${pad(left % 60)}` : `+${Math.floor(-left / 60)}:${pad(-left % 60)}`;
    bar.classList.toggle('over', left < 0);
    if (left <= 0 && !A.restAlerted) { A.restAlerted = true; beep(3); vibrate([200, 100, 200]); save(); }
  } else bar.hidden = true;
}

actions({
  resumeWorkout() { resume(); },
  wMin() { clearInterval(tick); document.getElementById('workout').hidden = true; document.body.classList.remove('in-workout'); rerender(); },
  wView() { S.active.view = S.active.view === 'focus' ? 'list' : 'focus'; S.settings.workoutView = S.active.view; save(); draw(); },
  wPrev() { S.active.idx = Math.max(0, S.active.idx - 1); save(); draw(); window.scrollTo(0, 0); },
  wNext() { S.active.idx = Math.min(S.active.items.length - 1, S.active.idx + 1); save(); draw(); window.scrollTo(0, 0); },
  wGo(el) { S.active.idx = +el.dataset.i; save(); draw(); },
  wDone(el) {
    const it = S.active.items[+el.dataset.i]; const s = it.sets[+el.dataset.s];
    if (!s.done) {
      if (s.w == null && s.prevW != null) s.w = s.prevW; // reprend la charge affichée si non modifiée
      if (s.r == null) { toast('Indique le nombre de répétitions'); return; }
      s.done = true; s.at = Date.now();
      S.active.restEnd = Date.now() + it.rest * 1000; S.active.restAlerted = false;
    } else s.done = false;
    save(); draw();
  },
  wRest(el) {
    const it = S.active.items[+el.dataset.i];
    const v = prompt('Temps de repos pour cet exercice (secondes)', it.rest);
    if (v && num(v)) { it.rest = num(v); save(); draw(); }
  },
  wRestAdj(el) { if (S.active.restEnd) { S.active.restEnd += +el.dataset.d * 1000; S.active.restAlerted = false; save(); updateClock(); } },
  wRestSkip() { S.active.restEnd = null; save(); updateClock(); },
  wAddSet(el) { const it = S.active.items[+el.dataset.i]; const l = it.sets[it.sets.length - 1]; it.sets.push({ w: null, r: null, done: false, prevW: l?.w ?? l?.prevW, prevR: l?.r ?? l?.prevR }); it.ranges.push(it.ranges[it.ranges.length - 1] || ''); save(); draw(); },
  wDelSet(el) { const it = S.active.items[+el.dataset.i]; if (it.sets.length > 1) { it.sets.pop(); it.ranges.pop(); save(); draw(); } },
  async wRemoveEx(el) { if (await confirmDlg('Retirer cet exercice de la séance en cours ?')) { S.active.items.splice(+el.dataset.i, 1); save(); draw(); } },
  async wAddEx() {
    const { pickExercise } = await import('./views-train.js');
    pickExercise(ex => { S.active.items.push(planItem(ex.id, 3, [ex.repRange || ''])); S.active.idx = S.active.items.length - 1; save(); draw(); });
  },
  async wSwap(el) {
    const { pickExercise } = await import('./views-train.js');
    const i = +el.dataset.i; const old = S.active.items[i];
    pickExercise(ex => { const n = planItem(ex.id, old.sets.length, old.ranges, old.rest); n.replacedFrom = old.exId; S.active.items[i] = n; save(); draw(); toast('Exercice remplacé pour cette séance'); }, 'Remplacer par…');
  },
  async wCancel() { if (await confirmDlg('Abandonner la séance ? Les séries saisies seront perdues.', { ok: 'Abandonner', danger: true })) { await kvSet('activeWorkout', null); close(); } },
  wFinish() {
    const A = S.active; const mins = Math.round((Date.now() - A.startedAt) / 60000);
    const nDone = A.items.reduce((n, it) => n + it.sets.filter(s => s.done || (s.r != null)).length, 0);
    const s = openSheet({
      title: 'Fin de séance', body: `<form><p>${nDone} série(s) saisie(s).</p>
      <label class="field"><span>Effort ressenti (RPE séance)</span>${scale('rpe', null, 10, ['très facile', 'maximal'])}</label>
      <label class="field"><span>Difficulté globale</span>${scale('difficulty', null, 10, ['facile', 'très dure'])}</label>
      <label class="field"><span>Fatigue après séance</span>${scale('fatigueAfter', null, 10, ['frais', 'vidé'])}</label>
      <div class="grid2">${field('Durée (min)', `<input type="number" name="durationMin" value="${mins}">`)}${field('Date', `<input type="date" name="date" value="${A.date}">`)}</div>
      ${field('Notes', '<textarea name="notes" rows="2"></textarea>')}
      <button type="button" class="btn w100 big" data-ok>Enregistrer la séance</button></form>`
    });
    s.body.querySelector('[data-ok]').onclick = async () => {
      const f = formData(s.body);
      const sets = [];
      A.items.forEach(it => it.sets.forEach((x, si) => { if (x.r != null && (x.done || x.w != null)) sets.push({ exId: it.exId, setIdx: si + 1, r: x.r, w: x.w, range: it.ranges[si] || null, replacedFrom: it.replacedFrom }); }));
      if (!sets.length && !await confirmDlg('Aucune série complète : enregistrer quand même ?')) return;
      const ses = { id: A.id, templateId: A.templateId, name: A.name, date: f.date || A.date, sets, rpe: num(f.rpe), difficulty: num(f.difficulty), fatigueAfter: num(f.fatigueAfter), durationMin: num(f.durationMin) || mins, notes: f.notes, source: 'app', status: 'done', createdAt: Date.now() };
      await put('sessions', ses);
      await kvSet('activeWorkout', null);
      s.close(); close(); toast('Séance enregistrée 💪');
    };
  }
});
