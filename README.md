# Site tournois Othello

Ajouter un tournoi :
0. (optionnel, pour double-clic en file://) `python3 build.py` après les étapes 1-2
1. Copier `result.txt` dans `tournois/` (ex. `2026-11-xxx.txt`)
2. Ajouter une entrée dans `tournois/index.json`
3. `git push`

Test local : `python3 -m http.server` puis http://localhost:8000
(en file://, `fetch` est bloqué : utiliser `python3 build.py`, qui génère data.js).

Déploiement : GitHub Pages (Settings > Pages > branche main, dossier racine).

Annoncer un tournoi à venir : ajouter dans `tournois/index.json` une entrée **sans** `fichier` :
`{"id": "automne", "nom": "...", "date": "2026-11-15", "description": "..."}`
Une fois joué, ajouter `"fichier": "xxx.txt"` : il passe automatiquement dans « Terminés ».

Script d'ajout (met à jour index.json, copie le fichier, régénère data.js) :
`python3 add_tournoi.py "Nom" 2026-11-15 [result.txt] [--description "..."]`
Sans fichier : annonce. Avec fichier : terminé (une annonce existante passe en « terminé »).
