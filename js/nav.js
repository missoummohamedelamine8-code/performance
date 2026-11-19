// nav.js — état de navigation partagé entre les écrans
import { todayStr } from './core.js';

export const R = { tab: 'home', sub: { muscu: 'seances', nutri: 'journal', prog: 'muscu', course: 'sorties', act: 'pas' }, date: todayStr(), period: 30, filters: {} };
export const VIEWS = {};
let _render = () => { };
export function setRenderer(f) { _render = f; }
export function rerender() { _render(); }
export function go(tab, sub) {
  R.tab = tab; if (sub) R.sub[tab] = sub;
  location.hash = '#/' + tab + (sub ? '/' + sub : '');
  _render(); window.scrollTo(0, 0);
}
