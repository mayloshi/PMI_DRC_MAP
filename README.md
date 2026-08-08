# Formulaire interactif PMI RDC - carte des membres et volontaires

Ce dossier contient une application Google Apps Script pour collecter la province ou le continent de base des membres et volontaires du PMI RDC Chapter.

## Fichiers

- `Code.gs` : logique serveur, stockage Google Sheets, controle des doublons email et PMI ID.
- `Form.html` : interface publique avec carte de la RDC, 26 provinces, continents hors RDC et compteurs.
- `PMI_RDC_Carte_Pointage_Local.html` : page locale autonome qui fonctionne directement dans le navigateur, sans Google Apps Script.
- `rdc-provinces-geojson.js` : limites reelles des 26 provinces utilisees par la page locale.
- `geoBoundaries-COD-ADM1_simplified.geojson` : fichier source cartographique conserve pour reference.

## Utilisation locale

1. Ouvrir `PMI_RDC_Carte_Pointage_Local.html` dans un navigateur.
2. Saisir l'email, le PMI ID et le statut.
3. Cliquer sur une province ou un continent.
4. Utiliser `Exporter CSV` pour recuperer les pointages.

Garder `PMI_RDC_Carte_Pointage_Local.html` et `rdc-provinces-geojson.js` dans le meme dossier.

La version locale bloque les doublons sur le meme navigateur et le meme ordinateur. Pour bloquer les doublons entre plusieurs appareils, utiliser la version Google Apps Script ci-dessous.

Source cartographique locale : geoBoundaries COD ADM1, source OpenStreetMap/Wambacher, licence ODbL 1.0.

## Board administrateur

Le board s'ouvre depuis la page avec le mot de passe :

`Projectdrc@2026`

Il permet :

- exporter les pointages en CSV ;
- exporter la carte et les compteurs en PNG ;
- supprimer un clic ;
- remettre tous les pointages a zero.

## Supabase

1. Creer un projet Supabase.
2. Ouvrir `SQL Editor`.
3. Executer le contenu de `supabase-schema.sql`.
4. Copier `supabase-config.example.js` vers `supabase-config.js`.
5. Renseigner `url` et `anonKey` dans `supabase-config.js`.

Si `supabase-config.js` reste vide, la page fonctionne en stockage local du navigateur.

Attention : le mot de passe du board est visible dans le code HTML. Pour une publication publique, remplacer les suppressions/remises a zero par une Edge Function Supabase protegee cote serveur.

## Mise en ligne

1. Creer un Google Sheet vide, par exemple `PMI RDC - Carte membres et volontaires`.
2. Ouvrir `Extensions > Apps Script`.
3. Coller le contenu de `Code.gs` dans le fichier `Code.gs`.
4. Creer un fichier HTML nomme `Form` et y coller le contenu de `Form.html`.
5. Executer la fonction `setup()` une premiere fois et autoriser le script.
6. Aller dans `Deploy > New deployment > Web app`.
7. Choisir `Execute as: Me`.
8. Choisir l'acces adapte au chapitre, par exemple `Anyone with the link`.
9. Copier l'URL `/exec` et la partager aux membres et volontaires.

## Regle appliquee

Chaque pointage est bloque si l'email existe deja ou si le PMI ID existe deja dans l'onglet `Pointages`. Un statut `Les deux` ajoute une unite au compteur des membres et une unite au compteur des volontaires.

## Personnalisation

Apres `setup()`, l'onglet `Configuration` permet de changer :

- `CHAPTER_NAME`
- `FORM_TITLE`
- `THEME_COLOR`
- `LOGO_URL`
