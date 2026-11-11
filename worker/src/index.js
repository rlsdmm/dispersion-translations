/*
 * Dispersion Translations — envio de imagens pro Cloudflare R2
 *
 * PUT    /<caminho>        envia um arquivo (só membros do grupo)
 * POST   /apagar           { "chaves": ["paginas/...", ...] } apaga arquivos (só membros)
 * GET    /<caminho>        serve o arquivo (reserva; o site lê pelo domínio público do bucket)
 *
 * Quem é membro é decidido pelo Supabase: o site manda o token de login
 * e o Worker pergunta ao Supabase (função is_membro) se aquela conta é do grupo.
 */

// paginas/<obra>/<capitulo>/001.webp   ou   capas/<obra>-<data>.webp
const CAMINHO_OK = /^(paginas\/[a-z0-9][a-z0-9-]*\/[0-9]+(\.[0-9]+)?\/[0-9]{3,4}|capas\/[a-z0-9][a-z0-9-]*)\.(webp|jpe?g|png|gif|avif)$/;
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

export default {
  async fetch(req, env) {
    const h = cors(env, req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });

    const url = new URL(req.url);
    const chave = decodeURIComponent(url.pathname.replace(/^\/+/, ""));

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
