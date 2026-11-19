// =====================================================================
// app.js — démarrage, navigation, service worker
// =====================================================================
import { S, loadAll, requestPersist, kvSet, todayStr, fdate } from './core.js';
import * as C from './calc.js';
import { R, VIEWS, setRenderer, go } from './nav.js';
import { actions, toast, closeAllSheets } from './ui.js';
import './views-home.js';
import './views-train.js';
import './views-workout.js';
import './views-run.js';
import './views-activity.js';
import './views-nutrition.js';
import './views-progress.js';
import { autoSnapshot } from './views-profile.js';

const TABS = [
  ['home', 'Accueil', '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'],
  ['muscu', 'Muscu', '<path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12"/>'],
  ['course', 'Course', '<circle cx="14" cy="4.5" r="2"/><path d="M8 21l3-6 3 3v3M6 12l3-3 4 1 3 4 3 1M10 15l-2-3"/>'],
  ['act', 'Activité', '<path d="M3 12h4l3-8 4 16 3-8h4"/>'],
  ['nutri', 'Nutrition', '<path d="M7 3v8a3 3 0 0 0 3 3v7M7 3v5M10 3v5M17 3c-2 2-2 6 0 8v10"/>'],
  ['prog', 'Progrès', '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>']
];

function render() {
  const main = document.getElementById('main');
  const v = VIEWS[R.tab] || VIEWS.home;
  try { main.innerHTML = v(); }
  catch (e) { console.error(e); main.innerHTML = `<div class="card"><h3>Erreur d'affichage</h3><p class="small">${String(e.message)}</p></div>`; }
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.t === R.tab));
  document.getElementById('profileBtn').classList.toggle('on', R.tab === 'profil');
}
setRenderer(render);

function shell() {
  document.getElementById('nav').innerHTML = TABS.map(([t, l, ic]) => `<button data-a="tab" data-t="${t}" class="c-${t}" aria-label="${l}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ic}</svg><span>${l}</span></button>`).join('');
}

function fromHash() {
  const [, tab, sub] = (location.hash || '#/home').split('/');
  if (tab && (VIEWS[tab])) { R.tab = tab; if (sub) R.sub[tab] = sub; }
}

actions({
  tab(el) { closeAllSheets(); go(el.dataset.t); },
  profile() { closeAllSheets(); go(R.tab === 'profil' ? 'home' : 'profil'); }
});

async function maybeCalibrate() {
  const last = S.calib.updatedAt;
  if (last && (new Date(todayStr()) - new Date(last)) / 86400000 < 7) return;
  const c = C.computeCalibration();
  if (!c.ok || Math.abs(c.proposed - (S.calib.factor || 1)) < 0.005) return;
  const h = (S.calib.history || []).concat([{ date: todayStr(), factor: c.proposed, raw: c.raw, auto: true }]);
  await kvSet('calib', { factor: c.proposed, updatedAt: todayStr(), history: h.slice(-30) });
  toast(`Maintenance recalibrée sur tes données : ×${c.proposed.toFixed(3)}`, 4000);
}

async function init() {
  shell();
  try { await loadAll(); }
  catch (e) { document.getElementById('main').innerHTML = `<div class="card"><h3>Stockage indisponible</h3><p>${e.message}. En navigation privée, le stockage local peut être bloqué.</p></div>`; return; }
  await import('./views-profile.js');
  fromHash(); render();
  window.addEventListener('hashchange', () => { fromHash(); render(); });
  requestPersist();
  const last = S.settings.lastAutoSnapshot;
  if (!last || Date.now() - last > 86400000) autoSnapshot('quotidienne');
  maybeCalibrate();
  // re-rendu à minuit / au retour sur l'app (date du jour)
  let day = todayStr();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && todayStr() !== day) { day = todayStr(); R.date = day; render(); } });
}

// ------------------------------ Service worker ------------------------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw && nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          const b = document.createElement('button'); b.className = 'banner update'; b.textContent = 'Nouvelle version disponible — toucher pour mettre à jour (tes données sont conservées)';
          b.onclick = () => { nw.postMessage('skipWaiting'); };
          document.getElementById('main').prepend(b);
        }
      });
    });
  }).catch(e => console.warn('SW', e));
  let reloaded = false; const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
}

init();
