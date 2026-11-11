/* Leitor de capítulos — modo vertical (rolagem) e paginado */
DT.iniciar(function () {
  const { esc, serie, capsOrdenados, paginas, lidos, store, conta } = DT;
  const $ = (id) => document.getElementById(id);

  const qs = new URLSearchParams(location.search);
  const s = serie(qs.get("s"));
  const caps = s ? capsOrdenados(s) : [];
  const idx = caps.findIndex((c) => String(c.numero) === qs.get("c"));
  const cap = caps[idx];

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
  const pref = {
    modo: store.get("modo", "vertical"),        // vertical | paginado
    largura: store.get("largura", "m"),          // p | m | g
    rtl: store.get("rtl", false),                 // direita → esquerda (estilo mangá)
  };

  /* cabeçalho */
  document.title = `${s.titulo} · Cap. ${cap.numero} · Dispersion Translations`;
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
    cont.className = `paginas ${pref.modo} largura-${pref.largura}`;
    $("btnModo").textContent = pref.modo === "vertical" ? "↕ Vertical" : "▤ Paginado";
    $("btnLargura").textContent = { p: "Largura: P", m: "Largura: M", g: "Largura: G" }[pref.largura];
    $("btnLargura").style.display = pref.modo === "vertical" ? "" : "none";
    $("btnDirecao").textContent = pref.rtl ? "← Mangá (D→E)" : "→ Ocidental (E→D)";
    $("btnDirecao").style.display = pref.modo === "paginado" ? "" : "none";
    if (pref.modo === "paginado") irPara(atual);
    else {
      imgs.forEach((im) => im.classList.remove("atual"));
      requestAnimationFrame(() => { imgs[atual]?.scrollIntoView(); atualizarIndicadores(); });
    }
  }

  $("btnModo").onclick = () => { pref.modo = pref.modo === "vertical" ? "paginado" : "vertical"; conta.salvarPref("modo", pref.modo); aplicarPref(); };
  $("btnLargura").onclick = () => { pref.largura = { p: "m", m: "g", g: "p" }[pref.largura]; conta.salvarPref("largura", pref.largura); aplicarPref(); };
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
  const quando = (iso) => {
    const min = Math.floor((Date.now() - new Date(iso)) / 6e4);
    if (min < 1) return "agora";
    if (min < 60) return `há ${min} min`;
    if (min < 1440) return `há ${Math.floor(min / 60)} h`;
    if (min < 43200) return `há ${Math.floor(min / 1440)} d`;
    return new Date(iso).toLocaleDateString("pt-BR");
  };

  async function carregarComentarios() {
    const [r, e] = await Promise.all([
      DT.sb.from("comentarios").select("id,texto,criado_em,user_id,perfis(apelido)")
        .eq("serie_id", s.id).eq("numero", cap.numero).order("criado_em", { ascending: true }).limit(500),
      equipe ? { data: null } : DT.sb.rpc("equipe_ids"),
    ]);
    if (!equipe) equipe = new Set(e.data || []);
    const lista = r.data || [];
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
            <div class="cab"><b>${esc(c.perfis?.apelido || "leitor")}</b>${equipe.has(c.user_id) ? '<span class="selo-equipe">Equipe</span>' : ""}<span class="sub">${quando(c.criado_em)}</span></div>
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
  // só busca os comentários quando o leitor chega perto do fim
  new IntersectionObserver((ents, obs) => {
    if (ents.some((x) => x.isIntersecting)) { obs.disconnect(); carregarComentarios(); }
  }, { rootMargin: "800px" }).observe($("fimCap"));
}, { paginas: true });

