"""
Gera uma página pronta (HTML estático) pra cada obra: obra/<id>.html

O Google lê essas páginas na hora, sem precisar rodar o código do site:
título, nomes alternativos, autor, gêneros, sinopse e a lista de capítulos
já vêm escritos no HTML. Pra quem abre no navegador, a página funciona igual
ao serie.html (o mesmo código roda por cima e deixa tudo interativo).

  python ferramentas/obras_estaticas.py

O GitHub Actions (.github/workflows/sitemap.yml) roda isso sozinho.
Obra nova que ainda não tem página: o 404.html manda pro serie.html?s=<id>.
"""
import html
import json
import pathlib
import re
import sys
import urllib.request

SITE = "https://dispersiontl.com.br"
RAIZ = pathlib.Path(__file__).resolve().parent.parent
PASTA = RAIZ / "obra"

cfg = (RAIZ / "js" / "config.js").read_text(encoding="utf-8")
URL = re.search(r'supabaseUrl:\s*"([^"]+)"', cfg).group(1)
KEY = re.search(r'supabaseAnonKey:\s*"([^"]+)"', cfg).group(1)


def buscar(tabela, campos, ordem, filtro=""):
    linhas, de = [], 0
    while True:
        req = urllib.request.Request(
            f"{URL}/rest/v1/{tabela}?select={campos}&order={ordem}{filtro}",
            headers={"apikey": KEY, "Authorization": f"Bearer {KEY}", "Range": f"{de}-{de + 999}"},
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            bloco = json.load(r)
        linhas += bloco
        if len(bloco) < 1000:
            return linhas
        de += 1000


e = lambda t: html.escape(str(t or ""), quote=True)


def num(n):
    n = float(n)
    return str(int(n)) if n == int(n) else str(n)


def data_br(d):
    return f"{d[8:10]}/{d[5:7]}/{d[0:4]}" if d and len(d) >= 10 else ""


def pagina(modelo, s, caps):
    sid, titulo = s["id"], s["titulo"]
    nomes = [n for n in (s.get("nomes_alt") or []) if n]
    latino = next((n for n in nomes if re.fullmatch(r"[\x20-\x7EÀ-ÿ’]+", n) and len(n) <= 60), None)
    autor = s.get("autor") or ""
    sinopse = re.sub(r"\s+", " ", s.get("sinopse") or "").strip()
    n = len(caps)
    desc = (f"Ler {titulo}{f' ({latino})' if latino else ''} em português (PT-BR), online e grátis. "
            f"Mangá{' de ' + autor if autor else ''} traduzido por fãs, {n} {'capítulo' if n == 1 else 'capítulos'}. {sinopse}")[:300]
    url = f"{SITE}/obra/{sid}.html"
    capa = s.get("capa_url") or f"{SITE}/og.png"
    t_pagina = f"{titulo} em Português | Ler Mangá Online · Dispersion Translations"

    ld = {
        "@context": "https://schema.org", "@type": "ComicSeries", "name": titulo, "url": url,
        "alternateName": [x for x in [s.get("titulo_original"), *nomes] if x],
        "genre": s.get("generos") or [], "image": capa, "description": sinopse, "inLanguage": "pt-BR",
        "publisher": {"@type": "Organization", "name": "Dispersion Translations", "url": SITE + "/"},
    }
    if autor:
        ld["author"] = [{"@type": "Person", "name": a.strip()} for a in autor.split(",") if a.strip()]

    h = modelo
    h = h.replace("<title>Obra · Dispersion Translations</title>", f"<title>{e(t_pagina)}</title>", 1)
    h = re.sub(r'<meta name="description" content="[^"]*" />', f'<meta name="description" content="{e(desc)}" />', h, 1)
    h = re.sub(r'<meta property="og:title" content="[^"]*" />', f'<meta property="og:title" content="{e(titulo)} · Dispersion Translations" />', h, 1)
    h = re.sub(r'<meta property="og:description" content="[^"]*" />', f'<meta property="og:description" content="{e(desc)}" />', h, 1)
    h = re.sub(r'<meta property="og:image" content="[^"]*" />', f'<meta property="og:image" content="{e(capa)}" />', h, 1)
    h = re.sub(r'\s*<meta property="og:image:width"[^\n]*', "", h, 1)
    h = re.sub(r'\s*<meta property="og:image:height"[^\n]*', "", h, 1)
    extra = (f'\n  <meta property="og:url" content="{e(url)}" />\n  <link rel="canonical" href="{e(url)}" />'
             f'\n  <script type="application/ld+json">{json.dumps(ld, ensure_ascii=False).replace("</", "<\\/")}</script>')
    h = h.replace('<meta name="twitter:site" content="@DispersionTL" />', '<meta name="twitter:site" content="@DispersionTL" />' + extra, 1)
    # tudo relativo à raiz do site (a página fica em /obra/)
    h = h.replace('<meta charset="utf-8" />', '<meta charset="utf-8" />\n  <base href="/" />', 1)

    # conteúdo já escrito no HTML (o código do site substitui por cima ao carregar)
    tags = f'<a class="tag status" href="index.html?status={e(s.get("status"))}#obras">{e(s.get("status"))}</a>' + "".join(
        f'<a class="tag" href="index.html?genero={e(g)}#obras">{e(g)}</a>' for g in (s.get("generos") or []))
    lista = "".join(
        f'<a href="ler.html?s={e(sid)}&amp;c={num(c["numero"])}"><span><span class="n">Capítulo {num(c["numero"])}</span>'
        f'{f"<span class=\"t\">{e(c.get("titulo"))}</span>" if c.get("titulo") else ""}</span><span class="d">{data_br(c.get("data"))}</span></a>'
        for c in sorted(caps, key=lambda c: float(c["numero"]), reverse=True))
    pronto = f'''<div id="conteudo">
    <div class="serie-topo">
      <div class="fundo" style="background-image:url('{e(capa)}')"></div>
      <div class="wrap">
        <img class="capa-g" src="{e(capa)}" alt="{e(titulo)}" />
        <div>
          <h1>{e(titulo)}</h1>
          {f'<div class="original">{e(s.get("titulo_original"))} · {e(autor)}</div>' if s.get("titulo_original") else ""}
          {f'<div class="nomes-alt"><span>Também conhecido como</span> {" · ".join(e(x) for x in nomes)}</div>' if nomes else ""}
          <div class="tags">{tags}</div>
          <p class="sinopse">{e(sinopse)}</p>
          <div class="botoes">{f'<a class="btn pri" href="ler.html?s={e(sid)}&amp;c={num(min(float(c["numero"]) for c in caps))}">Começar a ler</a>' if caps else ""}</div>
        </div>
      </div>
    </div>
    <main class="wrap">
      <section class="aba">
        <div class="titulo-sec"><h2>Capítulos ({n})</h2></div>
        <div class="lista-caps">{lista or '<p class="vazio">Nenhum capítulo ainda. Em breve!</p>'}</div>
      </section>
    </main>
  </div>'''
    h = re.sub(r'<div id="conteudo"></div>', lambda m: pronto, h, 1)
    h = h.replace("  <script>\n    const { esc, serie,", f'  <script>window.OBRA_ID = {json.dumps(sid)};</script>\n  <script>\n    const {{ esc, serie,', 1)
    assert "window.OBRA_ID" in h, "não achei onde colocar o OBRA_ID"
    return h


def main():
    modelo = (RAIZ / "serie.html").read_text(encoding="utf-8").replace("\r\n", "\n")
    series = buscar("series", "id,titulo,titulo_original,autor,generos,status,sinopse,capa_url,nomes_alt", "id")
    caps = buscar("capitulos", "serie_id,numero,titulo,data", "id")
    por_obra = {}
    for c in caps:
        por_obra.setdefault(c["serie_id"], []).append(c)
    PASTA.mkdir(exist_ok=True)
    feitos = set()
    for s in series:
        arq = PASTA / f"{s['id']}.html"
        arq.write_text(pagina(modelo, s, por_obra.get(s["id"], [])), encoding="utf-8", newline="\n")
        feitos.add(arq.name)
    # obra que saiu do site: apaga a página dela
    for velho in PASTA.glob("*.html"):
        if velho.name not in feitos:
            velho.unlink()
    print(f"{len(feitos)} páginas de obra geradas em obra/")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
