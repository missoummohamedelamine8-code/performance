// =====================================================================
// views-run.js — Course à pied : sorties, GPS, import, prédictions
// =====================================================================
import { S, put, del, uid, esc, f0, f1, f2, fdate, relDay, todayStr, addDays, mondayOf, rangeDays, sum, num, fdur, fpace, parseDur, kvSet } from './core.js';
import * as C from './calc.js';
import { R, VIEWS, rerender } from './nav.js';
import { actions, openSheet, toast, card, kpi, badge, seg, field, inp, sel, formData, scale, confirmDlg } from './ui.js';
import { lineChart, barChart } from './charts.js';
import { parseCSV } from './importer.js';

const TYPES = Object.entries(C.RUN_TYPES);
const p2 = n => String(n).padStart(2, '0');
function durIn(sec) { if (!sec) return ''; sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return h ? `${h}:${p2(m)}:${p2(s)}` : `${m}:${p2(s)}`; }

VIEWS.course = () => {
  const runs = S.runs; const t = todayStr();
  let o = `<h1 class="title">Course</h1><div class="row gap"><button class="btn grow" data-a="addRun">+ Saisir une sortie</button><button class="btn ghost grow" data-a="gpsRun">GPS en direct</button></div>`;
  if (!runs.length) return o + card(`<p class="muted">Aucune sortie pour l'instant. Saisis-la à la main, enregistre-la avec le GPS du téléphone, ou importe un fichier GPX/CSV.</p><label class="btn ghost w100">Importer GPX / CSV<input type="file" accept=".gpx,.csv" hidden data-ch="importRun"></label>`);
  const total = sum(runs.map(r => r.distKm));
  const weeks = []; const m = mondayOf(t);
  for (let i = 11; i >= 0; i--) { const s = addDays(m, -7 * i); weeks.push({ date: s, v: +sum(runs.filter(r => r.date >= s && r.date <= addDays(s, 6)).map(r => r.distKm)).toFixed(2) }); }
  const p5 = C.predictTime(5), p10 = C.predictTime(10);
  o += card(`<div class="kpis">${kpi('Distance cumulée', f1(total) + ' km', runs.length + ' sorties')}${kpi('Cette semaine', f1(weeks[11].v) + ' km')}
    ${kpi('5 km estimé', p5 ? fdur(p5.t) : '—', p5 ? 'Riegel, ' + fdate(p5.from.date) : 'données insuffisantes', 'est-k')}${kpi('10 km estimé', p10 ? fdur(p10.t) : '—', p10 ? (p10.extrapolation ? 'extrapolation fragile' : 'Riegel') : '', 'est-k')}</div>
    <p class="muted small">Estimations théoriques (formule de Riegel) à partir de ta meilleure sortie ≥ 2,5 km des 6 derniers mois. Une sortie d'endurance facile sous-estime ton potentiel réel.</p>`);
  o += card(`<h3>Distance par semaine</h3>${barChart(weeks, { color: 'var(--blue)', unit: 'km', fmt: f1 })}`);
  const paceSeries = TYPES.map(([k, l], i) => ({ name: l, color: ['var(--blue)', '#6fb6ff', '#ff7a59', '#9aa3ad'][i], points: runs.filter(r => r.type === k && r.distKm).map(r => ({ date: r.date, v: C.pace(r) / 60, note: f1(r.distKm) + ' km' })) })).filter(s => s.points.length);
  o += card(`<h3>Évolution de l'allure (min/km)</h3><p class="muted small">Séparée par type de séance : une sortie facile n'est pas comparée à un fractionné.</p>${lineChart(paceSeries, { fmt: v => fpace(v * 60) })}`);
  o += card(`<h3>Distance des sorties</h3>${lineChart([{ name: 'Distance', color: 'var(--blue)', points: runs.map(r => ({ date: r.date, v: r.distKm })) }], { unit: 'km' })}`);
  const hr = runs.filter(r => r.hrAvg);
  if (hr.length >= 2) o += card(`<h3>Fréquence cardiaque moyenne</h3>${lineChart([{ name: 'FC moy.', color: '#ff7a59', points: hr.map(r => ({ date: r.date, v: r.hrAvg, note: fpace(C.pace(r)) + '/km' })) }], { unit: 'bpm', fmt: f0 })}`);
  const groups = C.sameDistanceGroups();
  if (groups.length) o += card(`<h3>Comparaison sur distances identiques</h3>${groups.map(g => `<h4>${f1(g.dist)} km</h4>${g.runs.map(r => `<div class="hist-row"><span>${fdate(r.date)} · ${esc(C.RUN_TYPES[r.type] || '')}</span><b>${fdur(r.durSec)} · ${fpace(C.pace(r))}/km</b></div>`).join('')}`).join('')}`);
  o += `<h4 class="month">Historique</h4>` + [...runs].reverse().map(r => `<button class="list-i" data-a="editRun" data-id="${r.id}"><div class="row between"><b>${f2(r.distKm)} km · ${fdur(r.durSec)}</b><span>${fpace(C.pace(r))}/km</span></div>
    <small>${fdate(r.date, true)} · ${esc(C.RUN_TYPES[r.type] || '')}${r.hrAvg ? ' · FC ' + r.hrAvg : ''}${r.source === 'gps' ? ' · GPS' : ''}</small></button>`).join('');
  o += `<label class="btn ghost w100 mt">Importer GPX / CSV<input type="file" accept=".gpx,.csv" hidden data-ch="importRun"></label>`;
  return o;
};

function runForm(r) {
  const isNew = !S.runs.some(x => x.id === r.id);
  const s = openSheet({
    title: isNew ? 'Nouvelle sortie' : 'Sortie du ' + fdate(r.date), full: true, body: `<form>
    <div class="grid2">${field('Date', `<input type="date" name="date" value="${r.date}">`)}${field('Type', sel('type', TYPES, r.type || 'ef'))}
    ${field('Distance (km)', `<input type="number" step="0.01" inputmode="decimal" name="distKm" value="${r.distKm ?? ''}" required>`)}${field('Durée (h:mm:ss)', inp('dur', durIn(r.durSec), 'placeholder="32:15" inputmode="numeric"'))}
    ${field('FC moyenne', `<input type="number" name="hrAvg" value="${r.hrAvg ?? ''}">`)}${field('FC max', `<input type="number" name="hrMax" value="${r.hrMax ?? ''}">`)}
    ${field('Dénivelé + (m)', `<input type="number" name="elev" value="${r.elev ?? ''}">`)}${field('Cadence (pas/min)', `<input type="number" name="cadence" value="${r.cadence ?? ''}" placeholder="160">`, 'Sert à éviter le double comptage des pas')}</div>
    <div id="calc" class="note"></div>
    <label class="field"><span>Difficulté ressentie (RPE)</span>${scale('rpe', r.rpe, 10, ['très facile', 'maximale'])}</label>
    ${field('Sensations', `<textarea name="feel" rows="2">${esc(r.feel || '')}</textarea>`)}
    <button type="button" class="btn w100" data-ok>Enregistrer</button>${isNew ? '' : '<button type="button" class="btn ghost danger w100 mt-s" data-del>Supprimer</button>'}</form>`
  });
  const upd = () => { const f = formData(s.body); const d = num(f.distKm), t = parseDur(f.dur); s.body.querySelector('#calc').innerHTML = d && t ? `Allure <b>${fpace(t / d)}/km</b> · vitesse <b>${f1(d / (t / 3600))} km/h</b>` : 'L’allure et la vitesse se calculent automatiquement.'; };
  s.body.addEventListener('input', upd); upd();
  s.body.querySelector('[data-ok]').onclick = async () => {
    const f = formData(s.body); const d = num(f.distKm), t = parseDur(f.dur);
    if (!d || !t) { toast('Distance et durée requises'); return; }
    Object.assign(r, { date: f.date, type: f.type, distKm: d, durSec: t, hrAvg: num(f.hrAvg), hrMax: num(f.hrMax), elev: num(f.elev), cadence: num(f.cadence), rpe: num(f.rpe), feel: f.feel, updatedAt: Date.now() });
    await put('runs', r); s.close(); toast('Sortie enregistrée'); rerender();
  };
  const dl = s.body.querySelector('[data-del]'); if (dl) dl.onclick = async () => { if (await confirmDlg('Supprimer cette sortie ?', { ok: 'Supprimer', danger: true })) { await del('runs', r.id); s.close(); rerender(); } };
}

// ----------------------------- GPS -----------------------------------
const hav = (a, b) => { const R = 6371, t = x => x * Math.PI / 180; const dLa = t(b.lat - a.lat), dLo = t(b.lon - a.lon); const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
let gps = null;
function gpsScreen() {
  if (!('geolocation' in navigator)) { toast('GPS indisponible sur cet appareil'); return; }
  gps = { pts: [], dist: 0, start: null, elapsed: 0, running: false, watch: null, timer: null, wake: null };
  const s = openSheet({
    title: 'Sortie GPS', full: true, onClose: stopGps, body: `<div class="gps"><div class="big-n" id="gT">0:00</div><div class="kpis">${kpi('Distance', '<span id="gD">0,00</span> km')}${kpi('Allure moy.', '<span id="gP">—</span>')}${kpi('Précision', '<span id="gA">—</span>')}</div>
    <p class="note small">Garde l'écran allumé et l'app au premier plan : sur iPhone, une web-app ne peut pas suivre le GPS en arrière-plan ou écran verrouillé. Pour des sorties longues, une montre ou l'app Forme reste plus fiable — tu pourras importer le GPX ensuite.</p>
    <div class="row gap"><button class="btn big grow" id="gGo">Démarrer</button><button class="btn ghost big grow" id="gStop" disabled>Terminer</button></div></div>`
  });
  const el = id => s.body.querySelector('#' + id);
  const tickFn = () => { const t = gps.elapsed + (gps.running ? (Date.now() - gps.start) / 1000 : 0); el('gT').textContent = fdur(t); el('gD').textContent = f2(gps.dist); el('gP').textContent = gps.dist > 0.05 ? fpace(t / gps.dist) : '—'; };
  el('gGo').onclick = async () => {
    if (!gps.running) {
      gps.running = true; gps.start = Date.now(); el('gGo').textContent = 'Pause'; el('gStop').disabled = false;
      try { gps.wake = await navigator.wakeLock?.request('screen'); } catch (e) { }
      gps.watch = navigator.geolocation.watchPosition(p => {
        el('gA').textContent = '±' + Math.round(p.coords.accuracy) + ' m';
        if (!gps.running || p.coords.accuracy > 30) return; // points imprécis ignorés
        const pt = { lat: p.coords.latitude, lon: p.coords.longitude, t: p.timestamp, alt: p.coords.altitude };
        const last = gps.pts[gps.pts.length - 1];
        if (last) { const d = hav(last, pt); const v = d / ((pt.t - last.t) / 3600000); if (d < 0.003 || v > 30) return; gps.dist += d; }
        gps.pts.push(pt);
      }, e => toast('GPS : ' + e.message), { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
      gps.timer = setInterval(tickFn, 1000);
    } else { gps.elapsed += (Date.now() - gps.start) / 1000; gps.running = false; el('gGo').textContent = 'Reprendre'; navigator.geolocation.clearWatch(gps.watch); }
  };
  el('gStop').onclick = () => {
    if (gps.running) { gps.elapsed += (Date.now() - gps.start) / 1000; gps.running = false; }
    const r = { id: uid('run_'), date: todayStr(), type: 'ef', distKm: +gps.dist.toFixed(2), durSec: Math.round(gps.elapsed), source: 'gps', track: gps.pts.filter((_, i) => i % 3 === 0).map(p => [+p.lat.toFixed(5), +p.lon.toFixed(5)]) };
    stopGps(); s.close(); runForm(r);
  };
}
function stopGps() { if (!gps) return; try { navigator.geolocation.clearWatch(gps.watch); } catch (e) { } clearInterval(gps.timer); try { gps.wake && gps.wake.release(); } catch (e) { } }

// ----------------------------- Import -----------------------------------
function parseGPX(txt) {
  const doc = new DOMParser().parseFromString(txt, 'application/xml');
  const pts = [...doc.getElementsByTagName('trkpt')].map(p => ({ lat: +p.getAttribute('lat'), lon: +p.getAttribute('lon'), t: Date.parse(p.getElementsByTagName('time')[0]?.textContent || ''), ele: +(p.getElementsByTagName('ele')[0]?.textContent || NaN), hr: +(p.getElementsByTagNameNS('*', 'hr')[0]?.textContent || NaN) }));
  if (pts.length < 2) throw new Error('Aucun tracé trouvé');
  let d = 0, up = 0; for (let i = 1; i < pts.length; i++) { d += hav(pts[i - 1], pts[i]); const de = pts[i].ele - pts[i - 1].ele; if (de > 0) up += de; }
  const hrs = pts.map(p => p.hr).filter(x => !isNaN(x) && x > 0);
  const t0 = pts.find(p => p.t)?.t, t1 = [...pts].reverse().find(p => p.t)?.t;
  return { id: uid('run_'), date: t0 ? new Date(t0).toISOString().slice(0, 10) : todayStr(), distKm: +d.toFixed(2), durSec: t0 && t1 ? Math.round((t1 - t0) / 1000) : null, elev: Math.round(up) || null, hrAvg: hrs.length ? Math.round(sum(hrs) / hrs.length) : null, hrMax: hrs.length ? Math.max(...hrs) : null, type: 'ef', source: 'gpx' };
}

actions({
  addRun() { runForm({ id: uid('run_'), date: todayStr(), type: 'ef', source: 'manuel' }); },
  editRun(el) { runForm(S.runs.find(r => r.id === el.dataset.id)); },
  gpsRun() { gpsScreen(); },
  async importRun(el) {
    const file = el.files[0]; if (!file) return; el.value = '';
    try {
      const txt = await file.text();
      if (/\.gpx$/i.test(file.name)) { runForm(parseGPX(txt)); return; }
      const rows = parseCSV(txt); const h = rows[0].map(x => x.toLowerCase()); const ix = re => h.findIndex(x => re.test(x));
      const c = { d: ix(/date/), km: ix(/dist/), t: ix(/dur|temps|time/), hr: ix(/fc|hr|card/), type: ix(/type/) };
      const out = [];
      for (const r of rows.slice(1)) { if (!r[c.d]) continue; const dt = (r[c.d].match(/\d{4}-\d{2}-\d{2}/) || [])[0] || r[c.d].split(/[\/.]/).reverse().map(x => x.padStart(2, '0')).join('-'); const km = num(r[c.km]); const sec = parseDur(r[c.t]); if (!km || !sec) continue; out.push({ id: uid('run_'), date: dt.length === 8 ? '20' + dt : dt, distKm: km, durSec: sec, hrAvg: c.hr >= 0 ? num(r[c.hr]) : null, type: 'ef', source: 'csv' }); }
      const dupe = r => S.runs.some(x => x.date === r.date && Math.abs(x.distKm - r.distKm) < 0.05);
      const fresh = out.filter(r => !dupe(r));
      for (const r of fresh) await put('runs', r);
      toast(`${fresh.length} sortie(s) importée(s)${out.length - fresh.length ? `, ${out.length - fresh.length} doublon(s) ignoré(s)` : ''}`); rerender();
    } catch (e) { toast('Import impossible : ' + e.message); }
  }
});
