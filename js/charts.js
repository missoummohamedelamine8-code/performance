// =====================================================================
// charts.js — graphiques SVG légers (ligne, barres, calendrier, anneau)
// Interactifs au toucher : un appui affiche la valeur du point le plus proche.
// =====================================================================
import { esc, f0, f1, fdate, parseD } from './core.js';

let cid = 0;
const W = 340;

function ticks(min, max, n = 4) {
  if (min === max) { min -= 1; max += 1; }
  const step0 = (max - min) / n; const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0) || step0;
  const a = Math.floor(min / step) * step, b = Math.ceil(max / step) * step;
  const out = []; for (let v = a; v <= b + step / 2; v += step) out.push(+v.toFixed(6));
  return out;
}

/**
 * series: [{ name, color, points:[{date|x, v}], dashed, dots }]
 * opts: { h, unit, fmt, xType:'date'|'num', band:{lo,hi}, goal }
 */
export function lineChart(series, opts = {}) {
  const id = 'ch' + (++cid);
  const H = opts.h || 170, pl = 38, pr = 10, pt = 12, pb = 24;
  const pts = series.flatMap(s => s.points);
  if (pts.length < 1) return `<div class="empty-chart">Pas encore assez de données</div>`;
  const X = p => p.x ?? parseD(p.date).getTime();
  const xs = pts.map(X), vs = pts.map(p => p.v).concat(opts.goal ? [opts.goal] : []);
  let x0 = Math.min(...xs), x1 = Math.max(...xs); if (x0 === x1) { x0 -= 86400000; x1 += 86400000; }
  const t = ticks(Math.min(...vs), Math.max(...vs));
  const y0 = t[0], y1 = t[t.length - 1];
  const sx = x => pl + (x - x0) / (x1 - x0) * (W - pl - pr);
  const sy = v => pt + (1 - (v - y0) / (y1 - y0 || 1)) * (H - pt - pb);
  const fmt = opts.fmt || (v => f1(v));
  let g = '';
  for (const v of t) g += `<line x1="${pl}" x2="${W - pr}" y1="${sy(v)}" y2="${sy(v)}" class="grid"/><text x="${pl - 5}" y="${sy(v) + 3}" class="ax" text-anchor="end">${esc(fmt(v))}</text>`;
  if (opts.goal) g += `<line x1="${pl}" x2="${W - pr}" y1="${sy(opts.goal)}" y2="${sy(opts.goal)}" class="goal"/>`;
  // étiquettes d'axe X : début / milieu / fin
  if (!opts.xType || opts.xType === 'date') {
    for (const fr of [0, 0.5, 1]) { const x = x0 + (x1 - x0) * fr; const d = new Date(x); g += `<text x="${sx(x)}" y="${H - 6}" class="ax" text-anchor="${fr === 0 ? 'start' : fr === 1 ? 'end' : 'middle'}">${d.getDate()}/${d.getMonth() + 1}${fr === 1 || fr === 0 ? '/' + String(d.getFullYear()).slice(2) : ''}</text>`; }
  }
  const data = [];
  series.forEach((s, si) => {
    const P = [...s.points].sort((a, b) => X(a) - X(b));
    if (!P.length) return;
    const d = P.map((p, i) => `${i ? 'L' : 'M'}${sx(X(p)).toFixed(1)},${sy(p.v).toFixed(1)}`).join('');
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" ${s.dashed ? 'stroke-dasharray="4 4"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
    if (s.dots !== false && P.length < 60) for (const p of P) g += `<circle cx="${sx(X(p))}" cy="${sy(p.v)}" r="${p.hollow ? 3 : 2.6}" fill="${p.hollow ? 'var(--card)' : s.color}" stroke="${s.color}" stroke-width="1.5"/>`;
    for (const p of P) data.push({ x: sx(X(p)), y: sy(p.v), label: `${s.name ? s.name + ' · ' : ''}${p.date ? fdate(p.date) + ' · ' : ''}${fmt(p.v)}${opts.unit ? ' ' + opts.unit : ''}${p.note ? ' · ' + p.note : ''}` });
  });
  const legend = series.length > 1 ? `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  setTimeout(() => bindTip(id, data), 0);
  return `<div class="chart" id="${id}"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">${g}<line class="cursor" x1="0" x2="0" y1="${pt}" y2="${H - pb}" style="display:none"/></svg><div class="tip" hidden></div></div>${legend}`;
}

export function barChart(points, opts = {}) {
  const id = 'ch' + (++cid);
  const H = opts.h || 150, pl = 38, pr = 8, pt = 10, pb = 22;
  if (!points.length || points.every(p => !p.v)) return `<div class="empty-chart">Pas encore de données sur la période</div>`;
  const t = ticks(0, Math.max(...points.map(p => p.v), opts.goal || 0));
  const y1 = t[t.length - 1];
  const bw = (W - pl - pr) / points.length;
  const sy = v => pt + (1 - v / (y1 || 1)) * (H - pt - pb);
  const fmt = opts.fmt || f0;
  let g = '';
  for (const v of t) g += `<line x1="${pl}" x2="${W - pr}" y1="${sy(v)}" y2="${sy(v)}" class="grid"/><text x="${pl - 5}" y="${sy(v) + 3}" class="ax" text-anchor="end">${esc(opts.axisFmt ? opts.axisFmt(v) : fmt(v))}</text>`;
  if (opts.goal) g += `<line x1="${pl}" x2="${W - pr}" y1="${sy(opts.goal)}" y2="${sy(opts.goal)}" class="goal"/>`;
  const data = [];
  points.forEach((p, i) => {
    const x = pl + i * bw + bw * 0.15, w = Math.max(1, bw * 0.7), y = sy(p.v || 0);
    const col = p.color || (opts.goal && p.v >= opts.goal ? opts.hitColor || opts.color : opts.color) || 'var(--accent)';
    g += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(H - pb - y).toFixed(1)}" rx="${Math.min(3, w / 3)}" fill="${col}" opacity="${p.est ? 0.45 : 1}"/>`;
    const lab = p.label ?? (p.date ? (() => { const d = parseD(p.date); return `${d.getDate()}/${d.getMonth() + 1}`; })() : '');
    if (points.length <= 14 || i % Math.ceil(points.length / 7) === 0) g += `<text x="${x + w / 2}" y="${H - 6}" class="ax" text-anchor="middle">${esc(lab)}</text>`;
    data.push({ x: x + w / 2, y, label: `${p.date ? fdate(p.date) + ' · ' : (p.label ? p.label + ' · ' : '')}${fmt(p.v || 0)}${opts.unit ? ' ' + opts.unit : ''}${p.note ? ' · ' + p.note : ''}` });
  });
  setTimeout(() => bindTip(id, data), 0);
  return `<div class="chart" id="${id}"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">${g}<line class="cursor" x1="0" x2="0" y1="${pt}" y2="${H - pb}" style="display:none"/></svg><div class="tip" hidden></div></div>`;
}

function bindTip(id, data) {
  const el = document.getElementById(id); if (!el || !data.length) return;
  const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), cur = el.querySelector('.cursor');
  const show = ev => {
    const r = svg.getBoundingClientRect(); const cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) / r.width * W;
    let best = data[0]; for (const d of data) if (Math.abs(d.x - cx) < Math.abs(best.x - cx)) best = d;
    tip.hidden = false; tip.textContent = best.label;
    const px = best.x / W * r.width; tip.style.left = Math.max(0, Math.min(r.width - tip.offsetWidth, px - tip.offsetWidth / 2)) + 'px';
    cur.setAttribute('x1', best.x); cur.setAttribute('x2', best.x); cur.style.display = '';
  };
  svg.addEventListener('pointerdown', show); svg.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'mouse') show(e); });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; cur.style.display = 'none'; });
}

/** Anneau de progression (pas, calories…). */
export function ring(pct, color, label, sub, size = 118) {
  const r = size / 2 - 9, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct || 0));
  return `<div class="ring" style="width:${size}px;height:${size}px">
  <svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg"/>
  <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>
  <div class="ring-txt"><b>${label}</b><small>${sub || ''}</small></div></div>`;
}

/** Calendrier mensuel coloré (ex. pas par jour). values: {date: v} */
export function calendar(year, month, values, goal, color = 'var(--violet)') {
  const first = new Date(year, month, 1); const days = new Date(year, month + 1, 0).getDate();
  const off = (first.getDay() + 6) % 7;
  let h = '<div class="cal">' + ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<span class="cal-h">${d}</span>`).join('');
  for (let i = 0; i < off; i++) h += '<span></span>';
  for (let d = 1; d <= days; d++) {
    const k = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const v = values[k]; const a = v ? Math.min(1, v / (goal * 1.3)) : 0;
    h += `<span class="cal-d${v >= goal ? ' hit' : ''}" style="${v ? `background:color-mix(in srgb, ${color} ${Math.round(15 + a * 75)}%, transparent)` : ''}" title="${v ? f0(v) + ' pas' : ''}"><b>${d}</b>${v ? `<small>${v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + 'k' : v}</small>` : ''}</span>`;
  }
  return h + '</div>';
}

export function bar(pct, color, cls = '') {
  const p = Math.max(0, Math.min(100, (pct || 0) * 100));
  return `<div class="pbar ${cls}"><i style="width:${p}%;background:${color}"></i></div>`;
}
