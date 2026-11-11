"""
Cadastra (ou atualiza) obras a partir de um JSON, com capa enviada pro R2.

    python ferramentas/obras.py ferramentas/obras.json [id1 id2 ...]

Cada item do JSON:
  { "id": "hinowa-ga-yuku", "titulo": "...", "titulo_original": "...", "autor": "...",
    "generos": ["Ação", ...], "status": "Completo", "sinopse": "...", "capa": "https://... ou caminho" }

Gera supabase/importar/obras.sql pra rodar no SQL Editor do Supabase.
"""
import io, json, pathlib, sys, time, urllib.request

from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from importar import RAIZ, chave, enviar, importar_lote, sql_texto  # noqa: E402


def baixar(origem):
    if origem.startswith("http"):
        req = urllib.request.Request(origem, headers={"User-Agent": "DispersionTranslations-site/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read()
    return pathlib.Path(origem).read_bytes()


def capa_webp(bruto):
    im = Image.open(io.BytesIO(bruto)).convert("RGB")
    if im.width > 800:
        im = im.resize((800, round(im.height * 800 / im.width)), Image.LANCZOS)
    out = io.BytesIO()
    im.save(out, "WEBP", quality=90, method=4)
    return out.getvalue()


def main():
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    obras = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
    so = set(sys.argv[2:])
    k = chave()
    valores = []
    for o in obras:
        if so and o["id"] not in so:
            continue
        capa_url = None
        if o.get("capa"):
            capa_url = enviar(f"capas/{o['id']}-{int(time.time())}.webp", capa_webp(baixar(o["capa"])), "webp", k)
        importar_lote(series=[{**{c: o.get(c) for c in ("id", "titulo", "titulo_original", "autor", "generos", "status", "sinopse")},
                               "capa_url": capa_url}])
        arr = "array[" + ",".join(sql_texto(g) for g in o.get("generos", [])) + "]::text[]"
        nulo = lambda v: sql_texto(v) if v else "null"  # noqa: E731
        valores.append(f"({sql_texto(o['id'])}, {sql_texto(o['titulo'])}, {nulo(o.get('titulo_original'))}, {nulo(o.get('autor'))}, "
                       f"{arr}, {sql_texto(o.get('status') or 'Em andamento')}, {nulo(o.get('sinopse'))}, {nulo(capa_url)})")
        print("ok:", o["titulo"], "(com capa)" if capa_url else "")
    sql = ("insert into public.series (id, titulo, titulo_original, autor, generos, status, sinopse, capa_url) values\n" +
           ",\n".join(valores) +
           "\non conflict (id) do update set titulo = excluded.titulo, titulo_original = excluded.titulo_original,"
           " autor = excluded.autor, generos = excluded.generos, status = excluded.status, sinopse = excluded.sinopse,"
           " capa_url = coalesce(excluded.capa_url, series.capa_url);\n")
    destino = RAIZ / "supabase" / "importar" / "obras.sql"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(sql, encoding="utf-8")
    print("Agora rode no Supabase (SQL Editor):", destino)


if __name__ == "__main__":
    main()
