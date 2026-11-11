/* Área do grupo: login, envio de capítulos e cadastro de obras (Supabase) */
(function () {
  const { sb, esc, capa, header, footer, coresDe } = DT;
  const $ = (id) => document.getElementById(id);
  const BUCKET = "midia";

  $("topo").innerHTML = header();
  $("rodape").innerHTML = footer();

  if (!sb) { $("semConfig").hidden = false; return; }

  const telas = ["formLogin", "formSenha", "semPermissao", "painel"];
  const mostrar = (id) => telas.forEach((t) => ($(t).hidden = t !== id));
  const msg = (id, texto, tipo = "") => { const el = $(id); el.textContent = texto; el.className = "msg " + tipo; };

  let series = [];
  let membro = null;

  /* ============ LOGIN ============ */
  let recuperando = location.hash.includes("type=recovery") || location.hash.includes("type=invite");

  sb.auth.onAuthStateChange((evento, sessao) => {
    if (evento === "PASSWORD_RECOVERY") recuperando = true;
    setTimeout(() => entrar(sessao), 0); // evita travar o cliente do Supabase
  });

  async function entrar(sessao) {
    if (!sessao) return mostrar("formLogin");
    if (recuperando) return mostrar("formSenha");
    const { data, error } = await sb.from("membros").select("nome,cargo").eq("user_id", sessao.user.id).maybeSingle();
    if (error || !data) { $("emailSemPerm").textContent = sessao.user.email; return mostrar("semPermissao"); }
    if (membro) return; // painel já aberto
    membro = data;
    $("nomeMembro").textContent = data.nome || sessao.user.email.split("@")[0];
    $("emailMembro").textContent = `${sessao.user.email} · ${data.cargo}`;
    mostrar("painel");
    await recarregarSeries();
  }

  $("formLogin").onsubmit = async (e) => {
    e.preventDefault();
    msg("loginMsg", "Entrando…");
    const { error } = await sb.auth.signInWithPassword({ email: $("loginEmail").value.trim(), password: $("loginSenha").value });
    msg("loginMsg", error ? "E-mail ou senha incorretos." : "", error ? "erro" : "");
  };

  $("esqueci").onclick = async () => {
    const email = $("loginEmail").value.trim();
    if (!email) return msg("loginMsg", "Digite seu e-mail primeiro.", "erro");
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    msg("loginMsg", error ? "Não deu pra enviar agora: " + error.message : "Se o e-mail estiver cadastrado, chega um link pra criar uma nova senha.", error ? "erro" : "ok");
  };

  $("formSenha").onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: $("novaSenha").value });
    if (error) return msg("senhaMsg", "Erro: " + error.message, "erro");
    recuperando = false;
    history.replaceState(null, "", location.pathname);
    const { data } = await sb.auth.getSession();
    entrar(data.session);
  };

  document.querySelectorAll("[data-sair]").forEach((b) => (b.onclick = async () => {
    await sb.auth.signOut(); membro = null; mostrar("formLogin");
  }));

  /* ============ ABAS ============ */
  document.querySelectorAll(".abas button").forEach((b) => (b.onclick = () => abrirAba(b.dataset.aba)));
  function abrirAba(nome) {
    document.querySelectorAll(".abas button").forEach((x) => x.classList.toggle("on", x.dataset.aba === nome));
    document.querySelectorAll(".aba").forEach((x) => (x.hidden = x.id !== "aba-" + nome));
    if (nome === "capitulos") renderCapitulos();
    if (nome === "importar") prepararImportador();
  }

  /* ============ UTILIDADES ============ */
  const slug = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const hoje = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const numStr = (n) => String(Number(n));
  const caminhoDaUrl = (url) => {
    const m = String(url || "").split(`/object/public/${BUCKET}/`)[1];
    return m ? decodeURIComponent(m.split("?")[0]) : null;
  };
  const urlPublica = (caminho) => sb.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl + "?v=" + Date.now();

  /* Onde as imagens ficam: Cloudflare R2 (se configurado em js/config.js) ou Supabase Storage */
  const R2 = (window.DT_CONFIG.imagens && window.DT_CONFIG.imagens.envio) ? {
    envio: window.DT_CONFIG.imagens.envio.replace(/\/+$/, ""),
    publico: window.DT_CONFIG.imagens.publico.replace(/\/+$/, ""),
  } : null;
  async function token() { const { data } = await sb.auth.getSession(); return data.session?.access_token; }
  const caminhoR2 = (url) => R2 && String(url || "").startsWith(R2.publico + "/") ? decodeURIComponent(url.slice(R2.publico.length + 1).split("?")[0]) : null;

  async function enviarArquivo(caminho, blob, tipo) {
    if (R2) {
      for (let tentativa = 1; ; tentativa++) {
        try {
          const r = await fetch(`${R2.envio}/${caminho}`, { method: "PUT", headers: { Authorization: "Bearer " + await token(), "Content-Type": tipo }, body: blob });
          if (r.ok) break;
          const erro = (await r.json().catch(() => ({}))).erro || "HTTP " + r.status;
          if (r.status < 500 || tentativa >= 3) throw new Error(erro);
        } catch (e) {
          if (tentativa >= 3 || /membros|inválido|grande/.test(e.message)) throw e;
        }
        await new Promise((ok) => setTimeout(ok, 1500 * tentativa));
      }
      return `${R2.publico}/${caminho}?v=${Date.now()}`;
    }
    const { error } = await sb.storage.from(BUCKET).upload(caminho, blob, { upsert: true, contentType: tipo, cacheControl: "31536000" });
    if (error) throw error;
    return urlPublica(caminho);
  }
  const chaveDe = (url) => caminhoR2(url) || caminhoDaUrl(url);

  async function comprimir(file, maxLargura = 1600, qualidade = 0.88) {
    try {
      const bmp = await createImageBitmap(file);
      const fator = Math.min(1, maxLargura / bmp.width);
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * fator); c.height = Math.round(bmp.height * fator);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close?.();
      const blob = await new Promise((r) => c.toBlob(r, "image/webp", qualidade));
      if (blob && blob.size < file.size) return { blob, ext: "webp", tipo: "image/webp" };
    } catch (e) { console.warn("Não deu pra comprimir", file.name, e); }
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    return { blob: file, ext, tipo: file.type || "image/jpeg" };
  }

  async function removerArquivos(urls) {
    const doR2 = urls.map(caminhoR2).filter(Boolean);
    const doSupabase = urls.map(caminhoDaUrl).filter(Boolean);
    if (doR2.length) {
      await fetch(`${R2.envio}/apagar`, {
        method: "POST", headers: { Authorization: "Bearer " + await token(), "Content-Type": "application/json" },
        body: JSON.stringify({ chaves: doR2 }),
      }).catch((e) => console.warn(e));
    }
    for (let i = 0; i < doSupabase.length; i += 500) {
      await sb.storage.from(BUCKET).remove(doSupabase.slice(i, i + 500));
    }
  }

  async function recarregarSeries() {
    const { data, error } = await sb.from("series").select("*").order("titulo");
    if (error) { alert("Erro ao carregar obras: " + error.message); return; }
    series = data;
    const opcoes = series.length
      ? series.map((s) => `<option value="${esc(s.id)}">${esc(s.titulo)}</option>`).join("")
      : `<option value="">Cadastre uma obra primeiro (aba Obras)</option>`;
    const selA = $("capSerie").value, selB = $("listaSerie").value;
    $("capSerie").innerHTML = opcoes; $("listaSerie").innerHTML = opcoes;
    const selC = $("impSerie").value; $("impSerie").innerHTML = opcoes;
    if (series.some((s) => s.id === selC)) $("impSerie").value = selC;
    if (series.some((s) => s.id === selA)) $("capSerie").value = selA;
    if (series.some((s) => s.id === selB)) $("listaSerie").value = selB;
    renderObras();
    if (!$("aba-capitulos").hidden) renderCapitulos();
  }

  /* ============ ENVIAR CAPÍTULO ============ */
  let arquivos = [];
  $("capData").value = hoje();

  function adicionarArquivos(lista) {
    const imgs = [...lista].filter((f) => f.type.startsWith("image/"));
    imgs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    arquivos.push(...imgs.map((f) => ({ file: f, url: URL.createObjectURL(f) })));
    renderMiniaturas();
  }

  function renderMiniaturas() {
    $("miniaturas").innerHTML = arquivos.map((a, i) => `
      <div class="mini" draggable="true" data-i="${i}">
        <img src="${a.url}" alt="" />
        <span class="num">${i + 1}</span>
        <button type="button" class="x" data-x="${i}" title="Remover">×</button>
        <small>${esc(a.file.name)}</small>
      </div>`).join("");
    $("btnEnviar").textContent = arquivos.length ? `Publicar capítulo (${arquivos.length} páginas)` : ($("dicaEditar").hidden ? "Publicar capítulo" : "Salvar alterações");
  }

  $("escolher").onclick = () => $("capArquivos").click();
  $("capArquivos").onchange = (e) => { adicionarArquivos(e.target.files); e.target.value = ""; };
  const zona = $("soltar");
  zona.addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); zona.classList.add("ativa"); } });
  zona.addEventListener("dragleave", () => zona.classList.remove("ativa"));
  zona.addEventListener("drop", (e) => { e.preventDefault(); zona.classList.remove("ativa"); adicionarArquivos(e.dataTransfer.files); });

  // reordenar e remover miniaturas
  let arrastando = null;
  const mini = $("miniaturas");
  mini.addEventListener("click", (e) => {
    const x = e.target.dataset.x;
    if (x !== undefined) { URL.revokeObjectURL(arquivos[x].url); arquivos.splice(+x, 1); renderMiniaturas(); }
  });
  mini.addEventListener("dragstart", (e) => { arrastando = +e.target.closest(".mini").dataset.i; });
  mini.addEventListener("dragover", (e) => { if (arrastando !== null) e.preventDefault(); });
  mini.addEventListener("drop", (e) => {
    const alvo = e.target.closest(".mini");
    if (arrastando === null || !alvo) return;
    e.preventDefault(); e.stopPropagation();
    const [item] = arquivos.splice(arrastando, 1);
    arquivos.splice(+alvo.dataset.i, 0, item);
    arrastando = null; renderMiniaturas();
  });
  mini.addEventListener("dragend", () => (arrastando = null));

  function limparForm() {
    arquivos.forEach((a) => URL.revokeObjectURL(a.url));
    arquivos = [];
    $("capNumero").value = ""; $("capTitulo").value = ""; $("capData").value = hoje();
    $("dicaEditar").hidden = true; $("capNumero").readOnly = false; $("capSerie").disabled = false;
    msg("capMsg", ""); renderMiniaturas();
  }
  $("btnLimpar").onclick = limparForm;

  function progresso(feito, total, texto) {
    const b = $("barraEnvio"); b.hidden = false;
    b.querySelector("div").style.width = (total ? (feito / total) * 100 : 0) + "%";
    b.querySelector("span").textContent = texto;
  }

  $("formCap").onsubmit = async (e) => {
    e.preventDefault();
    const serieId = $("capSerie").value;
    const numero = Number($("capNumero").value);
    if (!serieId) return msg("capMsg", "Cadastre uma obra primeiro, na aba Obras.", "erro");

    const { data: existente, error: e0 } = await sb.from("capitulos")
      .select("id,paginas").eq("serie_id", serieId).eq("numero", numero).maybeSingle();
    if (e0) return msg("capMsg", "Erro: " + e0.message, "erro");

    if (!arquivos.length && !existente) return msg("capMsg", "Adicione as páginas do capítulo.", "erro");
    if (arquivos.length && existente && $("dicaEditar").hidden &&
        !confirm(`O capítulo ${numStr(numero)} já existe. Substituir as páginas dele pelas novas?`)) return;

    $("btnEnviar").disabled = true;
    try {
      let paginas = existente ? existente.paginas : [];
      if (arquivos.length) {
        const comprimirOn = $("capComprimir").checked;
        const pasta = `paginas/${serieId}/${numStr(numero)}`;
        const novas = new Array(arquivos.length);
        let feitas = 0;
        progresso(0, arquivos.length, "Preparando…");
        // envia 3 páginas por vez
        const fila = arquivos.map((a, i) => i);
        async function trabalhador() {
          while (fila.length) {
            const i = fila.shift();
            const f = arquivos[i].file;
            const { blob, ext, tipo } = comprimirOn ? await comprimir(f) : { blob: f, ext: (f.name.split(".").pop() || "jpg").toLowerCase(), tipo: f.type };
            const caminho = `${pasta}/${String(i + 1).padStart(3, "0")}.${ext}`;
            try { novas[i] = await enviarArquivo(caminho, blob, tipo); }
            catch (err) { throw new Error(`Página ${i + 1} (${f.name}): ${err.message}`); }
            feitas++;
            progresso(feitas, arquivos.length, `Enviando páginas… ${feitas}/${arquivos.length}`);
          }
        }
        await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
        // apaga arquivos antigos que não foram sobrescritos
        if (existente) {
          const novosCaminhos = new Set(novas.map(chaveDe));
          await removerArquivos(existente.paginas.filter((u) => !novosCaminhos.has(chaveDe(u))));
        }
        paginas = novas;
      }

      progresso(1, 1, "Salvando…");
      const { error } = await sb.from("capitulos").upsert({
        serie_id: serieId, numero, titulo: $("capTitulo").value.trim() || null, data: $("capData").value, paginas,
      }, { onConflict: "serie_id,numero" });
      if (error) throw error;

      const link = `ler.html?s=${encodeURIComponent(serieId)}&c=${numStr(numero)}`;
      limparForm();
      $("capMsg").innerHTML = `✓ Capítulo ${numStr(numero)} publicado! <a href="${link}" target="_blank">Abrir no leitor</a>`;
      $("capMsg").className = "msg ok";
    } catch (err) {
      console.error(err);
      msg("capMsg", "Deu erro: " + (err.message || err) + " — nada foi publicado no site; tente de novo.", "erro");
    } finally {
      $("btnEnviar").disabled = false;
      $("barraEnvio").hidden = true;
    }
  };

  /* ============ IMPORTAR EM LOTE (.zip / .cbz) ============ */
  let fila = [];          // [{ file, numero, status, el }]
  let importando = false, parar = false;
  const EXT_IMG = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;
  const TIPO_IMG = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif", bmp: "image/bmp" };
  const mb = (b) => (b / 1048576).toFixed(1) + " MB";

  // "Akame ga Kill! Zero 60.zip" → 60 ; "Cap 10.5.cbz" → 10.5 ; "Vol.2 Ch.15" → 15
  function numeroDoNome(nome) {
    const base = nome.replace(/\.(zip|cbz)$/i, "");
    const cap = base.match(/(?:cap(?:[ií]tulo)?|ch(?:apter)?|ep)[ .#_-]*(\d+(?:[.,]\d+)?)/i);
    const todos = base.match(/\d+(?:[.,]\d+)?/g);
    const n = cap ? cap[1] : todos ? todos[todos.length - 1] : null;
    return n == null ? "" : String(Number(n.replace(",", ".")));
  }

  function prepararImportador() {
    if (!window.JSZip) $("impMsg").textContent = "Carregando o leitor de .zip…";
  }

  $("impEscolher").onclick = () => $("impArquivos").click();
  $("impArquivos").onchange = (e) => { adicionarZips(e.target.files); e.target.value = ""; };
  const zonaImp = $("impSoltar");
  zonaImp.addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); zonaImp.classList.add("ativa"); } });
  zonaImp.addEventListener("dragleave", () => zonaImp.classList.remove("ativa"));
  zonaImp.addEventListener("drop", (e) => { e.preventDefault(); zonaImp.classList.remove("ativa"); adicionarZips(e.dataTransfer.files); });

  function adicionarZips(lista) {
    if (importando) return;
    const zips = [...lista].filter((f) => /\.(zip|cbz)$/i.test(f.name));
    if (!zips.length) return msg("impMsg", "Escolha arquivos .zip ou .cbz (um por capítulo).", "erro");
    const ja = new Set(fila.map((x) => x.file.name + x.file.size));
    for (const f of zips) if (!ja.has(f.name + f.size)) fila.push({ file: f, numero: numeroDoNome(f.name), status: "" });
    fila.sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0) || a.file.name.localeCompare(b.file.name, undefined, { numeric: true }));
    msg("impMsg", "");
    renderFila();
  }

  function renderFila() {
    const total = fila.reduce((s, x) => s + x.file.size, 0);
    $("impResumo").textContent = fila.length ? `${fila.length} capítulos · ${mb(total)}` : "";
    $("impTabela").innerHTML = fila.map((x, i) => `
      <div class="linha imp-linha ${x.status.startsWith("✓") ? "ok" : x.status.startsWith("✗") ? "falhou" : ""}">
        <label class="imp-num">Cap. <input type="number" step="any" min="0" value="${esc(x.numero)}" data-num="${i}" ${importando ? "disabled" : ""} /></label>
        <span class="imp-nome" title="${esc(x.file.name)}">${esc(x.file.name)}</span>
        <span class="sub">${mb(x.file.size)}</span>
        <span class="imp-status" id="impStatus${i}">${esc(x.status)}</span>
        ${importando ? "" : `<button class="btn mini-btn" data-tirar="${i}" title="Tirar da lista">✕</button>`}
      </div>`).join("");
    $("impTabela").querySelectorAll("[data-num]").forEach((inp) => (inp.onchange = () => { fila[inp.dataset.num].numero = inp.value; }));
    $("impTabela").querySelectorAll("[data-tirar]").forEach((b) => (b.onclick = () => { fila.splice(+b.dataset.tirar, 1); renderFila(); }));
    $("impIniciar").disabled = importando || !fila.length;
    $("impParar").hidden = !importando;
    $("impLimpar").hidden = importando || !fila.length;
  }
  const status = (i, t) => { fila[i].status = t; const el = $("impStatus" + i); if (el) el.textContent = t; };

  $("impLimpar").onclick = () => { fila = []; renderFila(); msg("impMsg", ""); };
  $("impParar").onclick = () => { parar = true; $("impParar").disabled = true; msg("impMsg", "Parando depois do capítulo atual…"); };
  $("impData").value = hoje();

  $("impIniciar").onclick = async () => {
    const serieId = $("impSerie").value;
    if (!serieId) return msg("impMsg", "Escolha a obra (cadastre na aba Obras primeiro).", "erro");
    if (!window.JSZip) return msg("impMsg", "O leitor de .zip ainda não carregou. Recarregue a página.", "erro");
    const nums = fila.map((x) => Number(x.numero));
    if (fila.some((x) => x.numero === "" || isNaN(Number(x.numero)))) return msg("impMsg", "Tem capítulo sem número. Preencha antes de importar.", "erro");
    if (new Set(nums).size !== nums.length) return msg("impMsg", "Tem dois arquivos com o mesmo número de capítulo.", "erro");

    const pular = $("impPular").checked;
    const comprimirOn = $("impComprimir").checked;
    const data = $("impData").value || hoje();

    const { data: existentes, error: e0 } = await sb.from("capitulos").select("numero,paginas").eq("serie_id", serieId);
    if (e0) return msg("impMsg", "Erro: " + e0.message, "erro");
    const jaTem = new Map(existentes.map((c) => [Number(c.numero), c.paginas]));

    importando = true; parar = false; $("impParar").disabled = false;
    renderFila();
    let ok = 0, pulados = 0, falhas = 0, bytes = 0;
    const t0 = Date.now();

    for (let i = 0; i < fila.length && !parar; i++) {
      const item = fila[i];
      if (item.status.startsWith("✓")) continue;
      const numero = Number(item.numero);
      if (pular && jaTem.has(numero)) { status(i, "– já existe, pulado"); pulados++; continue; }
      try {
        status(i, "abrindo .zip…");
        const zip = await JSZip.loadAsync(item.file);
        const imgs = Object.values(zip.files)
          .filter((f) => !f.dir && EXT_IMG.test(f.name) && !/(^|\/)(__MACOSX|\.)/.test(f.name))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
        if (!imgs.length) throw new Error("nenhuma imagem dentro do .zip");

        const pasta = `paginas/${serieId}/${numStr(numero)}`;
        const urls = new Array(imgs.length);
        let feitas = 0;
        const pend = imgs.map((_, k) => k);
        const trabalhador = async () => {
          while (pend.length) {
            const k = pend.shift();
            const ext0 = imgs[k].name.split(".").pop().toLowerCase();
            const bruto = new File([await imgs[k].async("blob")], imgs[k].name.split("/").pop(), { type: TIPO_IMG[ext0] || "image/jpeg" });
            const { blob, ext, tipo } = comprimirOn ? await comprimir(bruto) : { blob: bruto, ext: ext0 === "jpeg" ? "jpg" : ext0, tipo: bruto.type };
            urls[k] = await enviarArquivo(`${pasta}/${String(k + 1).padStart(3, "0")}.${ext}`, blob, tipo);
            bytes += blob.size; feitas++;
            status(i, `enviando ${feitas}/${imgs.length}…`);
          }
        };
        await Promise.all([trabalhador(), trabalhador(), trabalhador(), trabalhador()]);

        const { error } = await sb.from("capitulos").upsert({ serie_id: serieId, numero, data, paginas: urls }, { onConflict: "serie_id,numero" });
        if (error) throw error;
        if (jaTem.has(numero)) {
          const novas = new Set(urls.map(chaveDe));
          await removerArquivos(jaTem.get(numero).filter((u) => !novas.has(chaveDe(u))));
        }
        jaTem.set(numero, urls);
        status(i, `✓ ${imgs.length} páginas`); ok++;
      } catch (err) {
        console.error(item.file.name, err);
        status(i, "✗ " + (err.message || err)); falhas++;
        if (/membros/.test(err.message || "")) { parar = true; }
      }
      const min = (Date.now() - t0) / 60000;
      msg("impMsg", `${ok} publicados · ${pulados} pulados · ${falhas} com erro · ${mb(bytes)} enviados · ${min.toFixed(1)} min`);
    }

    importando = false;
    renderFila();
    msg("impMsg", `${parar ? "Parado. " : "Terminou! "}${ok} publicados, ${pulados} pulados, ${falhas} com erro · ${mb(bytes)} enviados.` +
      (falhas ? " Os que deram erro continuam na lista: clique em Importar de novo pra tentar só eles." : ""), falhas ? "erro" : "ok");
    if (!$("aba-capitulos").hidden) renderCapitulos();
  };

  // evita fechar a aba no meio da importação
  addEventListener("beforeunload", (e) => { if (importando) { e.preventDefault(); e.returnValue = ""; } });

  /* ============ LISTA DE CAPÍTULOS ============ */
  $("listaSerie").onchange = renderCapitulos;

  async function renderCapitulos() {
    const serieId = $("listaSerie").value;
    const t = $("tabelaCaps");
    if (!serieId) { t.innerHTML = `<p class="vazio">Nenhuma obra cadastrada.</p>`; return; }
    t.innerHTML = `<p class="vazio">Carregando…</p>`;
    const { data, error } = await sb.from("capitulos").select("numero,titulo,data,paginas").eq("serie_id", serieId).order("numero", { ascending: false });
    if (error) { t.innerHTML = `<p class="msg erro">${esc(error.message)}</p>`; return; }
    t.innerHTML = data.length ? data.map((c) => `
      <div class="linha">
        <div><b>Cap. ${numStr(c.numero)}</b> ${c.titulo ? `<span class="sub">${esc(c.titulo)}</span>` : ""}
          <div class="sub">${c.data.split("-").reverse().join("/")} · ${c.paginas.length} páginas</div></div>
        <div class="acoes">
          <a class="btn mini-btn" href="ler.html?s=${encodeURIComponent(serieId)}&c=${numStr(c.numero)}" target="_blank">Ler</a>
          <button class="btn mini-btn" data-editar="${c.numero}">Editar</button>
          <button class="btn mini-btn perigo" data-excluir="${c.numero}">Excluir</button>
        </div>
      </div>`).join("") : `<p class="vazio">Nenhum capítulo ainda.</p>`;

    t.querySelectorAll("[data-editar]").forEach((b) => (b.onclick = () => {
      const c = data.find((x) => String(x.numero) === b.dataset.editar);
      limparForm();
      $("capSerie").value = serieId; $("capSerie").disabled = true;
      $("capNumero").value = numStr(c.numero); $("capNumero").readOnly = true;
      $("capTitulo").value = c.titulo || ""; $("capData").value = c.data;
      $("dicaEditar").hidden = false; renderMiniaturas();
      abrirAba("enviar"); scrollTo(0, 0);
    }));
    t.querySelectorAll("[data-excluir]").forEach((b) => (b.onclick = async () => {
      const c = data.find((x) => String(x.numero) === b.dataset.excluir);
      if (!confirm(`Excluir o capítulo ${numStr(c.numero)} e todas as páginas dele? Não dá pra desfazer.`)) return;
      b.disabled = true;
      const { error } = await sb.from("capitulos").delete().eq("serie_id", serieId).eq("numero", c.numero);
      if (error) { alert("Erro: " + error.message); b.disabled = false; return; }
      await removerArquivos(c.paginas);
      renderCapitulos();
    }));
  }

  /* ============ OBRAS ============ */
  let editandoObra = null;
  let idManual = false;

  $("obraTitulo").oninput = () => { if (!editandoObra && !idManual) $("obraId").value = slug($("obraTitulo").value); };
  $("obraId").oninput = () => { idManual = true; };
  $("obraCapa").onchange = () => {
    const f = $("obraCapa").files[0];
    $("obraCapaPrev").hidden = !f;
    if (f) $("obraCapaPrev").src = URL.createObjectURL(f);
  };

  function formObra(s) {
    editandoObra = s || null; idManual = false;
    $("tituloFormObra").textContent = s ? `Editando: ${s.titulo}` : "Nova obra";
    $("obraTitulo").value = s?.titulo || "";
    $("obraId").value = s?.id || ""; $("obraId").readOnly = !!s;
    $("obraOriginal").value = s?.titulo_original || "";
    $("obraAutor").value = s?.autor || "";
    $("obraGeneros").value = (s?.generos || []).join(", ");
    $("obraStatus").value = s?.status || "Em andamento";
    $("obraSinopse").value = s?.sinopse || "";
    $("obraCapa").value = "";
    $("obraCapaPrev").hidden = !s?.capa_url; if (s?.capa_url) $("obraCapaPrev").src = s.capa_url;
    $("obraExcluir").hidden = !s;
    msg("obraMsg", "");
  }
  $("obraNova").onclick = () => formObra(null);

  function renderObras() {
    $("gradeObras").innerHTML = series.map((s) => `
      <a class="obra" href="#" data-obra="${esc(s.id)}">
        <div class="capa"><img src="${capa({ titulo: s.titulo, autor: s.autor, capa: s.capa_url, cores: s.cores || coresDe(s.id) })}" alt="" /></div>
        <h3>${esc(s.titulo)}</h3><div class="meta">Clique pra editar</div>
      </a>`).join("");
    $("gradeObras").querySelectorAll("[data-obra]").forEach((a) => (a.onclick = (e) => {
      e.preventDefault(); formObra(series.find((s) => s.id === a.dataset.obra)); scrollTo(0, 0);
    }));
  }

  $("formObra").onsubmit = async (e) => {
    e.preventDefault();
    const id = slug($("obraId").value);
    if (!id) return msg("obraMsg", "Preencha o endereço (id) da obra.", "erro");
    if (!editandoObra && series.some((s) => s.id === id)) return msg("obraMsg", "Já existe uma obra com esse endereço.", "erro");
    msg("obraMsg", "Salvando…");
    try {
      const dados = {
        id,
        titulo: $("obraTitulo").value.trim(),
        titulo_original: $("obraOriginal").value.trim() || null,
        autor: $("obraAutor").value.trim() || null,
        generos: $("obraGeneros").value.split(",").map((g) => g.trim()).filter(Boolean),
        status: $("obraStatus").value,
        sinopse: $("obraSinopse").value.trim() || null,
      };
      const f = $("obraCapa").files[0];
      if (f) {
        const { blob, ext, tipo } = await comprimir(f, 800, 0.9);
        const caminho = `capas/${id}-${Date.now()}.${ext}`;
        dados.capa_url = (await enviarArquivo(caminho, blob, tipo)).split("?")[0];
        if (editandoObra?.capa_url) await removerArquivos([editandoObra.capa_url]);
      }
      const { error } = await sb.from("series").upsert(dados);
      if (error) throw error;
      await recarregarSeries();
      formObra(series.find((s) => s.id === id));
      msg("obraMsg", "✓ Obra salva!", "ok");
    } catch (err) {
      msg("obraMsg", "Erro: " + (err.message || err), "erro");
    }
  };

  $("obraExcluir").onclick = async () => {
    const s = editandoObra; if (!s) return;
    const resp = prompt(`Isso apaga "${s.titulo}" e TODOS os capítulos dela, sem volta.\nDigite o título da obra pra confirmar:`);
    if (resp === null) return;
    if (resp.trim() !== s.titulo) return msg("obraMsg", "Título não confere. Nada foi apagado.", "erro");
    msg("obraMsg", "Excluindo…");
    const { data: caps } = await sb.from("capitulos").select("paginas").eq("serie_id", s.id);
    const { error } = await sb.from("series").delete().eq("id", s.id);
    if (error) return msg("obraMsg", "Erro: " + error.message, "erro");
    await removerArquivos([...(caps || []).flatMap((c) => c.paginas), s.capa_url].filter(Boolean));
    formObra(null);
    await recarregarSeries();
    msg("obraMsg", "Obra excluída.", "ok");
  };
})();
