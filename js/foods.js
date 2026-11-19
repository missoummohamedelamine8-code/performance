// =====================================================================
// foods.js — base alimentaire : produits perso, cache Open Food Facts,
// table CIQUAL (ANSES) hors ligne, scanner de codes-barres, recettes halal.
// =====================================================================
import { S, put, uid, norm, num, loadScript } from './core.js';

const OFF = 'https://world.openfoodfacts.org';
const OFF_FIELDS = 'code,product_name,product_name_fr,generic_name_fr,brands,stores,categories,categories_tags,image_front_small_url,image_front_url,nutriments,serving_size,serving_quantity,quantity,last_modified_t,nutrition_data_per,allergens_tags,ingredients_text_fr,ingredients_text,states_tags,countries_tags,nutrition_data_prepared';

// --------------------------- CIQUAL -----------------------------------
let ciqual = null;
export async function loadCiqual() {
  if (ciqual) return ciqual;
  try {
    const j = await (await fetch('data/ciqual.json')).json();
    ciqual = j.items.map(a => ({
      id: 'ciq_' + norm(a[1]).replace(/ /g, '-').slice(0, 60), name: a[1], brand: '', category: a[2], unit: 'g',
      per100: { kcal: a[3], p: a[4], c: a[5], sugar: a[6], f: a[7], sat: a[8], fiber: a[9], salt: a[10] },
      source: 'ciqual', sourceLabel: 'Table CIQUAL (ANSES) — valeurs moyennes', verified: 'reference', _n: norm(a[1] + ' ' + a[2])
    }));
  } catch (e) { ciqual = []; }
  return ciqual;
}

// ------------------------ Open Food Facts -----------------------------
export function fromOFF(p) {
  const n = p.nutriments || {};
  const kcal = n['energy-kcal_100g'] ?? (n.energy_100g != null ? n.energy_100g / 4.184 : null);
  const q = String(p.quantity || '').toLowerCase();
  const unit = /\d\s*(ml|cl|l)\b/.test(q) || p.nutrition_data_per === '100ml' ? 'ml' : 'g';
  const states = p.states_tags || [];
  const portions = [];
  if (p.serving_quantity && +p.serving_quantity > 0) portions.push({ label: p.serving_size ? `Portion (${p.serving_size})` : 'Portion', g: +p.serving_quantity });
  const qn = q.match(/^(\d+[.,]?\d*)\s*(g|ml|kg|l|cl)\b/);
  if (qn) { let v = num(qn[1]); if (qn[2] === 'kg' || qn[2] === 'l') v *= 1000; if (qn[2] === 'cl') v *= 10; if (v && v < 3000) portions.push({ label: `Emballage entier (${p.quantity})`, g: v }); }
  return {
    id: 'off_' + p.code, barcode: p.code, name: p.product_name_fr || p.product_name || p.generic_name_fr || '(sans nom)',
    brand: (p.brands || '').split(',')[0].trim(), brands: p.brands || '', stores: p.stores || '', category: (p.categories || '').split(',').slice(-1)[0]?.trim() || '',
    image: p.image_front_small_url || p.image_front_url || '', quantity: p.quantity || '', unit,
    per100: { kcal: kcal != null ? Math.round(kcal * 10) / 10 : null, p: n.proteins_100g ?? null, c: n.carbohydrates_100g ?? null, sugar: n.sugars_100g ?? null, f: n.fat_100g ?? null, sat: n['saturated-fat_100g'] ?? null, fiber: n.fiber_100g ?? null, salt: n.salt_100g ?? null },
    portions, ingredients: p.ingredients_text_fr || p.ingredients_text || '', allergens: (p.allergens_tags || []).map(a => a.replace(/^\w\w:/, '')).join(', '),
    source: 'off', sourceLabel: 'Open Food Facts (base collaborative)',
    verified: states.includes('en:nutrition-facts-completed') ? (states.includes('en:photos-validated') ? 'complete' : 'partial') : 'incomplete',
    lastChecked: p.last_modified_t ? new Date(p.last_modified_t * 1000).toISOString().slice(0, 10) : null,
    fetchedAt: Date.now()
  };
}

export async function offByBarcode(code) {
  const r = await fetch(`${OFF}/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
  if (!r.ok && r.status !== 404) throw new Error('Open Food Facts indisponible (' + r.status + ')');
  const j = await r.json();
  if (j.status !== 1 || !j.product) return null;
  return fromOFF(Object.assign({ code }, j.product));
}

/** Recherche en ligne ; filtres facultatifs marque / enseigne / catégorie. */
// Open Food Facts limite la recherche plein texte des utilisateurs anonymes
// (environ 10 recherches/minute, et refus des requêtes filtrées aux heures de pointe).
// On envoie donc une requête simple (mots + marque) et on filtre enseigne/catégorie côté app.
export async function offSearch(q, f = {}, page = 1) {
  const terms = [q, f.brand].filter(Boolean).join(' ').trim();
  const p = new URLSearchParams({ search_terms: terms, search_simple: '1', action: 'process', json: '1', page_size: '40', page: String(page), fields: OFF_FIELDS, sort_by: 'unique_scans_n' });
  let r;
  try { r = await fetch(`${OFF}/cgi/search.pl?${p}`); }
  catch (e) { throw new Error('Open Food Facts limite temporairement la recherche en ligne (trop de demandes ou service chargé). Réessaie dans une minute, ou scanne le code-barres : la recherche par code-barres reste disponible.'); }
  if (!r.ok) throw new Error('Recherche Open Food Facts indisponible (' + r.status + '). Le scan du code-barres reste disponible.');
  const j = await r.json();
  let items = (j.products || []).filter(x => x.code && x.nutriments).map(fromOFF);
  const all = items;
  const has = (v, s) => !s || norm(v).includes(norm(s));
  items = items.filter(x => has(x.stores, f.store) && has(x.brands, f.brand) && has(x.category, f.category));
  return { count: j.count || 0, items: items.length || !(f.store || f.category) ? items : all, filteredOut: items.length === 0 && (f.store || f.category) };
}

// ------------------------ Recherche unifiée ---------------------------
export function myFoods() { return S.foods.filter(f => !f.deleted); }
export function score(f, q) {
  const n = f._n || norm(`${f.name} ${f.brand || ''} ${f.brands || ''} ${f.category || ''} ${f.stores || ''}`);
  const words = norm(q).split(' ').filter(Boolean); if (!words.length) return 0;
  let s = 0; for (const w of words) { if (!n.includes(w)) return 0; s += n.startsWith(w) ? 3 : (n.includes(' ' + w) ? 2 : 1); }
  return s + (f.fav ? 4 : 0) + Math.min(5, (f.useCount || 0) / 3);
}
export async function localSearch(q, f = {}) {
  const mine = myFoods();
  const filt = x => (!f.brand || norm(x.brand + ' ' + (x.brands || '')).includes(norm(f.brand))) && (!f.store || norm(x.stores || '').includes(norm(f.store))) && (!f.category || norm(x.category || '').includes(norm(f.category)));
  if (/^\d{8,14}$/.test(q.trim())) return mine.filter(x => x.barcode === q.trim());
  const a = mine.filter(filt).map(x => [x, score(x, q)]).filter(x => x[1] > 0);
  let b = [];
  if (!f.brand && !f.store) { const c = await loadCiqual(); b = c.filter(filt).map(x => [x, score(x, q) - 1]).filter(x => x[1] > 0); }
  return [...a, ...b].sort((x, y) => y[1] - x[1]).slice(0, 40).map(x => x[0]);
}

/** Enregistre (ou met à jour) un produit dans ta bibliothèque locale, sans doublon de code-barres. */
export async function saveFood(food) {
  let cur = food.barcode ? S.foods.find(x => x.barcode === food.barcode) : S.foods.find(x => x.id === food.id);
  if (cur && cur.source === 'user' && food.source !== 'user') return cur; // ta fiche perso prime sur la base en ligne
  const out = Object.assign({}, cur || {}, food, { id: cur?.id || food.id || uid('food_'), updatedAt: Date.now() });
  if (cur) { out.fav = cur.fav; out.useCount = cur.useCount; out.lastPortion = cur.lastPortion; }
  delete out._n;
  await put('foods', out);
  return out;
}
export async function touchFood(food, grams) {
  const f = await saveFood(food);
  f.useCount = (f.useCount || 0) + 1; f.lastUsed = Date.now(); f.lastPortion = grams;
  await put('foods', f); return f;
}
export function frequentFoods(n = 12) { return myFoods().filter(f => f.useCount).sort((a, b) => (b.fav - a.fav) || (b.useCount - a.useCount)).slice(0, n); }
export function recentFoods(n = 12) { return myFoods().filter(f => f.lastUsed).sort((a, b) => b.lastUsed - a.lastUsed).slice(0, n); }

export const VERIF = {
  user: ['Saisi par toi (emballage)', 'ok'], reference: ['Référence CIQUAL (moyenne générique)', 'info'],
  complete: ['Open Food Facts — fiche complète', 'ok'], partial: ['Open Food Facts — à vérifier sur l’emballage', 'warn'],
  incomplete: ['Open Food Facts — valeurs incomplètes', 'bad'], estimated: ['Valeurs estimées', 'warn']
};

// ------------------------ Scanner de codes-barres ---------------------
let scanner = null;
export async function startScanner(elId, onCode) {
  // 1) API native (Chrome Android…)
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('ean_13')) {
        const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const v = document.createElement('video'); v.playsInline = true; v.muted = true; v.srcObject = stream;
        const host = document.getElementById(elId); host.innerHTML = ''; host.appendChild(v); await v.play();
        let stop = false;
        const loop = async () => { if (stop) return; try { const c = await det.detect(v); if (c.length) { stop = true; stream.getTracks().forEach(t => t.stop()); onCode(c[0].rawValue); return; } } catch (e) { } requestAnimationFrame(loop); };
        loop();
        scanner = { stop: () => { stop = true; stream.getTracks().forEach(t => t.stop()); } };
        return;
      }
    } catch (e) { /* on bascule sur la bibliothèque */ }
  }
  // 2) Bibliothèque html5-qrcode (iPhone / Safari)
  await loadScript('https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js');
  const H = window.Html5Qrcode; const F = window.Html5QrcodeSupportedFormats;
  const h = new H(elId, { formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E], verbose: false });
  let done = false;
  await h.start({ facingMode: 'environment' }, { fps: 10, qrbox: (w, hh) => ({ width: Math.min(300, w * 0.85), height: Math.min(140, hh * 0.5) }) },
    code => { if (done) return; done = true; h.stop().catch(() => { }); onCode(code); }, () => { });
  scanner = { stop: () => { if (!done) { done = true; h.stop().catch(() => { }); } } };
}
export function stopScanner() { try { scanner && scanner.stop(); } catch (e) { } scanner = null; }

// ------------------------ Recettes halal ------------------------------
// Valeurs nutritionnelles génériques approximatives pour 100 g (cru sauf mention).
// Elles servent d'estimation : les valeurs de tes produits réels peuvent différer.
export const ING = {
  'Blanc de poulet halal (cru)': [110, 23.5, 0, 1.5], 'Dinde halal, escalope (crue)': [107, 24, 0, 1.2], 'Bœuf haché 5 % MG halal (cru)': [125, 21, 0, 5],
  'Œuf entier': [140, 12.7, 0.7, 9.8], 'Blanc d’œuf': [48, 10.5, 0.7, 0.2], 'Thon au naturel égoutté': [116, 26, 0, 1], 'Saumon (cru)': [200, 20, 0, 13], 'Sardines à l’huile égouttées': [210, 24, 0, 13],
  'Skyr nature 0 %': [62, 11, 4, 0.2], 'Fromage blanc 0 %': [47, 7.5, 4, 0.2], 'Lait demi-écrémé': [46, 3.3, 4.8, 1.6], 'Whey (poudre, moyenne)': [380, 78, 7, 5],
  'Riz basmati (cru)': [355, 8, 78, 1], 'Pâtes complètes (crues)': [350, 13, 64, 2.5], 'Flocons d’avoine': [370, 13.5, 58, 7], 'Patate douce (crue)': [86, 1.6, 17, 0.1], 'Pomme de terre (crue)': [80, 2, 17, 0.1],
  'Lentilles corail (crues)': [340, 25, 50, 2], 'Pois chiches cuits (conserve égouttée)': [130, 7, 17, 2.5], 'Tortilla de blé': [300, 8.5, 50, 7], 'Pain complet': [245, 9, 41, 3.5], 'Semoule de couscous (crue)': [360, 12, 73, 1.5],
  'Banane': [90, 1.1, 20, 0.3], 'Fruits rouges': [45, 1, 8, 0.4], 'Poivron': [26, 1, 4.5, 0.3], 'Tomate': [18, 0.9, 3, 0.2], 'Oignon': [40, 1.2, 8, 0.2], 'Courgette': [17, 1.2, 2, 0.3],
  'Épinards': [23, 2.9, 1.1, 0.4], 'Brocoli': [34, 2.8, 4, 0.4], 'Haricots verts': [30, 1.8, 4.5, 0.2], 'Avocat': [160, 2, 2, 15], 'Huile d’olive': [900, 0, 0, 100], 'Beurre de cacahuète': [600, 25, 14, 50],
  'Miel': [320, 0.3, 80, 0], 'Fromage râpé (emmental)': [380, 28, 0.5, 29], 'Feta': [265, 14, 1, 22], 'Sauce tomate (coulis)': [35, 1.5, 5.5, 0.3], 'Maïs doux (conserve)': [80, 2.5, 14, 1.2], 'Haricots rouges (conserve égouttée)': [110, 8, 14, 0.5]
};
export const RECIPES = [
  { id: 'r1', name: 'Bowl poulet, riz basmati & légumes', tags: ['Meal prep', 'Transportable'], time: 25, keeps: '3 jours au frigo', goal: ['bulk', 'maintain'],
    items: [['Blanc de poulet halal (cru)', 180], ['Riz basmati (cru)', 90], ['Brocoli', 150], ['Huile d’olive', 8]],
    steps: ['Cuire le riz.', 'Couper le poulet en dés, le saisir à la poêle avec l’huile, paprika, cumin, ail.', 'Cuire le brocoli à la vapeur ou à la poêle.', 'Répartir en boîtes hermétiques.'] },
  { id: 'r2', name: 'Overnight oats protéinés', tags: ['Sans cuisson', 'Petit-déj', 'Transportable'], time: 5, keeps: '2 jours au frigo', goal: ['bulk', 'maintain', 'cut'],
    items: [['Flocons d’avoine', 60], ['Skyr nature 0 %', 150], ['Lait demi-écrémé', 120], ['Fruits rouges', 80], ['Miel', 10]],
    steps: ['Mélanger avoine, skyr et lait dans un bocal.', 'Ajouter fruits rouges et miel.', 'Laisser une nuit au frigo.'] },
  { id: 'r3', name: 'Wraps thon, crudités & fromage blanc', tags: ['Rapide', 'Transportable'], time: 10, keeps: 'À manger dans la journée', goal: ['cut', 'maintain'],
    items: [['Tortilla de blé', 120], ['Thon au naturel égoutté', 140], ['Fromage blanc 0 %', 60], ['Tomate', 80], ['Maïs doux (conserve)', 40]],
    steps: ['Mélanger thon, fromage blanc, sel, poivre, citron.', 'Garnir les tortillas avec tomate et maïs.', 'Rouler serré et emballer.'] },
  { id: 'r4', name: 'Chili bœuf haché & haricots rouges', tags: ['Meal prep', 'Batch cooking'], time: 35, keeps: '3–4 jours au frigo', goal: ['bulk', 'maintain'],
    items: [['Bœuf haché 5 % MG halal (cru)', 150], ['Haricots rouges (conserve égouttée)', 120], ['Sauce tomate (coulis)', 150], ['Oignon', 50], ['Poivron', 80], ['Riz basmati (cru)', 70]],
    steps: ['Faire revenir oignon et poivron.', 'Ajouter le bœuf, le dorer.', 'Ajouter coulis, haricots, cumin, paprika, piment ; mijoter 20 min.', 'Servir avec le riz.'] },
  { id: 'r5', name: 'Omelette épinards & feta', tags: ['Rapide', 'Petit-déj'], time: 10, keeps: 'À manger tout de suite', goal: ['cut', 'maintain'],
    items: [['Œuf entier', 150], ['Blanc d’œuf', 100], ['Épinards', 80], ['Feta', 25], ['Pain complet', 60]],
    steps: ['Faire tomber les épinards à la poêle.', 'Battre œufs et blancs, verser, ajouter la feta émiettée.', 'Servir avec le pain.'] },
  { id: 'r6', name: 'Dinde, patate douce & haricots verts', tags: ['Meal prep', 'Transportable'], time: 30, keeps: '3 jours au frigo', goal: ['cut', 'maintain'],
    items: [['Dinde halal, escalope (crue)', 170], ['Patate douce (crue)', 220], ['Haricots verts', 150], ['Huile d’olive', 6]],
    steps: ['Rôtir la patate douce en cubes au four (200 °C, 25 min).', 'Griller la dinde assaisonnée.', 'Cuire les haricots verts.', 'Répartir en boîtes.'] },
  { id: 'r7', name: 'Dahl de lentilles corail & poulet', tags: ['Batch cooking', 'Meal prep'], time: 30, keeps: '3–4 jours au frigo', goal: ['bulk', 'maintain'],
    items: [['Lentilles corail (crues)', 70], ['Blanc de poulet halal (cru)', 120], ['Sauce tomate (coulis)', 100], ['Oignon', 50], ['Riz basmati (cru)', 60]],
    steps: ['Faire revenir oignon, curry, curcuma, gingembre.', 'Ajouter lentilles, coulis et 300 ml d’eau ; cuire 15 min.', 'Ajouter le poulet en dés, cuire 10 min.', 'Servir avec le riz.'] },
  { id: 'r8', name: 'Shaker prise de masse', tags: ['Sans cuisson', 'Collation', 'Transportable'], time: 3, keeps: 'À boire rapidement', goal: ['bulk'],
    items: [['Lait demi-écrémé', 350], ['Flocons d’avoine', 50], ['Banane', 120], ['Whey (poudre, moyenne)', 30], ['Beurre de cacahuète', 15]],
    steps: ['Tout mixer.', 'Transporter dans un shaker fermé (sans whey ajoutée à l’avance si chaleur).'] },
  { id: 'r9', name: 'Couscous poulet & pois chiches', tags: ['Meal prep', 'Transportable'], time: 25, keeps: '3 jours au frigo', goal: ['bulk', 'maintain'],
    items: [['Semoule de couscous (crue)', 80], ['Blanc de poulet halal (cru)', 150], ['Pois chiches cuits (conserve égouttée)', 80], ['Courgette', 120], ['Huile d’olive', 8]],
    steps: ['Cuire la semoule (eau bouillante, 5 min à couvert).', 'Poêler poulet, courgette, ras-el-hanout.', 'Ajouter les pois chiches, mélanger.', 'Répartir en boîtes.'] },
  { id: 'r10', name: 'Salade sardines, pommes de terre & œuf', tags: ['Transportable', 'Sans réchauffage'], time: 20, keeps: '2 jours au frigo', goal: ['maintain', 'cut'],
    items: [['Pomme de terre (crue)', 200], ['Sardines à l’huile égouttées', 90], ['Œuf entier', 60], ['Tomate', 100], ['Haricots verts', 80]],
    steps: ['Cuire pommes de terre et œuf (10 min).', 'Mélanger avec haricots verts, tomate, sardines émiettées, moutarde, citron.'] },
  { id: 'r11', name: 'Fromage blanc protéiné du soir', tags: ['Sans cuisson', 'Collation'], time: 2, keeps: 'À manger tout de suite', goal: ['cut', 'maintain', 'bulk'],
    items: [['Fromage blanc 0 %', 250], ['Fruits rouges', 100], ['Flocons d’avoine', 20]],
    steps: ['Mélanger, ajouter cannelle ou édulcorant si besoin.'] },
  { id: 'r12', name: 'Pâtes complètes bolognaise de dinde', tags: ['Batch cooking', 'Meal prep'], time: 25, keeps: '3 jours au frigo', goal: ['bulk', 'maintain'],
    items: [['Pâtes complètes (crues)', 100], ['Dinde halal, escalope (crue)', 150], ['Sauce tomate (coulis)', 150], ['Oignon', 40], ['Fromage râpé (emmental)', 15]],
    steps: ['Cuire les pâtes.', 'Hacher la dinde au couteau, la dorer avec l’oignon.', 'Ajouter le coulis, herbes ; mijoter 10 min.', 'Mélanger, parsemer de fromage.'] }
];
export function recipeMacros(r) {
  const t = { kcal: 0, p: 0, c: 0, f: 0, grams: 0 };
  for (const [n, g] of r.items) { const v = ING[n]; if (!v) continue; t.kcal += v[0] * g / 100; t.p += v[1] * g / 100; t.c += v[2] * g / 100; t.f += v[3] * g / 100; t.grams += g; }
  return t;
}
export function ingFood(name) {
  const v = ING[name];
  return { id: 'ing_' + norm(name).replace(/ /g, '-'), name, brand: '', unit: 'g', per100: { kcal: v[0], p: v[1], c: v[2], f: v[3] }, source: 'generic', sourceLabel: 'Valeur générique approximative', verified: 'estimated' };
}
