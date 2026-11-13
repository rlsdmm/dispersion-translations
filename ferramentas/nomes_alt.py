"""
Busca no MangaDex os outros nomes de cada obra (inglês, português, romaji)
e gera um SQL pra salvar em series.nomes_alt. Esses nomes aparecem na página
da obra ("Também conhecido como") e ajudam quem procura a obra no Google
pelo nome em inglês, por exemplo.

  python ferramentas/nomes_alt.py > nomes_alt.sql   (depois rodar no SQL Editor)
"""
import json
import pathlib
import re
import sys
import time
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
sys.stdout.reconfigure(encoding="utf-8")

obras = {}
for f in ["obras.json", "obras-extra.json", "obras-mangadex.json"]:
    for o in json.loads((RAIZ / "ferramentas" / f).read_text(encoding="utf-8")):
        m = re.search(r"covers/([0-9a-f-]{36})/", o.get("capa", ""))
        if m:
            obras[o["id"]] = (m.group(1), o.get("titulo", ""), o.get("titulo_original", ""))

LINGUAS = ["en", "pt-br", "pt", "ja-ro"]


def limpo(t):
    return re.sub(r"\s+", " ", t).strip()


linhas = []
for i, (sid, (mid, titulo, original)) in enumerate(sorted(obras.items())):
    req = urllib.request.Request(f"https://api.mangadex.org/manga/{mid}", headers={"User-Agent": "dispersion-translations-site"})
    with urllib.request.urlopen(req, timeout=30) as r:
        a = json.load(r)["data"]["attributes"]
    candidatos = [v for k, v in a["title"].items() if k in LINGUAS]
    for alt in a.get("altTitles", []):
        for k, v in alt.items():
            if k in LINGUAS:
                candidatos.append(v)
    vistos = {titulo.lower(), original.lower()}
    nomes = []
    for c in candidatos:
        c = limpo(c)
        if c and "\\u" not in c and not re.search(r"sexual", c, re.I) and c.lower() not in vistos and len(c) <= 120:
            vistos.add(c.lower())
            nomes.append(c)
    nomes = nomes[:8]
    arr = "array[" + ",".join("'" + n.replace("'", "''") + "'" for n in nomes) + "]::text[]"
    linhas.append(f"update public.series set nomes_alt = {arr} where id = '{sid}';")
    print(f"-- {sid}: {' | '.join(nomes)}", file=sys.stderr)
    time.sleep(0.25)

print("alter table public.series add column if not exists nomes_alt text[] not null default '{}';")
print("\n".join(linhas))
