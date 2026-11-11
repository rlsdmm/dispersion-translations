"""
Cria a chave de envio do script de importação e guarda no Worker.

Rode uma vez, na pasta do projeto:
    python worker/criar-chave.py

- Gera uma chave aleatória e salva em worker/.chave-envio (fica só no seu PC, não vai pro GitHub)
- Guarda a mesma chave como segredo CHAVE_ENVIO no Worker da Cloudflare
- Publica o Worker de novo

Pra trocar a chave (ex: se vazar), é só rodar de novo.
"""
import pathlib, secrets, subprocess, sys

pasta = pathlib.Path(__file__).resolve().parent
chave = secrets.token_urlsafe(40)
(pasta / ".chave-envio").write_text(chave, encoding="utf-8")

npx = "npx.cmd" if sys.platform == "win32" else "npx"
print("Guardando a chave no Worker…")
r = subprocess.run([npx, "wrangler@4", "secret", "put", "CHAVE_ENVIO"], cwd=pasta, input=chave, text=True)
if r.returncode:
    sys.exit("Não deu pra guardar a chave no Worker.")
print("Publicando o Worker…")
r = subprocess.run([npx, "wrangler@4", "deploy"], cwd=pasta)
sys.exit(r.returncode)
