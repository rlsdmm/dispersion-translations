"""
Gera o sitemap.xml (a lista de páginas que o Google deve visitar).

  python ferramentas/sitemap.py

Lê as obras e as datas dos capítulos direto do Supabase (com a chave pública
do js/config.js) e escreve sitemap.xml na raiz do site. O GitHub Actions
(.github/workflows/sitemap.yml) roda isso sozinho todo dia, então em geral
não precisa rodar na mão.
"""
import json
import pathlib
import re
import urllib.request
from xml.sax.saxutils import escape

SITE = "https://dispersiontl.com.br"
RAIZ = pathlib.Path(__file__).resolve().parent.parent

cfg = (RAIZ / "js" / "config.js").read_text(encoding="utf-8")
URL = re.search(r'supabaseUrl:\s*"([^"]+)"', cfg).group(1)
KEY = re.search(r'supabaseAnonKey:\s*"([^"]+)"', cfg).group(1)


def buscar(tabela, campos, ordem):
    linhas, de = [], 0
    while True:
        req = urllib.request.Request(
            f"{URL}/rest/v1/{tabela}?select={campos}&order={ordem}",
            headers={"apikey": KEY, "Authorization": f"Bearer {KEY}", "Range": f"{de}-{de + 999}"},
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            bloco = json.load(r)
        linhas += bloco
        if len(bloco) < 1000:
            return linhas
        de += 1000


series = buscar("series", "id,criado_em", "id")
caps = buscar("capitulos", "serie_id,data", "id")

ultima = {}
for c in caps:
    if c.get("data") and c["data"] > ultima.get(c["serie_id"], ""):
        ultima[c["serie_id"]] = c["data"]
geral = max(ultima.values(), default=None)

urls = [
    (f"{SITE}/", geral, "1.0"),
    (f"{SITE}/apoie.html", None, "0.5"),
    (f"{SITE}/privacidade.html", None, "0.2"),
]
for s in series:
    data = ultima.get(s["id"]) or (s.get("criado_em") or "")[:10] or None
    urls.append((f"{SITE}/serie.html?s={s['id']}", data, "0.8"))

xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for loc, data, prio in urls:
    xml.append(f"  <url><loc>{escape(loc)}</loc>" + (f"<lastmod>{data}</lastmod>" if data else "") + f"<priority>{prio}</priority></url>")
xml.append("</urlset>\n")

(RAIZ / "sitemap.xml").write_text("\n".join(xml), encoding="utf-8", newline="\n")
print(f"sitemap.xml: {len(urls)} páginas ({len(series)} obras)")
