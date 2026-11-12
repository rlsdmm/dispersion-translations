"""
Baixa as capas de cada volume das obras no MangaDex, envia pro R2 e gera dados/volumes.json
(é o que a página da obra usa pra mostrar a seção "Capas").

    python -I ferramentas/volumes.py [id1 id2 ...]

O id do mangá no MangaDex vem do link da capa em ferramentas/obras*.json.
Pra cada volume fica uma capa só: a japonesa, se tiver; senão a em inglês; senão qualquer uma.
Rodar de novo só baixa as capas que ainda não foram enviadas.
"""
import concurrent.futures as cf, json, pathlib, re, sys, time, urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from importar import RAIZ, chave, enviar  # noqa: E402
from obras import baixar  # noqa: E402

from PIL import Image  # noqa: E402
import io  # noqa: E402

UA = {"User-Agent": "DispersionTranslations-site/1.0"}
DESTINO = RAIZ / "dados" / "volumes.json"
PREFERENCIA = ["ja", "en", "pt-br"]


def api(url):
    for tentativa in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code != 429 or tentativa == 3:
                raise
            time.sleep(3 * (tentativa + 1))


def capas_do_manga(manga):
    todas, offset = [], 0
    while True:
        d = api(f"https://api.mangadex.org/cover?manga[]={manga}&limit=100&offset={offset}&order[volume]=asc")
        todas += d["data"]
        offset += 100
        if offset >= d["total"]:
            break
        time.sleep(0.3)
    por_vol = {}
    for c in todas:
        a = c["attributes"]
        vol = (a.get("volume") or "").strip()
        if not vol:
            continue
        rank = PREFERENCIA.index(a.get("locale")) if a.get("locale") in PREFERENCIA else len(PREFERENCIA)
        atual = por_vol.get(vol)
        if atual is None or rank < atual[0]:
            por_vol[vol] = (rank, c["id"], a["fileName"], a.get("locale"))

    def chave_vol(v):
        try:
            return (0, float(v), v)
        except ValueError:
            return (1, 0, v)
    return [(v, *por_vol[v][1:]) for v in sorted(por_vol, key=chave_vol)]


def webp(bruto):
    im = Image.open(io.BytesIO(bruto)).convert("RGB")
    if im.width > 700:
        im = im.resize((700, round(im.height * 700 / im.width)), Image.LANCZOS)
    out = io.BytesIO()
    im.save(out, "WEBP", quality=85, method=4)
    return out.getvalue()


def main():
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    so = set(sys.argv[1:])
    obras = []
    for f in sorted((RAIZ / "ferramentas").glob("obras*.json")):
        obras += json.loads(f.read_text(encoding="utf-8"))
    atual = json.loads(DESTINO.read_text(encoding="utf-8")) if DESTINO.exists() else {}
    k = chave()
    for o in obras:
        if so and o["id"] not in so:
            continue
        m = re.search(r"mangadex\.org/covers/([0-9a-f-]{36})/", o.get("capa") or "")
        if not m:
            print("sem id do MangaDex:", o["id"])
            continue
        try:
            lista = capas_do_manga(m.group(1))
        except Exception as e:
            print("ERRO", o["id"], e)
            continue
        ja = {x["cover"]: x for x in atual.get(o["id"], [])}

        def tarefa(item):
            vol, cid, arq, loc = item
            if cid in ja:
                return {**ja[cid], "v": vol}
            bruto = baixar(f"https://uploads.mangadex.org/covers/{m.group(1)}/{arq}")
            url = enviar(f"capas/{o['id']}-vol-{cid}.webp", webp(bruto), "webp", k)
            return {"v": vol, "url": url, "cover": cid, "loc": loc}

        with cf.ThreadPoolExecutor(6) as ex:
            res = list(ex.map(tarefa, lista))
        if res:
            atual[o["id"]] = res
        else:
            atual.pop(o["id"], None)
        novas = sum(1 for r in res if r["cover"] not in ja)
        print(f"{o['id']}: {len(res)} volumes ({novas} novas)")
        DESTINO.parent.mkdir(parents=True, exist_ok=True)
        DESTINO.write_text(json.dumps(atual, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        time.sleep(0.3)
    print("Pronto:", DESTINO)


if __name__ == "__main__":
    main()
