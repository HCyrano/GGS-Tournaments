#!/usr/bin/env python3
"""Génère data.js (liste + textes des tournois) pour ouvrir index.html en file://."""
import json, pathlib
d = pathlib.Path(__file__).parent / "tournois"
lst = json.loads((d / "index.json").read_text(encoding="utf-8"))
texts = {t["id"]: (d / t["fichier"]).read_text(encoding="utf-8") for t in lst if t.get("fichier")}
out = pathlib.Path(__file__).parent / "data.js"
out.write_text("window.TOURNOIS_DATA = " + json.dumps({"list": lst, "texts": texts}, ensure_ascii=False) + ";\n", encoding="utf-8")
print(f"data.js : {len(lst)} tournoi(s), {out.stat().st_size} octets")
