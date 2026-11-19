// =====================================================================
// ui.js — panneaux coulissants, confirmations, toasts, délégation d'événements
// =====================================================================
import { esc } from './core.js';

export const ACTIONS = {};
/** Enregistre des actions déclenchées par data-a="nom" (clic) ou data-ch="nom" (changement). */
export function actions(map) { Object.assign(ACTIONS, map); }

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.a];
  if (fn) { ev.preventDefault(); fn(el, ev); }
});
document.addEventListener('change', ev => {
  const el = ev.target.closest('[data-ch]');
  if (el && ACTIONS[el.dataset.ch]) ACTIONS[el.dataset.ch](el, ev);
});
document.addEventListener('input', ev => {
  const el = ev.target.closest('[data-in]');
  if (el && ACTIONS[el.dataset.in]) ACTIONS[el.dataset.in](el, ev);
});

// ------------------------------ Panneaux ------------------------------
const stack = [];
export function openSheet({ title = '', body = '', onMount, onClose, full = false, cls = '' }) {
  const root = document.getElementById('sheets');
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-bg"></div><section class="sheet ${full ? 'full' : ''} ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header class="sheet-h"><span class="grab"></span><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Fermer">✕</button></header>
    <div class="sheet-b"></div></section>`;
  root.appendChild(wrap);
  const b = wrap.querySelector('.sheet-b');
  if (typeof body === 'string') b.innerHTML = body; else b.appendChild(body);
  const api = {
    el: wrap, body: b,
    set(html) { b.innerHTML = html; },
    close() {
      const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1);
      wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 260);
      document.body.classList.toggle('sheet-open', stack.length > 0);
      onClose && onClose();
    }
  };
  wrap.querySelector('.sheet-bg').onclick = () => api.close();
  wrap.querySelector('[data-close]').onclick = () => api.close();
  // glisser vers le bas pour fermer
  const h = wrap.querySelector('.sheet-h'); let y0 = null; const sh = wrap.querySelector('.sheet');
  h.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true });
  h.addEventListener('touchmove', e => { if (y0 === null) return; const dy = e.touches[0].clientY - y0; if (dy > 0) sh.style.transform = `translateY(${dy}px)`; }, { passive: true });
  h.addEventListener('touchend', e => { const dy = (e.changedTouches[0].clientY - (y0 ?? 0)); sh.style.transform = ''; y0 = null; if (dy > 90) api.close(); });
  stack.push(api);
  document.body.classList.add('sheet-open');
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  onMount && onMount(api);
  return api;
}
export function closeTopSheet() { stack.length && stack[stack.length - 1].close(); }
export function closeAllSheets() { while (stack.length) stack[stack.length - 1].close(); }
export function topSheet() { return stack[stack.length - 1]; }

export function confirmDlg(message, { ok = 'Confirmer', danger = false, detail = '' } = {}) {
  return new Promise(res => {
    let done = false;
    const s = openSheet({
      title: 'Confirmation',
      body: `<p class="lead">${esc(message)}</p>${detail ? `<p class="muted small">${esc(detail)}</p>` : ''}
        <div class="row gap mt"><button class="btn ghost grow" data-x="no">Annuler</button><button class="btn grow ${danger ? 'danger' : ''}" data-x="yes">${esc(ok)}</button></div>`,
      onClose: () => { if (!done) res(false); }
    });
    s.body.querySelector('[data-x=no]').onclick = () => { done = true; res(false); s.close(); };
    s.body.querySelector('[data-x=yes]').onclick = () => { done = true; res(true); s.close(); };
  });
}

export function toast(msg, ms = 2600) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.getElementById('toasts').appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

// ------------------------------ Helpers HTML --------------------------
export const card = (inner, cls = '') => `<section class="card ${cls}">${inner}</section>`;
export const kpi = (label, value, sub = '', cls = '') => `<div class="kpi ${cls}"><small>${esc(label)}</small><b>${value}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;
export const badge = (t, cls = '') => `<span class="badge ${cls}">${esc(t)}</span>`;
export const est = (t = 'estimation') => `<span class="est" title="Valeur estimée, pas une mesure">≈ ${esc(t)}</span>`;
export function seg(name, options, value, act = 'seg') {
  return `<div class="seg" role="tablist">${options.map(([v, l]) => `<button role="tab" aria-selected="${v === value}" class="${v === value ? 'on' : ''}" data-a="${act}" data-k="${name}" data-v="${v}">${esc(l)}</button>`).join('')}</div>`;
}
export function field(label, input, hint = '') { return `<label class="field"><span>${esc(label)}</span>${input}${hint ? `<small>${hint}</small>` : ''}</label>`; }
export const inp = (name, value = '', attrs = '') => `<input name="${name}" value="${esc(value ?? '')}" ${attrs}>`;
export function sel(name, options, value, attrs = '') { return `<select name="${name}" ${attrs}>${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`; }
export function formData(root) {
  const o = {};
  root.querySelectorAll('input[name],select[name],textarea[name]').forEach(el => {
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else o[el.name] = el.value;
  });
  return o;
}
export function scale(name, value, max = 10, labels = ['', '']) {
  let h = `<div class="scale" data-name="${name}">`;
  for (let i = 1; i <= max; i++) h += `<button type="button" class="${+value === i ? 'on' : ''}" data-a="scale" data-v="${i}">${i}</button>`;
  return h + `<input type="hidden" name="${name}" value="${value ?? ''}"></div>${labels[0] ? `<div class="scale-l"><small>${esc(labels[0])}</small><small>${esc(labels[1])}</small></div>` : ''}`;
}
actions({
  scale(el) {
    const w = el.closest('.scale'); w.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
    const i = w.querySelector('input'); i.value = i.value === el.dataset.v ? '' : el.dataset.v; if (!i.value) el.classList.remove('on');
  }
});

export function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } }
let actx = null;
export function beep(n = 2) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < n; i++) {
      const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
      const t = actx.currentTime + i * 0.25; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.start(t); o.stop(t + 0.2);
    }
  } catch (e) { }
}
export function unlockAudio() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (e) { } }
