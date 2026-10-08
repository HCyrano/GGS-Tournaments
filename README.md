# GGS Tournaments

Site statique de résultats de tournois IA Othello/Reversi : liste des tournois, crosstable et courbe de score cumulé.
Hébergé sur GitHub Pages : https://hcyrano.github.io/GGS-Tournaments/

## Structure

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css` | Page et style |
| `app.js` | Interface et routage (`#/`, `#/archive/AAAA`, `#/t/<id>`) |
| `core.js` | Calcul pur des résultats (aucun accès au DOM) |
| `tournois/index.json` | Liste des tournois (annonces et terminés) |
| `tournois/<id>.txt` | Résultats bruts d'un tournoi |
| `data.js` | Copie de `index.json` + résultats, pour ouvrir `index.html` en `file://` (**généré**, ne pas éditer) |
| `build.py` | Régénère `data.js` |
| `add_tournoi.py` | Ajoute, met à jour ou supprime un tournoi |

## Format du fichier de résultats

Des lignes `round N:` suivies de lignes `r.g joueur1 joueur2 score` :

```
round 1:
1.1 EngineA EngineB +4.0
1.2 EngineC EngineD -2.0
```

- `r.g` : numéro de round, un point, numéro de partie.
- Le score est vu du joueur 1 : positif = victoire du joueur 1, négatif = victoire du joueur 2, `0` = nulle.
- Les noms de joueurs ne doivent pas contenir d'espace.
- Victoire = 1 point, nulle = 0,5, défaite = 0.

## Gérer les tournois avec `add_tournoi.py`

À lancer depuis le dossier du site. Le script met à jour `tournois/index.json`, copie le fichier de résultats dans `tournois/` et relance `build.py` automatiquement.

### 1. Publier une annonce

```bash
python3 add_tournoi.py "Tournoi d'automne" 2026-11-15 \
  --time 15:00 --format s8r14 --rounds 14 \
  --description "6 moteurs, 8 threads max"
```

- `--time` (ou `--heure`) : heure de début **à Paris**, `HH:MM`. Le site l'affiche aussi en heure locale du visiteur.
- `--format` : format du tournoi (ex. `s8r14`).
- `--rounds` : nombre de rounds (entier ≥ 1).
- `--description` : texte libre (contraintes, nombre de moteurs…).

Seuls le nom et la date sont obligatoires ; les champs omis s'affichent « TBA ».

### 2. Ajouter les résultats

```bash
python3 add_tournoi.py "Tournoi d'automne" 2026-11-15 result.txt
```

- Si l'annonce existe déjà (même nom, donc même identifiant), elle passe en « terminé » et garde sa description, son format et son nombre de rounds.
- Le script analyse le fichier et affiche un résumé (nombre de parties, de joueurs, vainqueur). Il refuse un fichier où aucune partie n'est reconnue.
- Il peut aussi ajouter directement un tournoi terminé, sans annonce préalable.

### 3. Modifier ou corriger

Relance la même commande avec les nouvelles valeurs. Les champs non précisés sont conservés.

```bash
python3 add_tournoi.py "Tournoi d'automne" 2026-11-15 --time 16:00
```

Pour remplacer des résultats déjà publiés (ou repasser un tournoi terminé en annonce), ajoute `--force` :

```bash
python3 add_tournoi.py "Tournoi d'automne" 2026-11-15 result_corrige.txt --force
```

### 4. Supprimer

```bash
python3 add_tournoi.py "Tournoi d'automne" --delete
```

Supprime l'entrée et son fichier de résultats.

### Options

| Option | Effet |
|---|---|
| `--id` | Identifiant personnalisé (défaut : nom en minuscules sans accents, séparé par des tirets). Il sert d'URL (`#/t/<id>`) et de nom de fichier. |
| `--force` | Écrase une entrée ou un fichier existant |
| `--delete` | Supprime le tournoi |

Aide complète : `python3 add_tournoi.py --help`

## Mettre à jour le site

Le site se met à jour à chaque `push` sur la branche `main` (GitHub Pages, source : `main`, dossier `/ (racine)`).

```bash
cd /Users/caussebruno/Documents/developpement/site
python3 add_tournoi.py "Tournoi d'automne" 2026-11-15 result.txt   # met aussi à jour data.js
git add .
git commit -m "Résultats Tournoi d'automne"
git push
```

Le déploiement prend une à deux minutes (suivi : onglet **Actions** du dépôt, workflow « pages build and deployment »). Si l'ancienne version s'affiche encore, fais un rechargement forcé (Cmd+Maj+R) : les fichiers sont mis en cache quelques minutes.

Modifier le code (`app.js`, `core.js`, `style.css`, `index.html`) suit la même procédure : commit puis push.

## Tester en local

- **Rapide** : ouvrir `index.html` directement (`file://`). Le site lit alors `data.js`, qu'il faut avoir régénéré (`python3 build.py`, ou n'importe quelle commande de `add_tournoi.py`).
- **Comme en ligne** : `python3 -m http.server` dans le dossier, puis http://localhost:8000. Le site lit alors `tournois/index.json` et les fichiers `.txt` directement.

## Dépannage

- **Page blanche ou « Error: … »** : ouvrir la console du navigateur (Cmd+Option+J).
- **Tournoi absent ou 404 sur `tournois/…`** : GitHub Pages distingue majuscules et minuscules ; le champ `fichier` de `index.json` doit correspondre exactement au nom du fichier.
- **« No games could be parsed »** : le fichier de résultats ne respecte pas le format `r.g joueur1 joueur2 score`.
- **Le tournoi apparaît dans « Upcoming » alors qu'il est terminé** : l'entrée n'a pas de champ `fichier` ; relancer la commande avec le fichier de résultats.