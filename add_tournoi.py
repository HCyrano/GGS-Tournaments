#!/usr/bin/env python3
"""Ajoute ou met à jour un tournoi dans tournois/index.json.

  Annonce :   add_tournoi.py "Tournoi d'automne" 2026-11-15 --time 15:00 --format s8r14 --rounds 14 --description "6 moteurs"
  Résultats : add_tournoi.py "Tournoi d'automne" 2026-11-15 result.txt
              (si l'annonce existe déjà, elle passe en « terminé »)
"""
import argparse, json, re, shutil, subprocess, sys, unicodedata
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TOURNOIS = ROOT / "tournois"
INDEX = TOURNOIS / "index.json"
GAME = re.compile(r"^\s*\d+\.\d+\s+(\S+)\s+(\S+)\s+([+-]?\d+(?:\.\d+)?)\s*$", re.M)  # même regex que core.js


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "tournoi"


def analyse(text):
    pts, n = {}, 0
    for a, b, s in GAME.findall(text):
        n += 1
        pa = 1 if float(s) > 0 else 0 if float(s) < 0 else 0.5
        pts[a] = pts.get(a, 0) + pa
        pts[b] = pts.get(b, 0) + 1 - pa
    return n, pts


def die(msg):
    sys.exit(f"Erreur : {msg}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("nom")
    ap.add_argument("date", nargs="?", help="AAAA-MM-JJ (optionnel si --delete)")
    ap.add_argument("fichier", nargs="?", help="result.txt (absent = annonce)")
    ap.add_argument("--id", help="identifiant (défaut : slug du nom)")
    ap.add_argument("--description")
    ap.add_argument("--time", "--heure", dest="heure",
                    help="heure de début du tournoi, heure de Paris (HH:MM)")
    ap.add_argument("--format", dest="format",
                    help="format du tournoi (ex. s8r14)")
    ap.add_argument("--rounds", type=int,
                    help="nombre de rounds (ex. 14)")
    ap.add_argument("--force", action="store_true", help="écraser une entrée/un fichier existant")
    ap.add_argument("--delete", action="store_true", help="supprimer le tournoi/l'annonce")
    a = ap.parse_args()

    entries = json.loads(INDEX.read_text(encoding="utf-8")) if INDEX.exists() else []
    tid = a.id or slug(a.nom)
    old = next((e for e in entries if e["id"] == tid), None)

    if a.delete:
        if not old:
            die(f"introuvable : « {tid} »")
        entries = [e for e in entries if e["id"] != tid]
        if old.get("fichier"):
            f = TOURNOIS / old["fichier"]
            if f.exists():
                f.unlink()
        INDEX.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Supprimé : {tid}")
        subprocess.run([sys.executable, str(ROOT / "build.py")], check=True)
        return

    if not a.date:
        die("la date est requise sauf en cas de suppression (--delete)")

    try:
        date.fromisoformat(a.date)
    except ValueError:
        die(f"date invalide « {a.date} » (format AAAA-MM-JJ)")

    # Heure de début (heure de Paris)
    heure = a.heure if a.heure is not None else (old or {}).get("heure")
    if heure:
        if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", heure):
            die(f"heure invalide « {heure} » (format HH:MM)")

    # Format et nombre de rounds
    fmt = a.format if a.format is not None else (old or {}).get("format")
    rounds = a.rounds if a.rounds is not None else (old or {}).get("rounds")
    if rounds is not None and rounds < 1:
        die("le nombre de rounds doit être supérieur ou égal à 1")

    entry = {"id": tid, "nom": a.nom, "date": a.date}
    if heure:
        entry["time"] = heure
    if fmt:
        entry["format"] = fmt
    if rounds is not None:
        entry["rounds"] = rounds

    desc = a.description if a.description is not None else (old or {}).get("description")
    if desc:
        entry["description"] = desc

    summary = "annonce"
    if a.fichier:
        src = Path(a.fichier)
        if not src.is_file():
            die(f"fichier introuvable : {src}")
        n, pts = analyse(src.read_text(encoding="utf-8"))
        if n == 0:
            die("aucune partie reconnue dans ce fichier (format attendu : « 1.1 joueur1 joueur2 +3.0 »)")
        dest = TOURNOIS / f"{tid}.txt"
        if old and old.get("fichier") and not a.force:
            die(f"« {tid} » a déjà des résultats ({old['fichier']}). Utilise --force pour les remplacer.")
        if dest.exists() and dest.resolve() != src.resolve() and not a.force and not (old and not old.get("fichier")):
            die(f"{dest.name} existe déjà. Utilise --force ou --id.")
        TOURNOIS.mkdir(exist_ok=True)
        if dest.resolve() != src.resolve():
            shutil.copyfile(src, dest)
        entry["fichier"] = dest.name
        w = max(pts, key=pts.get)
        summary = f"terminé : {n} parties, {len(pts)} joueurs, vainqueur {w} ({pts[w]:g} pts)"
    elif old and not a.force and old.get("fichier"):
        die(f"« {tid} » est déjà terminé. Utilise --force pour le repasser en annonce.")

    if old:
        entries[entries.index(old)] = entry
    else:
        entries.append(entry)
    INDEX.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{'Mis à jour' if old else 'Ajouté'} : {tid} — {summary}")
    subprocess.run([sys.executable, str(ROOT / "build.py")], check=True)

if __name__ == "__main__":
    main()
