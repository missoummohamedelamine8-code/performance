# Importer le Google Sheets

L'app reconnaît une feuille **TRAINING** en blocs (« Séance - … », colonnes « Semaine N » avec Reps / Poids / Remarque, tableau « Répartition des trainings » pour les jours) et une feuille **TRACKING** en blocs hebdomadaires datés (Poids, Pas, Séance, sommeil…). Les colonnes sont repérées par leurs titres. Rien n'est inventé : une cellule vide reste vide.

## Méthode 1 — fichier fourni (le plus simple)

Le fichier `donnees-privees/import-initial-google-sheets.json` contient les feuilles TRAINING et TRACKING extraites de ton Sheets.

1. Copie-le sur ton iPhone (AirDrop, iCloud Drive, e-mail à toi-même…).
2. Dans l'app installée : **Profil › Importer un fichier** › choisis le fichier.
3. Vérifie l'écran « Vérifier avant intégration » (dates, séances, avertissements), corrige le repère de date si besoin.
4. Touche **Valider l'intégration**.

## Méthode 2 — export .xlsx (pour actualiser plus tard)

1. Google Sheets › **Fichier › Télécharger › Microsoft Excel (.xlsx)**.
2. Dans l'app : **Profil › Importer un fichier** › choisis le .xlsx (l'app télécharge une fois le lecteur Excel, ~1 Mo, puis le garde en cache).
3. Les feuilles TRAINING et TRACKING sont détectées automatiquement ; les autres sont ignorées.

## Réimportation et doublons

- Chaque séance du Sheets a une clé unique (séance + numéro de semaine). Réimporter le même fichier ne crée **aucun doublon** (testé : 34 séances identiques, 0 ajoutée).
- Une semaine modifiée dans le Sheets met à jour la séance correspondante… **sauf** si tu l'as modifiée dans l'app (elle est alors protégée et signalée comme conflit).
- Les séances enregistrées dans l'app ne sont **jamais** modifiées par un import.
- Tout import reste **en attente** jusqu'à validation. Un import validé peut être annulé (Profil › Imports validés › annuler) : seules ses séances non modifiées sont retirées.
- Une copie de sécurité locale est faite avant chaque import.

## Méthode 3 — connexion directe (avancé, facultatif)

Il n'y a pas de synchronisation automatique sans autorisation Google. Pour lire le Sheets directement :

1. Google Cloud Console › crée un projet › active **Google Sheets API**.
2. *Identifiants › Créer › ID client OAuth › Application Web*. Ajoute l'origine JavaScript autorisée : `https://<ton-compte>.github.io`.
3. Écran de consentement : mode « Test », ajoute ton adresse comme utilisateur test.
4. Dans l'app : Profil › Connexion directe › colle le **Client ID** et l'**ID du Sheets** (la partie entre `/d/` et `/edit` dans l'URL) › « Se connecter et lire le Sheets ».

L'accès est en **lecture seule** et le jeton n'est pas conservé : il faut se reconnecter à chaque lecture.

## Format CSV simple accepté

Une ligne par série : `date ; séance ; exercice ; série ; reps ; poids ; remarque` (titres en première ligne, dates JJ/MM/AAAA ou AAAA-MM-JJ). C'est aussi le format de l'export CSV de l'app.
