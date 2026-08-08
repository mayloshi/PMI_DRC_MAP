# PMI_DRC_MAP

Application web statique pour cartographier les membres et volontaires du PMI RDC Chapter, suivre la satisfaction mensuelle et consulter un dashboard statistique.

## Fichiers principaux

- `index.html` : page d'accueil avec carte cliquable, formulaire de pointage et enquete de satisfaction.
- `dashboard.html` : dashboard separe protege par mot de passe.
- `app.js` : logique de pointage, annulation, satisfaction, graphiques et Supabase.
- `style.css` : charte visuelle inspiree du template PMI RDC 2026.
- `rdc-provinces-geojson.js` : limites reelles des 26 provinces.
- `assets/p1_Image6_26195.png` : logo extrait du template fourni.
- `supabase-schema.sql` : schema de base de donnees.
- `supabase-config.js` : configuration publique Supabase et mot de passe dashboard.

## Accueil

La page permet a une personne de renseigner :

- email ;
- PMI ID ;
- sexe : M ou F ;
- statut : Etudiant ou Professionnel ;
- statut PMI : Membre, Volontaire, ou Membre et volontaire.

Regles appliquees :

- une personne peut ajouter membre puis volontaire plus tard, ou l'inverse ;
- si elle ajoute le deuxieme role plus tard, la nouvelle province remplace aussi la province du role deja actif ;
- si elle est deja membre ou deja volontaire, elle ne peut pas choisir directement `Membre et volontaire` plus tard ;
- elle peut annuler membre, volontaire, ou les deux ;
- les compteurs par province affichent membres et volontaires.

## Enquete de satisfaction

Chaque personne peut donner une note mensuelle de 1 a 5 etoiles et ajouter un commentaire. Le dashboard genere :

- un tableau niko-niko mensuel ;
- un tableau niko-niko trimestriel ;
- un tableau niko-niko annuel ;
- un emoji du mois courant ;
- un emoji depuis le debut de l'annee.

Ces emojis apparaissent aussi sur la page d'accueil et sont recalcules apres chaque enregistrement de satisfaction.

## Dashboard

Acces :

`Projectdrc@2026`

Fonctions :

- histogramme membres/volontaires par province ;
- statistiques par sexe ;
- statistiques Etudiant / Professionnel ;
- tableau niko-niko ;
- export CSV ;
- export PNG de l'histogramme ;
- suppression d'un profil ;
- remise a zero ;
- configuration locale de la connexion Supabase.

## Configuration

Modifier `supabase-config.js` pour changer :

- le mot de passe du dashboard ;
- l'URL Supabase ;
- la cle `anon public`.

Ces parametres sont lus depuis le fichier config, donc ils sont identiques pour tous les navigateurs apres publication GitHub.

## Supabase

1. Creer un projet Supabase.
2. Ouvrir `SQL Editor`.
3. Executer le contenu de `supabase-schema.sql`.
4. Renseigner `supabase-config.js` avec l'URL du projet et la cle `anon public`.
5. Pousser la modification sur GitHub.

Attention : le mot de passe du dashboard est visible dans le code HTML/JS, et les politiques Supabase sont ouvertes pour permettre au site statique de fonctionner. Pour une version publique durable, remplacer les actions admin par une Edge Function protegee cote serveur.

## Deploiement GitHub Pages

Dans le depot GitHub :

1. Aller dans `Settings`.
2. Ouvrir `Pages`.
3. Choisir `Deploy from a branch`.
4. Choisir `main` et `/ (root)`.
5. Enregistrer.

URL attendue :

`https://mayloshi.github.io/PMI_DRC_MAP/`

## Source cartographique

Limites provinciales : geoBoundaries COD ADM1, source OpenStreetMap/Wambacher, licence ODbL 1.0.
