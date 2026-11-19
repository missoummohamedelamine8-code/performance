# Performance — Musculation & Nutrition

Application web mobile (PWA) personnelle, en français, pour suivre la musculation, la course à pied, l'activité quotidienne (pas) et la nutrition, avec des besoins caloriques recalculés chaque jour selon l'activité réelle.

- HTML / CSS / JavaScript (modules ES), **aucun framework**, aucune étape de build.
- Données stockées **uniquement sur ton téléphone** (IndexedDB), sauvegarde/restauration JSON.
- Fonctionne hors ligne (service worker), installable sur iPhone et Android.

## Contenu du dossier

```
app/                    ← l'application à déployer (c'est tout ce qu'il faut publier)
  index.html, manifest.webmanifest, sw.js
  css/app.css
  js/                   ← code source (voir « Architecture » ci-dessous)
  data/ciqual.json      ← 3 137 aliments génériques (table CIQUAL de l'ANSES, licence ouverte)
  icons/
docs/                   ← guides (installation, import Google Sheets, sauvegarde, Apple Santé)
donnees-privees/        ← TES données extraites du Google Sheets — ne jamais publier
outils/serveur-local.ps1← serveur de test local (Windows, sans Node ni Python)
```

## Démarrage rapide

1. **Tester sur l'ordinateur** :
   ```powershell
   powershell -ExecutionPolicy Bypass -File outils\serveur-local.ps1 -Port 8080
   ```
   puis ouvrir http://localhost:8080
2. **Publier** sur GitHub Pages (voir ci-dessous) pour l'utiliser sur l'iPhone.
3. **Installer** sur l'écran d'accueil : [docs/GUIDE-INSTALLATION.md](docs/GUIDE-INSTALLATION.md).
4. **Importer l'historique** : Profil › « Importer un fichier » › `donnees-privees/import-initial-google-sheets.json` (ou un export .xlsx récent du Sheets). Voir [docs/GUIDE-IMPORT-GOOGLE-SHEETS.md](docs/GUIDE-IMPORT-GOOGLE-SHEETS.md).

## Déploiement sur GitHub Pages

> ⚠️ Ne publie **que le dossier `app/`**. Le dossier `donnees-privees/` contient ton historique personnel : un dépôt GitHub Pages gratuit est **public**.

1. Crée un dépôt GitHub (ex. `performance`).
2. Copie **le contenu** du dossier `app/` à la racine du dépôt (index.html à la racine).
3. Pousse :
   ```powershell
   git init; git add .; git commit -m "Performance v1.0.0"; git branch -M main
   git remote add origin https://github.com/<ton-compte>/performance.git
   git push -u origin main
   ```
4. Sur GitHub : *Settings › Pages › Build and deployment › Source : Deploy from a branch › main / (root)*.
5. L'app est disponible à `https://<ton-compte>.github.io/performance/` (HTTPS obligatoire pour l'installation, le service worker, la caméra et le GPS — GitHub Pages le fournit).

**Mises à jour** : modifie les fichiers, puis incrémente `VERSION` dans `sw.js` (ex. `v1.0.1`) et pousse. À l'ouverture suivante, l'app affiche « Nouvelle version disponible » ; tes données ne sont pas touchées (elles sont dans IndexedDB, pas dans le cache).

## Architecture

| Fichier | Rôle |
|---|---|
| `js/core.js` | Stockage IndexedDB, état en mémoire, utilitaires (dates, formats) |
| `js/calc.js` | Tous les calculs : métabolisme (Mifflin-St Jeor), dépense par les pas/course/muscu sans double comptage, calibration, macros, progression des charges, 1RM (Epley), tonnage, volume par muscle, prédictions course (Riegel), charge 7 j / 28 j |
| `js/importer.js` | Lecture du Google Sheets (XLSX via SheetJS, CSV, grilles JSON, API Google), mise en attente, intégration sans doublon |
| `js/foods.js` | Base aliments : Open Food Facts (code-barres, recherche), CIQUAL hors ligne, fiches perso, scanner, recettes halal |
| `js/views-*.js` | Écrans : accueil, musculation, mode entraînement, course, activité, nutrition, progrès, profil |
| `js/charts.js` | Graphiques SVG légers et interactifs |
| `sw.js` | Cache hors ligne et gestion des versions |

Bibliothèques externes chargées **à la demande** et mises en cache : SheetJS 0.18.5 (lecture .xlsx), html5-qrcode 2.3.8 (scanner sur iPhone ; Android utilise l'API native `BarcodeDetector`), Google Identity Services (uniquement si tu configures la connexion directe au Sheets).

## Modèle énergétique (résumé)

```
Maintenance = [ BMR × 1,2                       (vie courante + digestion, inclut ~3 000 pas)
              + marche : (pas − pas de course estimés − 3 000) × foulée × poids × 0,50 kcal/kg/km
              + course : distance × poids × 0,95 kcal/kg/km
              + musculation : (MET 3,5→6 selon RPE − 1) × poids × durée
              + station debout prolongée / journée de travail active
              + autres activités (MET) ] × facteur de calibration
Objectif    = Maintenance ± surplus / déficit choisi
```

Le facteur de calibration part de 1 et n'est ajusté qu'avec au moins 70 % de jours de journal complets et 4 pesées sur 28 jours, de 30 % de l'écart observé, au plus une fois par semaine. Tous les résultats sont affichés comme des **estimations** (≈, marge ±).

Scénarios de contrôle (84 kg, 184 cm, 26 ans, sans calibration) — visibles dans Nutrition › Objectifs :

| Journée | Maintenance estimée |
|---|---|
| 4 000 pas | ≈ 2 270 kcal |
| 10 000 pas | ≈ 2 460 kcal |
| 18 000 pas (travail en magasin) | ≈ 2 760 kcal |
| 20 000 pas + musculation 75 min RPE 8 | ≈ 3 190 kcal |
| 12 000 pas dont 5 km de course | ≈ 2 770 kcal (4 800 pas attribués à la course retirés de la marche) |

## Limites connues (honnêtement)

- **Apple Santé** : une PWA ne peut pas lire HealthKit. Solutions : Raccourci iOS, export Apple Santé, CSV, ou app native compagnon ([docs/GUIDE-APPLE-SANTE.md](docs/GUIDE-APPLE-SANTE.md)).
- **Google Sheets** : pas de synchronisation automatique sans identifiant OAuth configuré par toi ; l'import se fait par fichier exporté.
- **Open Food Facts** : base collaborative très large mais pas exhaustive ; la recherche texte est limitée pour les utilisateurs anonymes (≈ 10/min, refus possibles aux heures chargées). La recherche par **code-barres** reste fiable. Les produits absents se créent à la main.
- **GPS** : sur iPhone, le suivi s'arrête si l'écran se verrouille ou si l'app passe en arrière-plan.
- **Rappels** : affichés à l'ouverture de l'app ; pour des notifications app fermée, exporte-les dans le Calendrier (.ics).
