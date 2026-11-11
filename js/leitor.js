/* Leitor de capítulos — modo vertical (rolagem) e paginado */
(function () {
  const { esc, serie, capsOrdenados, paginas, lidos, store } = DT;
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
    </div>`;

  /* estado */
  let atual = 0;
  let marcado = false;

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

  $("btnModo").onclick = () => { pref.modo = pref.modo === "vertical" ? "paginado" : "vertical"; store.set("modo", pref.modo); aplicarPref(); };
  $("btnLargura").onclick = () => { pref.largura = { p: "m", m: "g", g: "p" }[pref.largura]; store.set("largura", pref.largura); aplicarPref(); };
  $("btnDirecao").onclick = () => { pref.rtl = !pref.rtl; store.set("rtl", pref.rtl); aplicarPref(); };

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
    if (e.target.tagName === "SELECT") return;
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

  aplicarPref();
})();
