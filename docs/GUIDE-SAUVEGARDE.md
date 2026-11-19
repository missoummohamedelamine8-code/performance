# Sauvegarder et restaurer

Tes données sont **uniquement sur ton téléphone** (IndexedDB). Aucun serveur ne les reçoit, et personne d'autre que toi n'y a accès. En contrepartie, **si tu perds le téléphone ou si iOS efface les données du site, elles sont perdues** sans sauvegarde exportée.

## Exporter une sauvegarde complète

Profil › Sauvegarde › **Exporter une sauvegarde complète (JSON)**.
Le fichier `sauvegarde-performance-AAAA-MM-JJ.json` contient tout : profil, réglages, calibration, exercices, séances types, séances, sorties, jours (pas, poids, sommeil…), produits, journal alimentaire, repas récurrents, photos.
Sur iPhone, choisis « Enregistrer dans Fichiers » (idéalement iCloud Drive).

Un rappel s'affiche à l'accueil si ta dernière sauvegarde a plus de 7 jours (réglable dans Profil › Rappels).

## Restaurer

Profil › **Restaurer une sauvegarde** › choisis le fichier, puis :
- **Fusionner** : ajoute et met à jour sans rien supprimer (pour récupérer des données sur un nouveau téléphone déjà utilisé).
- **Tout remplacer** : efface les données actuelles et les remplace (double confirmation ; une copie locale est faite juste avant).

## Copies automatiques locales

L'app garde les **5 dernières copies** sur l'appareil : une par jour à l'ouverture, et avant chaque import, annulation d'import ou restauration (Profil › Copies automatiques locales). Elles se restaurent ou s'exportent en un geste, mais disparaissent avec les données de l'app : elles ne remplacent pas l'export.

## Exports CSV

- **Séances** : une ligne par série (date, séance, exercice, groupe, série, reps, poids, poids déduit, RPE, source). Réimportable.
- **Journal alimentaire** : une ligne par aliment (date, repas, aliment, marque, quantité, kcal, macros).

## Changer de téléphone

1. Ancien téléphone : exporter la sauvegarde.
2. Nouveau téléphone : installer l'app, Profil › Restaurer › Tout remplacer.
