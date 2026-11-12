"""
Importa capítulos em lote direto do PC pro Cloudflare R2.

    python ferramentas/importar.py <id-da-obra> <arquivos ou pastas...> [opções]

Aceita (em qualquer combinação, inclusive uns dentro dos outros):
  - .zip/.rar/.7z/.cbz/.cbr de capítulos (um por capítulo)
  - um arquivo "de fora" com vários capítulos dentro (como o MEGA baixa uma pasta)
  - pastas e subpastas (ex: "Vol.1 (1 a 10)") com os capítulos dentro
  - uma pasta só com imagens = um capítulo (o número vem do nome da pasta)

Opções:
  --data AAAA-MM-DD   data de todos os capítulos (padrão: a data do arquivo .zip)
  --substituir        reenvia capítulos que já estão no site (padrão: pula)
  --sem-webp          envia as imagens como estão
  --so-listar         só mostra o que seria importado

No fim gera supabase/importar/<obra>.sql pra rodar no SQL Editor do Supabase
(é isso que faz os capítulos aparecerem no site).
"""
import argparse, concurrent.futures as cf, datetime as dt, io, json, pathlib, re, shutil, subprocess, sys, tempfile, time, urllib.request

from PIL import Image

RAIZ = pathlib.Path(__file__).resolve().parent.parent
CFG = re.sub(r"(?m)^\s*//.*$", "", (RAIZ / "js" / "config.js").read_text(encoding="utf-8"))  # sem comentários
SUPABASE_URL = re.search(r'supabaseUrl:\s*"([^"]+)"', CFG).group(1)
ANON = re.search(r'supabaseAnonKey:\s*"([^"]+)"', CFG).group(1)
ENVIO = re.search(r'envio:\s*"([^"]+)"', CFG).group(1).rstrip("/")
PUBLICO = re.search(r'publico:\s*"([^"]+)"', CFG).group(1).rstrip("/")
EXT_IMG = re.compile(r"\.(jpe?g|png|webp|gif|bmp|avif)$", re.I)
EXT_ARQ = re.compile(r"\.(zip|cbz|rar|cbr|7z|cb7)$", re.I)
TAR = shutil.which("tar.exe", path=r"C:\Windows\System32") or "tar"  # bsdtar do Windows abre zip, rar e 7z
TIPOS = {"webp": "image/webp", "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif", "avif": "image/avif", "bmp": "image/bmp"}


def chave():
    p = RAIZ / "worker" / ".chave-envio"
    if not p.exists():
        sys.exit("Falta a chave de envio. Rode antes: python worker/criar-chave.py")
    return p.read_text(encoding="utf-8").strip()


def natural(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]


def numero_do_nome(nome):
    base = EXT_ARQ.sub("", pathlib.PurePath(nome).name)
    base = re.sub(r"(\d)_(\d{1,2})$", r"\1.\2", base)  # "Lumine 18_5" = 18.5
    cap = re.search(r"(?:cap(?:[ií]tulo)?|ch(?:apter)?|ep)[ .#_-]*(\d+(?:[.,]\d+)?)", base, re.I)
    todos = re.findall(r"\d+(?:[.,]\d+)?", base)
    n = cap.group(1) if cap else (todos[-1] if todos else None)
    if n is None:
        return None
    v = float(n.replace(",", "."))
    return int(v) if v.is_integer() else v


def num_str(n):
    return str(int(n)) if float(n).is_integer() else str(n)


# ---------- descobrir capítulos ----------
TMP = pathlib.Path(tempfile.mkdtemp(prefix="dt-importar-"))
_cont = [0]


def extrair(arq):
    _cont[0] += 1
    destino = TMP / f"x{_cont[0]}"
    destino.mkdir()
    r = subprocess.run([TAR, "-xf", str(arq), "-C", str(destino)], capture_output=True, text=True)
    if r.returncode:
        erro = r.stderr.strip()[:200]
        if not any(p.is_file() for p in destino.rglob("*")):
            raise RuntimeError(f"não deu pra abrir {arq.name}: {erro}")
        # arquivo com algum pedaço corrompido: usa o que deu pra extrair e avisa
        print(f"  AVISO: {arq.name} veio com erro ({erro}); usando o que deu pra extrair", flush=True)
    return destino


def eh_lixo(p):
    return any(part.startswith(".") or part == "__MACOSX" for part in p.parts)


def capitulos_de(caminhos, data_padrao=None):
    """Devolve [(numero, nome, data, [arquivos de imagem em ordem])]."""
    caps = []
    for c in caminhos:
        p = pathlib.Path(c)
        if eh_lixo(pathlib.Path(p.name)):
            continue
        if p.is_file() and EXT_ARQ.search(p.name):
            data = dt.date.fromtimestamp(p.stat().st_mtime).isoformat()
            pasta = extrair(p)
            dentro = capitulos_de([pasta], data)
            # o mesmo capítulo em duas pastas dentro do arquivo (ex: "Cap7" e "MFG-Cap7"):
            # fica a que tem o nome do arquivo; se nenhuma tiver, a com mais páginas
            stem = EXT_ARQ.sub("", p.name).lower()
            por_num = {}
            for c in dentro:
                atual = por_num.get(c[0])
                if atual is None or (c[1].lower() == stem, len(c[3])) > (atual[1].lower() == stem, len(atual[3])):
                    por_num[c[0]] = c
            if len(por_num) < len(dentro):
                dentro = [c for c in dentro if por_num.get(c[0]) is c]
            tem_arquivos = any(EXT_ARQ.search(x.name) for x in pasta.rglob("*") if x.is_file())
            if len(dentro) == 1 and not tem_arquivos:  # capítulo com as imagens numa pasta lá dentro
                caps.append((numero_do_nome(p.name), p.name, data, dentro[0][3]))
            elif dentro:  # arquivo "de fora" com capítulos dentro
                caps += dentro
            else:
                imgs = imagens_em(pasta)
                if imgs:
                    caps.append((numero_do_nome(p.name), p.name, data, imgs))
        elif p.is_dir():
            filhos = sorted(p.iterdir(), key=lambda x: natural(x.name))
            arqs = [x for x in filhos if x.is_file() and EXT_ARQ.search(x.name)]
            subpastas = [x for x in filhos if x.is_dir() and not eh_lixo(pathlib.Path(x.name))]
            sub = capitulos_de(arqs + subpastas, data_padrao)
            if sub:
                caps += sub
            elif p.parent != TMP:  # pasta só com imagens = um capítulo
                imgs = [x for x in filhos if x.is_file() and EXT_IMG.search(x.name)]
                if imgs:
                    data = data_padrao or dt.date.fromtimestamp(imgs[0].stat().st_mtime).isoformat()
                    caps.append((numero_do_nome(p.name), p.name, data, imgs))
    return caps


def imagens_em(pasta):
    return sorted((x for x in pasta.rglob("*") if x.is_file() and EXT_IMG.search(x.name) and not eh_lixo(x.relative_to(pasta))),
                  key=lambda x: natural(str(x.relative_to(pasta))))


# ---------- imagens ----------
def preparar(nome, bruto, webp=True):
    ext = nome.rsplit(".", 1)[-1].lower()
    ext = "jpg" if ext == "jpeg" else ext
    if not webp:
        return bruto, ext
    try:
        im = Image.open(io.BytesIO(bruto))
        im.load()
        if im.mode not in ("RGB", "L", "RGBA", "LA"):
            im = im.convert("RGBA" if "A" in im.getbands() or im.mode == "P" else "RGB")
        if im.width > 1600:
            im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
        out = io.BytesIO()
        im.save(out, "WEBP", quality=88, method=4)
        if out.tell() < len(bruto) or ext not in ("jpg", "png", "webp"):
            return out.getvalue(), "webp"
    except Exception as e:
        print(f"    (não converteu {nome}: {e})")
    return bruto, ext


def enviar(caminho, dados, ext, k):
    for tentativa in range(1, 5):
        try:
            req = urllib.request.Request(f"{ENVIO}/{caminho}", data=dados, method="PUT",
                                         headers={"Authorization": "Chave " + k, "Content-Type": TIPOS.get(ext, "application/octet-stream"),
                                                  "User-Agent": "DispersionTranslations-importador/1.0"})
            with urllib.request.urlopen(req, timeout=120) as r:
                if r.status == 200:
                    return f"{PUBLICO}/{caminho}"
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "replace")
            if e.code in (400, 403, 413):
                raise RuntimeError(f"{caminho}: {e.code} {msg}")
        except Exception as e:
            if tentativa == 4:
                raise RuntimeError(f"{caminho}: {e}")
        time.sleep(2 * tentativa)
    raise RuntimeError(f"{caminho}: falhou depois de 4 tentativas")


def ja_publicados(obra):
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/capitulos?select=numero&serie_id=eq.{obra}",
                                 headers={"apikey": ANON, "Authorization": "Bearer " + ANON})
    with urllib.request.urlopen(req, timeout=30) as r:
        return {float(x["numero"]) for x in json.load(r)}


def importar_lote(series=(), capitulos=()):
    """Grava obras/capítulos no Supabase pela função importar_lote (protegida pela chave)."""
    corpo = json.dumps({"p_chave": chave(), "p_series": list(series), "p_capitulos": list(capitulos)}).encode()
    for tentativa in range(1, 4):
        try:
            req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/rpc/importar_lote", data=corpo, method="POST",
                                         headers={"apikey": ANON, "Authorization": "Bearer " + ANON, "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            raise RuntimeError("Supabase: " + e.read().decode("utf-8", "replace"))
        except Exception:
            if tentativa == 3:
                raise
            time.sleep(3)


def sql_texto(s):
    return "'" + s.replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("obra")
    ap.add_argument("caminhos", nargs="+")
    ap.add_argument("--data")
    ap.add_argument("--substituir", action="store_true")
    ap.add_argument("--sem-webp", action="store_true")
    ap.add_argument("--so-listar", action="store_true")
    ap.add_argument("--threads", type=int, default=8)
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    sys.stderr.reconfigure(encoding="utf-8")

    caps = capitulos_de(a.caminhos)
    if not caps:
        sys.exit("Nenhum capítulo encontrado (nenhuma imagem nos arquivos).")
    if len(caps) == 1 and caps[0][0] is None:  # one-shot: um capítulo só, sem número no nome
        caps = [(1,) + tuple(caps[0][1:])]
    sem_num = [c[1] for c in caps if c[0] is None]
    if sem_num:
        sys.exit("Sem número de capítulo no nome: " + ", ".join(sem_num))
    # mesmo capítulo duas vezes com as mesmas imagens (cópia repetida na pasta): fica um só
    vistos, unicos = set(), []
    for c in caps:
        assinatura = (float(c[0]), tuple(x.stat().st_size for x in c[3]))
        if assinatura not in vistos:
            vistos.add(assinatura)
            unicos.append(c)
    caps = unicos
    nums = [c[0] for c in caps]
    dup = {n for n in nums if nums.count(n) > 1}
    if dup:
        sys.exit("Números repetidos: " + ", ".join(map(num_str, sorted(dup))))
    caps.sort(key=lambda c: c[0])

    existentes = ja_publicados(a.obra)
    print(f"{a.obra}: {len(caps)} capítulos encontrados ({len(existentes)} já no site)")
    if a.so_listar:
        for n, nome, data, imgs in caps:
            print(f"  cap {num_str(n):>6}  {data}  {len(imgs):>3} págs  {nome}{'  (já no site)' if float(n) in existentes else ''}")
        return

    k = chave()
    saida = RAIZ / "supabase" / "importar"
    saida.mkdir(parents=True, exist_ok=True)
    arq_sql = saida / f"{a.obra}.sql"
    linhas_sql = []
    total_bytes = 0
    t0 = time.time()

    with cf.ThreadPoolExecutor(a.threads) as pool:
        for n, nome, data, imgs in caps:
            if float(n) in existentes and not a.substituir:
                print(f"  cap {num_str(n)}: já no site, pulado")
                continue
            if not imgs:
                print(f"  cap {num_str(n)}: NENHUMA imagem em {nome}, pulado")
                continue
            pasta = f"paginas/{a.obra}/{num_str(n)}"

            def tarefa(item):
                idx, arq = item
                dados, ext = preparar(arq.name, arq.read_bytes(), not a.sem_webp)
                return enviar(f"{pasta}/{idx + 1:03d}.{ext}", dados, ext, k), len(dados)

            res = list(pool.map(tarefa, enumerate(imgs)))
            urls = [u for u, _ in res]
            tam = sum(b for _, b in res)
            total_bytes += tam
            d = a.data or data
            arr = "array[" + ",".join(sql_texto(u) for u in urls) + "]"
            linhas_sql.append(f"({sql_texto(a.obra)}, {num_str(n)}, {sql_texto(d)}, {arr})")
            # grava o SQL a cada capítulo, pra não perder nada se parar no meio
            arq_sql.write_text(
                "insert into public.capitulos (serie_id, numero, data, paginas) values\n" + ",\n".join(linhas_sql) +
                "\non conflict (serie_id, numero) do update set paginas = excluded.paginas, data = excluded.data;\n",
                encoding="utf-8")
            # publica no site na hora
            importar_lote(capitulos=[{"serie_id": a.obra, "numero": n, "data": d, "paginas": urls}])
            print(f"  cap {num_str(n)}: {len(urls)} páginas, {tam / 1048576:.1f} MB  ({time.time() - t0:.0f}s)")

    print(f"\nPronto: {len(linhas_sql)} capítulos publicados, {total_bytes / 1048576:.1f} MB enviados.")
    if linhas_sql:
        print(f"(cópia do SQL em {arq_sql})")


if __name__ == "__main__":
    try:
        main()
    finally:
        shutil.rmtree(TMP, ignore_errors=True)
