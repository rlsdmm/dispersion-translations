/* Leitor de capítulos — modo vertical (rolagem) e paginado */
DT.iniciar(function () {
  const { esc, serie, capsOrdenados, paginas, lidos, store, conta } = DT;
  const $ = (id) => document.getElementById(id);

  const qs = new URLSearchParams(location.search);
  const s = serie(qs.get("s"));
  const caps = s ? capsOrdenados(s) : [];
  const idx = caps.findIndex((c) => String(c.numero) === qs.get("c"));
  const cap = caps[idx];

  const travado = s && !cap && (s.antecipados || []).find((a) => String(a.numero) === qs.get("c"));
  if (travado) {
    const libera = new Date(travado.publicoEm);
    $("paginas").innerHTML = `<div class="cap-bloqueado">
      <span class="selo-vip grande">VIP</span>
      <h2>Capítulo ${travado.numero} ainda é antecipado</h2>
      <p>Quem apoia o grupo já está lendo. Ele libera pra todo mundo em <b>${libera.toLocaleDateString("pt-BR")}</b> às ${libera.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.</p>
      <div class="botoes"><a class="btn pri" href="apoie.html#vip">Quero ser VIP</a><a class="btn" href="serie.html?s=${encodeURIComponent(s.id)}">Voltar pra obra</a></div>
      ${conta.user ? "" : `<p class="sub">Já é VIP? <a href="${conta.linkEntrar()}">Entre na sua conta</a>.</p>`}
    </div>`;
    $("tituloSerie").textContent = s.titulo;
    $("tituloCap").textContent = `Capítulo ${travado.numero} · antecipado VIP`;
    $("voltar").href = `serie.html?s=${encodeURIComponent(s.id)}`;
    document.querySelectorAll(".ctrl").forEach((e) => (e.style.display = "none"));
    return;
  }
  if (!s || !cap) {
    $("paginas").innerHTML = `<p class="erro-pag">Capítulo não encontrado. <a href="index.html" style="color:var(--acc)">Voltar ao início</a></p>`;
    $("tituloSerie").textContent = "Dispersion Translations";
    document.querySelectorAll(".ctrl").forEach((e) => (e.style.display = "none"));
    return;
  }

  const anterior = caps[idx - 1];
  const proximo = caps[idx + 1];
  const link = (c) => `ler.html?s=${encodeURIComponent(s.id)}&c=${c.numero}`;
  const urls = paginas(s, cap);

  /* preferências salvas */
  function larguraPct(v) {
    if (v in { p: 1, m: 1, g: 1 }) v = { p: 35, m: 50, g: 100 }[v]; // valores antigos P/M/G
    return Math.min(100, Math.max(20, Math.round(+v / 5) * 5 || 50));
  }
  const pref = {
    modo: store.get("modo", "vertical"),        // vertical | paginado
    largura: larguraPct(store.get("largura", 50)), // % da tela no modo vertical
    rtl: store.get("rtl", false),                 // direita → esquerda (estilo mangá)
  };

  /* cabeçalho */
  document.title = `${s.titulo} Capítulo ${cap.numero} em Português · Dispersion Translations`;
  {
    const url = `https://dispersiontl.com.br/ler.html?s=${encodeURIComponent(s.id)}&c=${cap.numero}`;
    const desc = `Ler ${s.titulo} capítulo ${cap.numero} em português (PT-BR), online e grátis. Tradução da Dispersion Translations.`;
    const pôr = (sel, attr, v, tag) => { let m = document.head.querySelector(sel); if (!m) { m = document.createElement(tag); const [, k, n] = sel.match(/\[(\w+)="([^"]+)"/); m.setAttribute(k, n); document.head.appendChild(m); } m.setAttribute(attr, v); };
    pôr('meta[name="description"]', "content", desc, "meta");
    pôr('meta[property="og:title"]', "content", `${s.titulo} · Capítulo ${cap.numero}`, "meta");
    pôr('meta[property="og:description"]', "content", desc, "meta");
    pôr('meta[property="og:image"]', "content", DT.capa(s), "meta");
    pôr('link[rel="canonical"]', "href", url, "link");
  }
  $("voltar").href = `serie.html?s=${encodeURIComponent(s.id)}`;
  $("tituloSerie").textContent = s.titulo;
  $("tituloCap").textContent = `Capítulo ${cap.numero}${cap.titulo ? " — " + cap.titulo : ""}`;
  $("selCap").innerHTML = [...caps].reverse()
    .map((c) => `<option value="${c.numero}" ${c === cap ? "selected" : ""}>Cap. ${c.numero}</option>`).join("");
  $("selCap").onchange = (e) => (location.href = link(caps.find((c) => String(c.numero) === e.target.value)));
  $("ant").disabled = !anterior;
  $("prox").disabled = !proximo;
  $("ant").onclick = () => anterior && (location.href = link(anterior));
  $("prox").onclick = () => proximo && (location.href = link(proximo));

  /* páginas */
  const cont = $("paginas");
  cont.innerHTML = urls
    .map((u, i) => `<img src="${u}" alt="Página ${i + 1}" data-i="${i}" ${i > 2 ? 'loading="lazy"' : ""} />`).join("");
  const imgs = [...cont.querySelectorAll("img")];
  imgs.forEach((img) => (img.onerror = () => {
    img.alt = `Página ${+img.dataset.i + 1} não encontrada`;
    img.style.minHeight = "120px";
  }));

  $("fimCap").innerHTML = `
    <h3>Fim do capítulo ${cap.numero}</h3>
    <p>${proximo ? "Bora pro próximo?" : "Você está em dia! Novos capítulos em breve."}</p>
    <div class="botoes">
      ${proximo ? `<a class="btn pri" href="${link(proximo)}">Capítulo ${proximo.numero} →</a>` : ""}
      <a class="btn" href="serie.html?s=${encodeURIComponent(s.id)}">Lista de capítulos</a>
    </div>
    <section class="comentarios" id="comentarios"></section>`;
  lidos.abrir(s.id, cap.numero);

  /* estado */
  let atual = 0;
  let paginaVista = -1;
  let aoMudarPagina = () => {}; // trocado pelos comentários na página, lá embaixo
  let marcado = lidos.foiLido(s.id, cap.numero);
  let pronto = false; // só salva a posição depois de restaurar
  const posSalva = marcado ? 0 : Math.min(lidos.posicao(s.id, cap.numero), urls.length - 1);

  function marcarLido() {
    if (!marcado) { lidos.marcar(s.id, cap.numero); marcado = true; }
  }

  function atualizarIndicadores() {
    const total = urls.length;
    let pct;
    if (pref.modo === "paginado") {
      pct = ((atual + 1) / total) * 100;
      if (atual === total - 1) marcarLido();
    } else {
      const h = document.documentElement.scrollHeight - innerHeight;
      pct = h > 0 ? Math.min(100, (scrollY / h) * 100) : 100;
      // qual página está no meio da tela
      const meio = innerHeight / 2;
      for (let i = 0; i < imgs.length; i++) {
        const r = imgs[i].getBoundingClientRect();
        if (r.top <= meio && r.bottom >= meio) { atual = i; break; }
      }
      if (pct > 95) marcarLido();
    }
    $("progresso").style.width = pct + "%";
    $("contador").textContent = `${atual + 1} / ${total}`;
    if (atual !== paginaVista) { paginaVista = atual; aoMudarPagina(atual); }
    document.body.classList.toggle("na-ultima", pref.modo === "paginado" && atual === total - 1);
    if (pronto) lidos.salvarPosicao(s.id, cap.numero, atual, total);
  }

  function irPara(i) {
    if (i < 0) { if (anterior) location.href = link(anterior); return; }
    if (i >= urls.length) { if (proximo) location.href = link(proximo); else marcarLido(); return; }
    atual = i;
    imgs.forEach((im, k) => im.classList.toggle("atual", k === i));
    // pré-carrega as próximas
    [i + 1, i + 2].forEach((k) => imgs[k] && imgs[k].removeAttribute("loading"));
    scrollTo(0, 0);
    atualizarIndicadores();
  }

  function aplicarPref() {
    cont.className = `paginas ${pref.modo}`;
    cont.style.maxWidth = pref.modo === "vertical" ? pref.largura + "%" : "";
    $("btnModo").textContent = pref.modo === "vertical" ? "↕ Vertical" : "▤ Paginado";
    $("btnLargura").textContent = `↔ ${pref.largura}%`;
    $("larguraWrap").style.display = pref.modo === "vertical" ? "" : "none";
    $("btnDirecao").textContent = pref.rtl ? "← Mangá (D→E)" : "→ Ocidental (E→D)";
    $("btnDirecao").style.display = pref.modo === "paginado" ? "" : "none";
    if (pref.modo === "paginado") irPara(atual);
    else {
      imgs.forEach((im) => im.classList.remove("atual"));
      requestAnimationFrame(() => { imgs[atual]?.scrollIntoView(); atualizarIndicadores(); });
    }
  }

  $("btnModo").onclick = () => { pref.modo = pref.modo === "vertical" ? "paginado" : "vertical"; conta.salvarPref("modo", pref.modo); aplicarPref(); };
  /* largura: slider em % (mantém a mesma página na tela enquanto arrasta) */
  const painelLarg = $("painelLargura"), slider = $("sliderLargura");
  $("btnLargura").onclick = (e) => {
    e.stopPropagation();
    painelLarg.hidden = !painelLarg.hidden;
    slider.value = pref.largura; $("valLargura").textContent = pref.largura + "%";
  };
  document.addEventListener("click", (e) => { if (!painelLarg.hidden && !e.target.closest("#larguraWrap")) painelLarg.hidden = true; });
  function mudarLargura(v) {
    const img = imgs[atual], r = img && img.getBoundingClientRect();
    const frac = r && r.height ? -r.top / r.height : 0;
    pref.largura = larguraPct(v);
    cont.style.maxWidth = pref.largura + "%";
    $("btnLargura").textContent = `↔ ${pref.largura}%`;
    $("valLargura").textContent = pref.largura + "%";
    if (img) scrollTo(0, img.offsetTop + frac * img.offsetHeight);
  }
  slider.oninput = () => mudarLargura(slider.value);
  slider.onchange = () => conta.salvarPref("largura", pref.largura);
  painelLarg.querySelectorAll("[data-larg]").forEach((b) => (b.onclick = () => {
    slider.value = b.dataset.larg; mudarLargura(b.dataset.larg); conta.salvarPref("largura", pref.largura);
  }));
  $("btnDirecao").onclick = () => { pref.rtl = !pref.rtl; conta.salvarPref("rtl", pref.rtl); aplicarPref(); };

  /* clique no modo paginado: laterais viram a página, centro mostra/esconde a barra */
  cont.addEventListener("click", (e) => {
    if (pref.modo !== "paginado") return;
    const x = e.clientX / innerWidth;
    if (x > 0.35 && x < 0.65) { barra.classList.toggle("oculta"); return; }
    const frente = pref.rtl ? x < 0.35 : x > 0.65;
    irPara(atual + (frente ? 1 : -1));
  });

  /* teclado */
  addEventListener("keydown", (e) => {
    if (["SELECT", "TEXTAREA", "INPUT"].includes(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === "m") return $("btnModo").click();
    if (k === "q" && anterior) return (location.href = link(anterior));
    if (k === "e" && proximo) return (location.href = link(proximo));
    if (pref.modo !== "paginado") return;
    const avancar = pref.rtl ? "arrowleft" : "arrowright";
    const voltar = pref.rtl ? "arrowright" : "arrowleft";
    if (k === avancar || k === " " || k === "d") { e.preventDefault(); irPara(atual + 1); }
    if (k === voltar || k === "a") { e.preventDefault(); irPara(atual - 1); }
  });

  /* deslizar no celular (paginado) */
  let tx = null;
  cont.addEventListener("touchstart", (e) => (tx = e.touches[0].clientX), { passive: true });
  cont.addEventListener("touchend", (e) => {
    if (pref.modo !== "paginado" || tx === null) return;
    const dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) < 50) return;
    const frente = pref.rtl ? dx > 0 : dx < 0;
    irPara(atual + (frente ? 1 : -1));
  });

  /* barra some ao rolar pra baixo, volta ao rolar pra cima */
  const barra = $("barra");
  let ultimoY = 0;
  addEventListener("scroll", () => {
    if (pref.modo === "vertical") {
      const y = scrollY;
      barra.classList.toggle("oculta", y > ultimoY && y > 120);
      ultimoY = y;
    }
    atualizarIndicadores();
  }, { passive: true });

  /* volta pra página onde parou */
  if (posSalva > 0) {
    atual = posSalva;
    const aviso = document.createElement("div");
    aviso.className = "aviso-retomar";
    aviso.innerHTML = `Continuando da página ${posSalva + 1} · <button class="link">voltar ao início</button>`;
    aviso.querySelector("button").onclick = () => { aviso.remove(); pref.modo === "paginado" ? irPara(0) : scrollTo(0, 0); };
    document.body.appendChild(aviso);
    setTimeout(() => aviso.classList.add("some"), 6000);
    setTimeout(() => aviso.remove(), 6600);
    if (pref.modo === "vertical") {
      // carrega as páginas até a salva antes de rolar, pra cair no lugar certo
      const antes = imgs.slice(0, posSalva + 1);
      antes.forEach((im) => im.removeAttribute("loading"));
      const prontas = antes.map((im) => im.complete ? 0 : new Promise((r) => {
        im.addEventListener("load", r, { once: true }); im.addEventListener("error", r, { once: true });
      }));
      Promise.race([Promise.all(prontas), new Promise((r) => setTimeout(r, 5000))]).then(() => {
        scrollTo({ top: imgs[posSalva].getBoundingClientRect().top + scrollY - 60, behavior: "instant" });
        pronto = true; atualizarIndicadores();
      });
    }
  }
  aplicarPref();
  if (!(posSalva > 0 && pref.modo === "vertical")) { pronto = true; atualizarIndicadores(); }

  /* ---------- comentários ---------- */
  const caixa = $("comentarios");
  if (!DT.sb) { caixa.remove(); return; }
  let equipe = null;
  const ehVip = (c) => !!c.perfis?.vip_ate && new Date(c.perfis.vip_ate) > new Date();
  const xpDe = new Map(); // user_id -> XP (selo de nível)
  const nomeAutor = (c) => `<b class="${ehVip(c) ? "nome-vip" : ""}">${esc(c.perfis?.apelido || "leitor")}</b>${
    xpDe.has(c.user_id) ? DT.seloNivel(xpDe.get(c.user_id)) : ""}${
    equipe?.has(c.user_id) ? '<span class="selo-equipe">Equipe</span>' : ehVip(c) ? '<span class="selo-vip">VIP</span>' : ""}`;
  async function buscarXp(lista) {
    const faltam = [...new Set(lista.map((c) => c.user_id))].filter((u) => !xpDe.has(u));
    if (!faltam.length) return;
    const { data } = await DT.sb.rpc("xp_de", { p_users: faltam.slice(0, 200) });
    for (const r of data || []) xpDe.set(r.user_id, r.xp);
  }
  const quando = (iso) => {
    const min = Math.floor((Date.now() - new Date(iso)) / 6e4);
    if (min < 1) return "agora";
    if (min < 60) return `há ${min} min`;
    if (min < 1440) return `há ${Math.floor(min / 60)} h`;
    if (min < 43200) return `há ${Math.floor(min / 1440)} d`;
    return new Date(iso).toLocaleDateString("pt-BR");
  };

  // conta a leitura pros "Populares do mês" (1x por capítulo por dia neste navegador)
  try {
    const marca = `leitura:${s.id}:${cap.numero}`, hoje = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(marca) !== hoje) {
      DT.sb.rpc("contar_leitura", { p_serie: s.id }).then(({ error }) => { if (!error) localStorage.setItem(marca, hoje); });
    }
  } catch {}

  async function carregarComentarios() {
    const [r, e] = await Promise.all([
      DT.sb.from("comentarios").select("id,texto,criado_em,user_id,pagina,perfis(apelido,vip_ate)")
        .eq("serie_id", s.id).eq("numero", cap.numero).order("criado_em", { ascending: true }).limit(500),
      equipe ? { data: null } : DT.sb.rpc("equipe_ids"),
    ]);
    if (!equipe) equipe = new Set(e.data || []);
    const lista = r.data || [];
    await buscarXp(lista);
    if (!r.error) { todos = lista; indexar(); renderBtnPag(); }
    const eu = conta.user?.id;
    caixa.innerHTML = `
      <h3>Comentários <span class="sub">(${lista.length})</span></h3>
      ${eu ? (conta.perfil?.banido
        ? `<p class="sub">Sua conta foi bloqueada de comentar.</p>`
        : `<form class="novo-coment" id="formComent">
            ${DT.avatar(conta.perfil.apelido, eu)}
            <div><textarea id="textoComent" maxlength="1000" rows="2" placeholder="O que achou do capítulo? Sem spoilers de capítulos futuros, hein!" required></textarea>
            <div class="acoes"><span class="sub" id="msgComent"></span><button class="btn pri mini-btn" type="submit">Comentar</button></div></div>
          </form>`)
        : `<p class="entrar-coment"><a class="btn" href="${conta.linkEntrar()}">Entre pra comentar</a></p>`}
      <div class="lista-coment">${lista.length ? lista.map((c) => `
        <div class="coment">
          ${DT.avatar(c.perfis?.apelido, c.user_id)}
          <div>
            <div class="cab">${nomeAutor(c)}${c.pagina != null ? `<button class="tag-pag ir" data-ir-fim="${c.pagina}" title="Ir até a página ${c.pagina + 1}">pág. ${c.pagina + 1} ↑</button>` : ""}<span class="sub">${quando(c.criado_em)}</span></div>
            <p>${esc(c.texto)}</p>
            ${eu && (eu === c.user_id || conta.membro) ? `<div class="acoes-coment">
              <button class="link" data-apagar="${c.id}">apagar</button>
              ${conta.membro && eu !== c.user_id && !equipe.has(c.user_id) ? `<button class="link perigo" data-banir="${c.user_id}" data-nome="${esc(c.perfis?.apelido || "")}">bloquear usuário</button>` : ""}
            </div>` : ""}
          </div>
        </div>`).join("") : `<p class="sub">Ninguém comentou ainda. Seja o primeiro!</p>`}</div>`;

    const f = $("formComent");
    if (f) f.onsubmit = async (ev) => {
      ev.preventDefault();
      const texto = $("textoComent").value.trim();
      if (!texto) return;
      const b = f.querySelector("button"); b.disabled = true;
      const { error } = await DT.sb.from("comentarios").insert({ serie_id: s.id, numero: cap.numero, texto });
      b.disabled = false;
      if (error) {
        $("msgComent").textContent = error.code === "42501" ? "Calma! Espere alguns segundos entre um comentário e outro." : "Não deu pra enviar: " + error.message;
        return;
      }
      carregarComentarios();
    };
    caixa.querySelectorAll("[data-ir-fim]").forEach((b) => (b.onclick = () => irParaPagina(+b.dataset.irFim)));
    caixa.querySelectorAll("[data-apagar]").forEach((b) => (b.onclick = async () => {
      if (!confirm("Apagar este comentário?")) return;
      await DT.sb.from("comentarios").delete().eq("id", b.dataset.apagar);
      carregarComentarios();
    }));
    caixa.querySelectorAll("[data-banir]").forEach((b) => (b.onclick = async () => {
      if (!confirm(`Bloquear "${b.dataset.nome}" de comentar? Todos os comentários dessa conta serão apagados.`)) return;
      const { error } = await DT.sb.rpc("banir", { p_user: b.dataset.banir, p_banido: true });
      if (error) alert("Erro: " + error.message);
      carregarComentarios();
    }));
  }
  /* ---------- comentários na página (passam na tela, estilo Bilibili) ---------- */
  const camada = $("danmaku"), btnPag = $("btnPagComent"), painel = $("painelPag"), btnBalao = $("btnBalao");
  let porPagina = new Map();          // página -> [comentários]
  let balaoOn = store.get("danmaku", true);
  const mostradoEm = new Map();       // página -> quando passou na tela pela última vez
  const faixas = [];                  // até quando cada faixa está ocupada
  const NFAIXAS = innerWidth <= 560 ? 6 : 7;

  function renderBalao() {
    btnBalao.hidden = false;
    btnBalao.innerHTML = `💬<span class="txt-balao"> Comentários: ${balaoOn ? "on" : "off"}</span>`;
    btnBalao.classList.toggle("on", balaoOn);
    camada.hidden = !balaoOn;
  }
  btnBalao.onclick = () => {
    balaoOn = !balaoOn; conta.salvarPref("danmaku", balaoOn); renderBalao();
    if (balaoOn) { mostradoEm.delete(atual); soltar(atual); } else camada.innerHTML = "";
  };
  addEventListener("keydown", (e) => {
    if (!["SELECT", "TEXTAREA", "INPUT"].includes(e.target.tagName) && e.key.toLowerCase() === "c") btnBalao.click();
  });

  function voar(c, meu = false) {
    const agora = performance.now();
    let f = faixas.findIndex((t) => !t || t < agora);
    if (f === -1) f = faixas.length < NFAIXAS ? faixas.length : faixas.indexOf(Math.min(...faixas));
    const el = document.createElement("div");
    el.className = "bala" + (meu ? " minha" : "") + (equipe?.has(c.user_id) ? " equipe" : ehVip(c) ? " vip" : "");
    el.textContent = c.texto;
    el.style.top = `calc(${f} * var(--faixa))`;
    camada.appendChild(el);
    const largura = el.offsetWidth, tela = camada.clientWidth;
    const dur = Math.min(14000, 7000 + largura * 8);
    faixas[f] = agora + dur * (largura + 40) / (tela + largura); // libera a faixa quando a bala inteira já entrou
    el.animate([{ transform: `translateX(${tela}px)` }, { transform: `translateX(${-largura - 20}px)` }],
      { duration: dur, easing: "linear" }).onfinish = () => el.remove();
  }

  function soltar(p) {
    const lista = porPagina.get(p) || [];
    if (!balaoOn || !lista.length) return;
    const ult = mostradoEm.get(p);
    if (ult && Date.now() - ult < 20000) return;
    mostradoEm.set(p, Date.now());
    lista.slice(-40).forEach((c, k) => setTimeout(() => paginaVista === p && voar(c), k * 650 + Math.random() * 300));
  }

  /* ir até uma página (usado ao clicar num comentário) */
  function irParaPagina(i) {
    if (pref.modo === "paginado") return irPara(i);
    const antes = imgs.slice(0, i + 1);
    antes.forEach((im) => im.removeAttribute("loading"));
    const prontas = antes.map((im) => im.complete ? 0 : new Promise((r) => {
      im.addEventListener("load", r, { once: true }); im.addEventListener("error", r, { once: true });
    }));
    const rolar = () => scrollTo({ top: imgs[i].getBoundingClientRect().top + scrollY - 70, behavior: "instant" });
    rolar();
    Promise.race([Promise.all(prontas), new Promise((r) => setTimeout(r, 4000))]).then(rolar);
  }

  let todos = [];                     // todos os comentários do capítulo (páginas + fim)
  let abaPainel = "pag";
  function indexar() {
    porPagina = new Map();
    for (const c of todos) {
      if (c.pagina == null) continue;
      if (!porPagina.has(c.pagina)) porPagina.set(c.pagina, []);
      porPagina.get(c.pagina).push(c);
    }
  }

  function renderBtnPag() {
    const n = (porPagina.get(atual) || []).length;
    btnPag.hidden = false;
    btnPag.innerHTML = `<span class="n-pag">💬 ${n || "+"}</span>${todos.length ? `<span class="n-cap">${todos.length} no cap.</span>` : ""}`;
    btnPag.title = `${n ? `${n} comentário${n > 1 ? "s" : ""} nesta página` : "Comentar nesta página"} · ${todos.length} no capítulo todo`;
  }

  function linhaComent(c, eu, comLink) {
    const onde = c.pagina != null ? `pág. ${c.pagina + 1}` : "fim do cap.";
    const podeIr = comLink && (c.pagina != null || pref.modo === "vertical");
    return `<div class="pc">
      ${comLink ? (podeIr ? `<button class="tag-pag ir" data-ir="${c.pagina ?? "fim"}" title="Ir até ${onde}">${onde} →</button>` : `<span class="tag-pag">${onde}</span>`) : ""}
      ${nomeAutor(c)}
      <span>${esc(c.texto)}</span>
      ${eu && (eu === c.user_id || conta.membro) ? `<button class="link" data-apagar-pag="${c.id}">apagar</button>` : ""}</div>`;
  }

  function renderPainel() {
    const daPagina = porPagina.get(atual) || [];
    const eu = conta.user?.id;
    $("painelPagTitulo").innerHTML = `
      <span class="abas-painel">
        <button type="button" data-aba-p="pag" class="${abaPainel === "pag" ? "on" : ""}">Página ${atual + 1} <small>${daPagina.length}</small></button>
        <button type="button" data-aba-p="cap" class="${abaPainel === "cap" ? "on" : ""}">Capítulo todo <small>${todos.length}</small></button>
      </span>`;
    const lista = abaPainel === "pag" ? daPagina : todos;
    $("painelPagLista").innerHTML = lista.length ? lista.map((c) => linhaComent(c, eu, abaPainel === "cap")).join("")
      : `<p class="sub">${abaPainel === "pag" ? "Ninguém comentou nesta página ainda." : "Ninguém comentou neste capítulo ainda."}</p>`;
    $("formPag").innerHTML = !eu ? `<a class="btn mini-btn" href="${conta.linkEntrar()}">Entre pra comentar</a>`
      : conta.perfil?.banido ? `<p class="sub">Sua conta foi bloqueada de comentar.</p>`
      : `<input id="textoPag" maxlength="140" placeholder="Comente a página ${atual + 1} (aparece passando na tela)" autocomplete="off" required />
         <button class="btn pri mini-btn" type="submit">Enviar</button><span class="sub" id="msgPag"></span>`;
    $("painelPagTitulo").querySelectorAll("[data-aba-p]").forEach((b) => (b.onclick = () => { abaPainel = b.dataset.abaP; renderPainel(); }));
    $("painelPagLista").querySelectorAll("[data-ir]").forEach((b) => (b.onclick = () => {
      if (b.dataset.ir === "fim") { painel.hidden = true; $("fimCap").scrollIntoView({ behavior: "instant" }); return; }
      abaPainel = "pag";
      irParaPagina(+b.dataset.ir);
      mostradoEm.delete(+b.dataset.ir);
      renderPainel();
    }));
    $("painelPagLista").querySelectorAll("[data-apagar-pag]").forEach((b) => (b.onclick = async () => {
      if (!confirm("Apagar este comentário?")) return;
      await DT.sb.from("comentarios").delete().eq("id", b.dataset.apagarPag);
      todos = todos.filter((c) => String(c.id) !== b.dataset.apagarPag);
      indexar(); renderPainel(); renderBtnPag();
    }));
  }

  btnPag.onclick = () => {
    painel.hidden = !painel.hidden;
    if (!painel.hidden) { renderPainel(); if (matchMedia("(pointer: fine)").matches) $("textoPag")?.focus(); }
  };
  $("fecharPag").onclick = () => (painel.hidden = true);
  $("formPag").onsubmit = async (ev) => {
    ev.preventDefault();
    const inp = $("textoPag"), texto = inp.value.trim();
    if (!texto) return;
    const p = atual, b = $("formPag").querySelector("button");
    b.disabled = true;
    const { data, error } = await DT.sb.from("comentarios")
      .insert({ serie_id: s.id, numero: cap.numero, pagina: p, texto }).select("id,texto,criado_em,user_id,pagina").single();
    b.disabled = false;
    if (error) {
      $("msgPag").textContent = error.code === "42501" ? "Calma! Espere uns segundos." : "Não deu: " + error.message;
      return;
    }
    const c = { ...data, perfis: { apelido: conta.perfil?.apelido, vip_ate: conta.perfil?.vip_ate } };
    todos.push(c); indexar();
    inp.value = "";
    abaPainel = "pag";
    renderPainel(); renderBtnPag();
    if (balaoOn) voar(c, true);
  };

  aoMudarPagina = (p) => {
    renderBtnPag();
    if (!painel.hidden) renderPainel();
    soltar(p);
  };

  Promise.all([
    DT.sb.from("comentarios").select("id,texto,criado_em,user_id,pagina,perfis(apelido,vip_ate)")
      .eq("serie_id", s.id).eq("numero", cap.numero).order("criado_em", { ascending: true }).limit(2000),
    DT.sb.rpc("equipe_ids"),
  ]).then(([r, e]) => {
    if (r.error) return; // banco ainda sem a coluna "pagina"
    equipe = equipe || new Set(e.data || []);
    todos = r.data || [];
    indexar();
    renderBalao();
    renderBtnPag();
    soltar(atual);
  });

  // só busca os comentários quando o leitor chega perto do fim
  new IntersectionObserver((ents, obs) => {
    if (ents.some((x) => x.isIntersecting)) { obs.disconnect(); carregarComentarios(); }
  }, { rootMargin: "800px" }).observe($("fimCap"));
}, { paginas: true });

