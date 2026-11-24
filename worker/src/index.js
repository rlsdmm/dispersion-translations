/*
 * Dispersion Translations — envio de imagens pro Cloudflare R2
 *
 * PUT    /<caminho>        envia um arquivo (só membros do grupo)
 * POST   /apagar           { "chaves": ["paginas/...", ...] } apaga arquivos (só membros)
 * GET    /<caminho>        serve o arquivo (reserva; o site lê pelo domínio público do bucket)
 *
 * Avisos do pet por e-mail (Resend), supabase/pets-avisos.sql:
 * - roda sozinho 2x por dia (Cron Trigger, ver wrangler.toml)
 * POST   /avisos-pet       roda na hora (header "Authorization: Chave <CHAVE_AVISOS>")
 * GET    /parar-avisos?t=  link "não quero mais receber" do e-mail
 *
 * Quem é membro é decidido pelo Supabase: o site manda o token de login
 * e o Worker pergunta ao Supabase (função is_membro) se aquela conta é do grupo.
 */

// paginas/<obra>/<capitulo>/001.webp   ou   capas/<obra>-<data>.webp
// capítulo antecipado (VIP) vai numa pasta com sufixo aleatório: paginas/obra/12-k3j9x2ab/001.webp
const CAMINHO_OK = /^(paginas\/[a-z0-9][a-z0-9-]*\/[0-9]+(\.[0-9]+)?(-[a-z0-9]{8,32})?\/[0-9]{3,4}|capas\/[a-z0-9][a-z0-9-]*)\.(webp|jpe?g|png|gif|avif)$/;
const TIPOS = { webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", avif: "image/avif" };
const MAX_BYTES = 25 * 1024 * 1024;

// guarda por alguns minutos quem já foi conferido, pra não perguntar ao Supabase a cada página
const conferidos = new Map();

function cors(env, req) {
  const origem = req.headers.get("Origin") || "";
  const permitidas = (env.ORIGENS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = permitidas.includes(origem);
  return {
    "Access-Control-Allow-Origin": ok ? origem : permitidas[0] || "*",
    "Access-Control-Allow-Methods": "GET, HEAD, PUT, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

const resposta = (corpo, status, headers) =>
  new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), {
    status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });

// comparação em tempo constante (pra chave de envio do script local)
function iguais(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function ehMembro(env, auth) {
  // script de importação no PC do admin (chave guardada como segredo do Worker)
  if (auth && auth.startsWith("Chave ") && env.CHAVE_ENVIO) return iguais(auth.slice(6), env.CHAVE_ENVIO);
  if (!auth || !auth.startsWith("Bearer ")) return false;
  const agora = Date.now();
  const c = conferidos.get(auth);
  if (c && c.ate > agora) return c.ok;
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/is_membro`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_ANON, Authorization: auth, "Content-Type": "application/json" },
    body: "{}",
  });
  const ok = r.ok && (await r.json()) === true;
  conferidos.set(auth, { ok, ate: agora + 5 * 60 * 1000 });
  if (conferidos.size > 500) conferidos.clear();
  return ok;
}

/* ============ AVISOS DO PET POR E-MAIL ============ */
const SITE = "https://dispersiontl.com.br";
const NOMES_ESPECIE = { bolinho: "Bolinho", pipoca: "Pipoca", mochi: "Mochi", nuvem: "Nuvenzinha", brotinho: "Brotinho", estrelinha: "Estrelinha", nanquim: "Nanquim", draguinho: "Draguinho" };
const escH = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function rpc(env, nome, args) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_ANON, Authorization: `Bearer ${env.SUPABASE_ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`${nome}: ${r.status} ${await r.text()}`);
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

function emailDoPet(env, x, base) {
  const nome = x.nome || NOMES_ESPECIE[x.especie] || "seu pet";
  const fome = x.barriga < 20, triste = x.alegria < 30;
  const estado = fome && triste ? "está com fome e tristinho" : fome ? "está com fome" : "está tristinho";
  const parar = `${base}/parar-avisos?t=${x.token}`;
  const assunto = `${fome ? "🍙" : "🥺"} ${nome} ${estado}!`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f1fa;font-family:Arial,Helvetica,sans-serif;color:#2b1d2e">
  <div style="max-width:480px;margin:0 auto;padding:28px 18px">
    <div style="background:#fff;border-radius:16px;padding:28px 24px;text-align:center;border:1px solid #e6def3">
      <div style="font-size:54px;line-height:1">${fome ? "🍙" : "💕"}</div>
      <h1 style="font-size:22px;margin:14px 0 8px">${escH(nome)} ${escH(estado)}!</h1>
      <p style="font-size:15px;line-height:1.5;margin:0 0 6px;color:#4a3d52">Oi${x.apelido ? ", " + escH(x.apelido) : ""}! ${escH(nome)} tá com saudade de você.</p>
      <p style="font-size:14px;line-height:1.5;margin:0 0 20px;color:#6b5d73">🍽️ Barriga: <b>${x.barriga}%</b> &nbsp;·&nbsp; 💖 Felicidade: <b>${x.alegria}%</b></p>
      <a href="${SITE}/pet.html" style="display:inline-block;background:#7c4dff;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:10px">Cuidar de ${escH(nome)}</a>
      <p style="font-size:13px;color:#8a7d92;margin:18px 0 0">Terminar um capítulo também vale petisco! 📖</p>
    </div>
    <p style="font-size:12px;color:#8a7d92;text-align:center;margin:16px 0 0;line-height:1.5">
      Você recebeu este e-mail porque tem um pet na <a href="${SITE}" style="color:#7c4dff">Dispersion Translations</a>.<br>
      <a href="${parar}" style="color:#8a7d92">Não quero mais receber estes avisos</a></p>
  </div></body></html>`;
  const texto = `${nome} ${estado}!\n\nBarriga: ${x.barriga}% · Felicidade: ${x.alegria}%\nCuidar: ${SITE}/pet.html\n\nNão quer mais receber? ${parar}`;
  return { assunto, html, texto, parar };
}

async function rodarAvisos(env, base) {
  if (!env.RESEND_KEY || !env.CHAVE_AVISOS) return { erro: "Faltam os segredos RESEND_KEY e/ou CHAVE_AVISOS no Worker." };
  const lista = (await rpc(env, "pets_para_avisar", { p_chave: env.CHAVE_AVISOS })) || [];
  let enviados = 0;
  const erros = [];
  for (const x of lista) {
    const m = emailDoPet(env, x, base);
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.EMAIL_DE || "Dispersion Translations <pet@dispersiontl.com.br>",
        to: [x.email], subject: m.assunto, html: m.html, text: m.texto,
        headers: { "List-Unsubscribe": `<${m.parar}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      }),
    });
    if (r.ok) {
      enviados++;
      await rpc(env, "marcar_aviso_pet", { p_chave: env.CHAVE_AVISOS, p_user: x.user_id });
    } else erros.push(`${r.status} ${(await r.text()).slice(0, 200)}`);
    await new Promise((ok) => setTimeout(ok, 600)); // o Resend aceita ~2 por segundo
  }
  return { na_fila: lista.length, enviados, erros };
}

function paginaSimples(titulo, texto) {
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escH(titulo)}</title></head>
  <body style="margin:0;background:#0f0c18;color:#eee;font-family:system-ui,Arial,sans-serif;display:grid;place-items:center;min-height:100vh;padding:20px;box-sizing:border-box">
  <div style="max-width:420px;text-align:center"><h1 style="font-size:22px">${escH(titulo)}</h1><p style="color:#bbb;line-height:1.5">${texto}</p>
  <a href="${SITE}/pet.html" style="color:#a78bfa">Ir pra página do pet</a></div></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export default {
  async scheduled(evento, env, ctx) {
    ctx.waitUntil(rodarAvisos(env, env.URL_WORKER || "https://dispersion-imagens.meu-streamable.workers.dev")
      .then((r) => console.log("avisos do pet:", JSON.stringify(r))));
  },

  async fetch(req, env) {
    const h = cors(env, req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });

    const url = new URL(req.url);
    const chave = decodeURIComponent(url.pathname.replace(/^\/+/, ""));

    // "não quero mais receber" (link do e-mail; o POST é o clique único do Gmail/Outlook)
    if (chave === "parar-avisos") {
      const t = url.searchParams.get("t") || "";
      if (!/^[0-9a-f-]{36}$/i.test(t)) return paginaSimples("Link inválido", "Esse link não está completo. Você também pode desligar os avisos na página do pet.");
      const nome = await rpc(env, "parar_avisos_pet", { p_token: t }).catch(() => null);
      if (req.method === "POST") return new Response("ok");
      return nome
        ? paginaSimples("Pronto, avisos desligados", `Você não vai mais receber e-mails sobre ${escH(nome)}. Se mudar de ideia, dá pra ligar de novo na página do pet.`)
        : paginaSimples("Link não encontrado", "Não achamos esse aviso. Você pode desligar os e-mails na página do pet.");
    }

    // rodar os avisos na hora (teste)
    if (chave === "avisos-pet" && req.method === "POST") {
      const auth = req.headers.get("Authorization") || "";
      if (!env.CHAVE_AVISOS || !auth.startsWith("Chave ") || !iguais(auth.slice(6), env.CHAVE_AVISOS)) return resposta({ erro: "sem permissão" }, 403, h);
      return resposta(await rodarAvisos(env, url.origin), 200, h);
    }

    // leitura (reserva)
    if (req.method === "GET" || req.method === "HEAD") {
      if (!chave) return resposta({ ok: true, servico: "dispersion-imagens" }, 200, h);
      const obj = await env.BUCKET.get(chave);
      if (!obj) return new Response("não encontrado", { status: 404, headers: h });
      const headers = new Headers(h);
      obj.writeHttpMetadata(headers);
      headers.set("ETag", obj.httpEtag);
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      return new Response(req.method === "HEAD" ? null : obj.body, { headers });
    }

    if (!(await ehMembro(env, req.headers.get("Authorization"))))
      return resposta({ erro: "Só membros do grupo podem enviar arquivos." }, 403, h);

    // envio
    if (req.method === "PUT") {
      if (!CAMINHO_OK.test(chave)) return resposta({ erro: "Caminho inválido: " + chave }, 400, h);
      const tamanho = Number(req.headers.get("Content-Length") || 0);
      if (tamanho > MAX_BYTES) return resposta({ erro: "Arquivo grande demais (máx. 25 MB)." }, 413, h);
      const ext = chave.split(".").pop().toLowerCase();
      await env.BUCKET.put(chave, req.body, {
        httpMetadata: { contentType: TIPOS[ext], cacheControl: "public, max-age=31536000, immutable" },
      });
      return resposta({ ok: true, chave }, 200, h);
    }

    // apagar vários
    if (req.method === "POST" && chave === "apagar") {
      const { chaves } = await req.json().catch(() => ({}));
      const validas = (Array.isArray(chaves) ? chaves : []).filter((k) => typeof k === "string" && CAMINHO_OK.test(k));
      for (let i = 0; i < validas.length; i += 1000) await env.BUCKET.delete(validas.slice(i, i + 1000));
      return resposta({ ok: true, apagados: validas.length }, 200, h);
    }

    return resposta({ erro: "Método não suportado." }, 405, h);
  },
};
