# Pas et activité depuis Apple Santé

## La limite réelle

- Une application web (PWA), même installée, **ne peut pas lire Apple Santé** : HealthKit est réservé aux applications natives publiées via Xcode.
- Elle ne peut pas non plus compter les pas en arrière-plan avec l'accéléromètre : l'app ne présente donc **aucun podomètre maison**.

Voici les solutions qui fonctionnent, de la plus pratique à la plus manuelle.

## 1. Raccourci iOS (recommandé — 2 gestes par jour)

Le Raccourci lit Santé et copie le résultat ; dans l'app tu touches « Coller depuis Raccourcis ».

Dans l'app **Raccourcis** › « + » › nomme-le « Pas → Performance » et ajoute ces actions :

1. **Rechercher des échantillons de santé** : Type = *Nombre de pas* ; Date de début = *aujourd'hui* ; Regrouper par = *Jour* ; Remplir les jours manquants : non.
2. **Calculer les statistiques** : *Somme* de « Échantillons de santé » → renomme la variable `Pas`.
3. (facultatif) Même chose pour *Distance (marche + course)* → `Distance` (en km), *Énergie active* → `Calories`, *Étages gravis* → `Etages`.
4. **Date actuelle** → **Formater la date** : format personnalisé `yyyy-MM-dd` → `Jour`.
5. **Texte** :
   ```
   {"date":"Jour","steps":Pas,"distance":Distance,"activeKcal":Calories,"flights":Etages}
   ```
   (insère les variables à la place des mots, sans guillemets autour des nombres)
6. **Copier dans le presse-papiers**.
7. **Ouvrir l'URL** : l'adresse de ton app (ex. `https://<ton-compte>.github.io/performance/`) — ou ouvre simplement l'app depuis l'écran d'accueil.

Dans l'app : Activité › Sources › **Coller depuis Raccourcis** (ou Accueil › Saisir mes pas › Coller). iOS demande l'autorisation de coller.

Astuces :
- Automatisation possible : Raccourcis › Automatisation › « Heure de la journée » (ex. 21 h) › exécuter le raccourci. Il te restera à ouvrir l'app et coller.
- Plusieurs jours d'un coup : remplace l'étape 5 par une liste de lignes `AAAA-MM-JJ;pas` (une par jour). L'app accepte aussi ce format.
- Les distances en mètres sont converties automatiquement.

## 2. Export complet d'Apple Santé (historique)

Santé › photo de profil › **Exporter toutes les données de santé** → `export.zip`. Décompresse-le (app Fichiers : toucher le zip), puis dans l'app : Activité › Sources › **Importer export.xml**.

- Lecture par morceaux : même un fichier de plusieurs centaines de Mo est accepté (patience).
- Pas, distance, énergie active, étages et temps debout sont agrégés par jour.
- **Anti double comptage** : si l'iPhone et l'Apple Watch ont compté les pas le même jour, l'app garde la source la plus élevée au lieu d'additionner (Santé fait une déduplication similaire).

## 3. CSV ou saisie manuelle

- CSV : `date;pas;distance;calories;etages` (titres facultatifs).
- Manuel : Accueil › Saisir mes pas, ou Activité › Journées › un jour.
- « Journée de travail active » (magasin, réassort…) : si tu ne connais pas tes pas, l'app utilise ton estimation (16 000 par défaut, modifiable dans le Profil), clairement indiquée comme estimée.

## Comment les pas sont utilisés dans le calcul énergétique

- Les 3 000 premiers pas sont déjà inclus dans le niveau de base (métabolisme × 1,2).
- Au-delà : distance = pas × foulée (≈ 0,415 × taille, soit ≈ 76 cm pour 184 cm ; personnalisable) ; dépense ≈ 0,5 kcal par kg et par km.
- Si tes pas incluent ceux de tes sorties course (cas d'Apple Santé), la part attribuée à la course (durée × ~160 pas/min ou ta cadence) est **retirée** de la marche : la course est comptée une seule fois, avec son propre coût (≈ 0,95 kcal/kg/km).
- Les calories actives de la montre sont affichées pour comparaison mais ne s'additionnent pas au modèle (elles recouvrent la marche, la course et la muscu).

## 4. Évolution : application native compagnon

Pour une synchronisation vraiment automatique, il faudrait une petite app iOS native (Swift + HealthKit) :

```
[Apple Santé] --HealthKit (lecture pas, distance, énergie active, entraînements)-->
[App compagnon Swift]  --tâche en arrière-plan (HKObserverQuery + BGAppRefresh)-->
   option A : écrit un fichier JSON quotidien dans iCloud Drive → importé par la PWA
   option B : envoie le JSON vers un petit service personnel (ex. Cloudflare Worker + stockage chiffré)
              que la PWA interroge à l'ouverture, avec un jeton personnel
```

Contraintes : compte développeur Apple (installation via Xcode ou TestFlight), et pour l'option B un serveur, donc des données qui quittent le téléphone (chiffrement indispensable). Le format attendu par la PWA est déjà celui du Raccourci (`{"date","steps","distance","activeKcal","flights","standMin"}`), ce qui rend cette évolution simple à brancher.
