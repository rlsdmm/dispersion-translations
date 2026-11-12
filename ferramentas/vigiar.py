"""
Vigia a pasta de Downloads e importa cada .zip do MEGA assim que termina de baixar.

    python -I ferramentas/vigiar.py [pasta-de-downloads] [obras.json ...]

Casa o nome do zip com o campo "pasta" de ferramentas/obras.json, roda importar.py
e apaga o zip depois que deu certo. Registra o andamento em ferramentas/vigiar.log.
"""
import json, pathlib, re, subprocess, sys, time

AQUI = pathlib.Path(__file__).resolve().parent
DOWN = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path.home() / "Downloads")
LOG = AQUI / "vigiar.log"
arqs = sys.argv[2:] or [AQUI / "obras.json"]
obras = [o for a in arqs for o in json.loads(pathlib.Path(a).read_text(encoding="utf-8"))]


def norm(t):
    return re.sub(r"[^a-z0-9]+", "", t.lower())


por_nome = {norm(o["pasta"]): o["id"] for o in obras if o.get("pasta")}


def log(*a):
    linha = time.strftime("%H:%M:%S ") + " ".join(str(x) for x in a)
    print(linha, flush=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(linha + "\n")


def obra_de(zipf):
    stem = re.sub(r"\s*\(\d+\)$", "", zipf.stem)
    return por_nome.get(norm(stem))


feitos, tamanhos = set(), {}
log("vigiando", DOWN)
while True:
    for z in sorted(DOWN.glob("*.zip")):
        if z in feitos:
            continue
        oid = obra_de(z)
        if not oid:
            continue
        try:
            t = z.stat().st_size
        except OSError:
            continue
        if tamanhos.get(z) != t:  # ainda mudando (ou visto agora): espera estabilizar
            tamanhos[z] = t
            continue
        feitos.add(z)
        log("importando", z.name, "->", oid, f"({t // 1048576} MB)")
        r = subprocess.run([sys.executable, "-I", str(AQUI / "importar.py"), oid, str(z)],
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        with LOG.open("a", encoding="utf-8") as f:
            f.write(r.stdout[-4000:] + r.stderr[-4000:] + "\n")
        if r.returncode == 0:
            z.unlink(missing_ok=True)
            log("ok", oid, "(zip apagado)")
        else:
            log("ERRO", oid, "código", r.returncode, r.stderr.strip()[-300:])
    time.sleep(20)
