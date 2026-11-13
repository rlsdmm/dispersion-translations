/* Conta do leitor: entrar, criar conta, recuperar senha, perfil e exclusão */
(function () {
  const { sb, esc, conta, header, footer, avatar, store } = DT;
  const $ = (id) => document.getElementById(id);
  $("topo").innerHTML = header("conta");
  $("rodape").innerHTML = footer();

  if (!sb) { $("semConfig").hidden = false; return; }

  const telas = ["telaEntrar", "formSenha", "telaPerfil"];
  const mostrar = (id) => telas.forEach((t) => ($(t).hidden = t !== id));
  const msg = (id, texto, tipo = "") => { const el = $(id); el.textContent = texto; el.className = "msg " + tipo; };

  // pra onde voltar depois de entrar (só páginas deste site)
  const volta = (() => {
    const v = new URLSearchParams(location.search).get("volta") || "";
    return /^[a-z]+\.html(\?[^#]*)?$/i.test(v) && !v.startsWith("conta.html") ? v : "";
  })();
  const aqui = location.origin + location.pathname;
  const redirecionar = aqui + (volta ? "?volta=" + encodeURIComponent(volta) : "");

  let recuperando = /type=recovery/.test(location.hash);
  let modo = "entrar";

  /* ---------- entrar / criar conta ---------- */
  document.querySelectorAll("[data-modo]").forEach((b) => (b.onclick = () => trocarModo(b.dataset.modo)));
  function trocarModo(m) {
    modo = m;
    document.querySelectorAll("[data-modo]").forEach((x) => x.classList.toggle("on", x.dataset.modo === m));
    const criar = m === "criar";
    $("campoApelido").hidden = !criar;
    $("campoAceite").hidden = !criar;
    $("apelido").required = criar;
    $("aceite").required = criar;
    $("senha").autocomplete = criar ? "new-password" : "current-password";
    $("btnEntrar").textContent = criar ? "Criar conta" : "Entrar";
    $("esqueci").hidden = criar;
    msg("msgEntrar", "");
  }
  if (new URLSearchParams(location.search).get("criar")) trocarModo("criar");

  // login social (Discord/Google), só os que estiverem ligados no config.js
  const NOMES = { discord: "Discord", google: "Google" };
  const provs = (window.DT_CONFIG.provedores || []).filter((p) => NOMES[p]);
  $("sociais").innerHTML = provs.length
    ? provs.map((p) => `<button class="btn social ${p}" data-prov="${p}">Continuar com ${NOMES[p]}</button>`).join("") + `<p class="ou"><span>ou com e-mail</span></p>`
    : "";
  document.querySelectorAll("[data-prov]").forEach((b) => (b.onclick = async () => {
    const { error } = await sb.auth.signInWithOAuth({ provider: b.dataset.prov, options: { redirectTo: redirecionar } });
    if (error) msg("msgEntrar", "Erro: " + error.message, "erro");
  }));

  const traduzir = (e) => {
    const m = (e && e.message) || "";
    if (/Invalid login/i.test(m)) return "E-mail ou senha incorretos.";
    if (/already registered|already been registered/i.test(m)) return "Esse e-mail já tem conta. Tente entrar.";
    if (/Email not confirmed/i.test(m)) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
    if (/Password should be/i.test(m)) return "A senha precisa ter pelo menos 8 caracteres.";
    if (/rate limit|too many/i.test(m)) return "Muitas tentativas. Espere um pouco e tente de novo.";
    if (/Signups not allowed/i.test(m)) return "Cadastros estão fechados no momento.";
    return "Erro: " + m;
  };

  $("formEntrar").onsubmit = async (e) => {
    e.preventDefault();
    const email = $("email").value.trim(), password = $("senha").value;
    $("btnEntrar").disabled = true;
    if (modo === "criar") {
      msg("msgEntrar", "Criando conta…");
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { apelido: $("apelido").value.trim() }, emailRedirectTo: redirecionar },
      });
      $("btnEntrar").disabled = false;
      if (error) return msg("msgEntrar", traduzir(error), "erro");
      if (!data.session) return msg("msgEntrar", "Conta criada! Enviamos um link pro seu e-mail pra confirmar.", "ok");
      return entrou();
    }
    msg("msgEntrar", "Entrando…");
    const { error } = await sb.auth.signInWithPassword({ email, password });
    $("btnEntrar").disabled = false;
    if (error) return msg("msgEntrar", traduzir(error), "erro");
    entrou();
  };

  $("esqueci").onclick = async () => {
    const email = $("email").value.trim();
    if (!email) return msg("msgEntrar", "Digite seu e-mail primeiro.", "erro");
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: aqui });
    msg("msgEntrar", error ? traduzir(error) : "Se o e-mail tiver conta, chega um link pra criar uma nova senha.", error ? "erro" : "ok");
  };

  $("formSenha").onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: $("novaSenha").value });
    if (error) return msg("msgSenha", traduzir(error), "erro");
    recuperando = false;
    history.replaceState(null, "", location.pathname);
    entrou();
  };

  // depois de entrar: volta pra página de onde veio, ou recarrega o perfil
  function entrou() {
    if (volta) location.href = volta;
    else location.replace(location.pathname);
  }

  /* ---------- perfil ---------- */
  function renderPerfil() {
    const p = conta.perfil;
    $("perfilAvatar").innerHTML = avatar(p.apelido, conta.user.id, "grande");
    $("perfilNome").textContent = p.apelido;
    $("perfilEmail").textContent = conta.user.email || "";
    $("novoApelido").value = p.apelido;
    $("linkAdmin").hidden = !conta.membro;
    // conta criada com Discord/Google não tem senha pra trocar
    const soSocial = !(conta.user.identities || []).some((i) => i.provider === "email");
    $("formTrocaSenha").hidden = soSocial;
    mostrar("telaPerfil");
    renderXp();
    renderPublico();
  }

  /* ---------- perfil público: bio, redes, mensagens ---------- */
  function renderPublico() {
    const p = conta.perfil;
    $("linkMeuPerfil").href = DT.linkPerfil(conta.user.id);
    $("bio").value = p.bio || "";
    $("contaBio").textContent = $("bio").value.length;
    $("bio").oninput = () => ($("contaBio").textContent = $("bio").value.length);
    $("camposRedes").innerHTML = DT.REDES.map(([k, nome, pre]) => `
      <label>${nome}<input type="text" data-rede="${k}" maxlength="120" value="${DT.esc(p.redes?.[k] || "")}"
        placeholder="${pre ? "seu usuário" : "seu usuário no Discord"}" autocomplete="off" spellcheck="false" /></label>`).join("");
    $("aceitaMsg").checked = p.aceita_mensagens !== false;
    if (location.hash === "#perfilPublico") setTimeout(() => $("perfilPublico").scrollIntoView({ behavior: "smooth" }), 200);
  }
  $("perfilPublico").onsubmit = async (e) => {
    e.preventDefault();
    const redes = {};
    for (const inp of document.querySelectorAll("[data-rede]")) {
      const u = DT.limparUsuario(inp.value);
      inp.value = u;
      if (!u) continue;
      if (!DT.usuarioValido(u)) return msg("msgPublico", `O usuário de ${inp.closest("label").firstChild.textContent.trim()} tem caracteres inválidos.`, "erro");
      redes[inp.dataset.rede] = u;
    }
    const dados = { bio: $("bio").value.trim() || null, redes, aceita_mensagens: $("aceitaMsg").checked };
    const { error } = await DT.sb.from("perfis").update(dados).eq("user_id", conta.user.id);
    if (error) return msg("msgPublico", "Não deu pra salvar: " + error.message, "erro");
    Object.assign(conta.perfil, dados);
    msg("msgPublico", "Perfil salvo! ", "ok");
    $("msgPublico").insertAdjacentHTML("beforeend", `<a class="link" href="${DT.linkPerfil(conta.user.id)}">Ver como ficou →</a>`);
  };

  /* ---------- XP, nível e conquistas ---------- */
  async function renderXp() {
    const el = $("cardXp");
    const { data: x, error } = await DT.sb.rpc("meu_xp");
    if (error || !x) return;
    const v = DT.nivel(x.xp);
    const feitas = DT.CONQUISTAS.filter((c) => c[4](x)).length;
    const num = (n, um, varios) => `<div><b>${n}</b><small>${n === 1 ? um : varios}</small></div>`;
    el.innerHTML = `
      <div class="xp-topo">
        <div class="xp-nivel nv${Math.min(v.n, 8)}"><span>${v.emoji}</span><small>Nível</small><b>${v.n}</b></div>
        <div class="xp-info">
          <h2>${v.nome}</h2>
          <div class="xp-barra" role="progressbar" aria-valuemin="${v.de}" aria-valuemax="${v.ate ?? v.xp}" aria-valuenow="${v.xp}"><div style="width:${v.pct}%"></div></div>
          <p class="sub"><b class="xp-num">${v.xp.toLocaleString("pt-BR")} XP</b> · ${v.ate
            ? `faltam ${(v.ate - v.xp).toLocaleString("pt-BR")} XP pra <b>${v.proxNome}</b>`
            : "nível máximo, você é lenda!"}</p>
        </div>
        ${x.seq_atual > 1 ? `<div class="xp-fogo" title="Dias seguidos lendo ou comentando">🔥 ${x.seq_atual} dias seguidos</div>` : ""}
      </div>
      <div class="xp-stats">
        ${num(x.caps, "capítulo lido", "capítulos lidos")}
        ${num(x.obras, "obra terminada", "obras terminadas")}
        ${num(x.comentarios, "comentário", "comentários")}
        ${num(x.dias, "dia ativo", "dias ativos")}
        ${num(x.melhor_seq, "dia (maior sequência)", "dias (maior sequência)")}
      </div>
      <h3>Conquistas <span class="sub">${feitas} de ${DT.CONQUISTAS.length}</span></h3>
      <div class="conquistas">${DT.CONQUISTAS.map(([id, emoji, nome, desc, ok]) => `
        <div class="conquista ${ok(x) ? "ok" : ""}" title="${desc}">
          <span>${ok(x) ? emoji : "🔒"}</span><b>${nome}</b><small>${desc}</small>
        </div>`).join("")}</div>
      <details class="xp-como">
        <summary>Como ganhar XP</summary>
        <ul>
          <li><b>+10</b> por capítulo que você termina de ler (até 150 por dia)</li>
          <li><b>+5</b> por comentário (até 10 por dia)</li>
          <li><b>+50</b> quando termina todos os capítulos de uma obra</li>
          <li><b>+5</b> por dia em que você lê ou comenta</li>
          <li>💙 <b>VIP ganha XP em dobro</b> em capítulos e comentários. <a class="link" href="apoie.html#vip">Saiba mais</a></li>
        </ul>
        <p class="sub">Níveis: ${DT.NIVEIS.map(([de, nome, e], i) => `${e} ${i + 1} ${nome} (${de.toLocaleString("pt-BR")})`).join(" · ")}</p>
      </details>`;
    el.hidden = false;
  }

  $("formPerfil").onsubmit = async (e) => {
    e.preventDefault();
    const apelido = $("novoApelido").value.trim();
    if (apelido.length < 2) return msg("msgPerfil", "O apelido precisa ter pelo menos 2 letras.", "erro");
    const { error } = await sb.from("perfis").upsert({ user_id: conta.user.id, apelido }, { onConflict: "user_id" });
    if (error) return msg("msgPerfil", traduzir(error), "erro");
    conta.perfil.apelido = apelido;
    msg("msgPerfil", "Salvo!", "ok");
    renderPerfil();
    $("navConta").innerHTML = avatar(apelido, conta.user.id) + `<span class="so-desk-nav">${esc(apelido)}</span>`;
  };

  $("formTrocaSenha").onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: $("trocaSenha").value });
    msg("msgTroca", error ? traduzir(error) : "Senha trocada!", error ? "erro" : "ok");
    if (!error) $("trocaSenha").value = "";
  };

  $("sair").onclick = async () => {
    conta.descarregar();
    await sb.auth.signOut();
    location.replace(location.pathname);
  };

  $("baixarDados").onclick = async () => {
    const [f, h, c, p] = await Promise.all([
      sb.from("favoritos").select("*"),
      sb.from("historico").select("*"),
      sb.from("comentarios").select("*").eq("user_id", conta.user.id),
      sb.from("perfis").select("*").eq("user_id", conta.user.id),
    ]);
    const dados = { email: conta.user.email, criado_em: conta.user.created_at, perfil: p.data, favoritos: f.data, historico: h.data, comentarios: c.data };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" }));
    a.download = "meus-dados-dispersion.json";
    a.click();
  };

  $("excluirConta").onclick = async () => {
    if (conta.membro) return msg("msgDados", "Contas de membros do grupo precisam ser removidas pelo admin no Supabase.", "erro");
    const r = prompt('Isso apaga sua conta, favoritos, histórico e comentários pra sempre.\nDigite EXCLUIR pra confirmar:');
    if (r !== "EXCLUIR") return;
    const { error } = await sb.rpc("excluir_conta");
    if (error) return msg("msgDados", "Erro: " + error.message, "erro");
    await sb.auth.signOut();
    try { Object.keys(localStorage).filter((k) => k.startsWith("dt:")).forEach((k) => localStorage.removeItem(k)); } catch {}
    alert("Sua conta foi excluída.");
    location.href = "index.html";
  };

  /* ---------- início ---------- */
  sb.auth.onAuthStateChange((ev) => { if (ev === "PASSWORD_RECOVERY") { recuperando = true; mostrar("formSenha"); } });
  conta.pronto.then(() => {
    if (recuperando && conta.user) return mostrar("formSenha");
    if (conta.user) {
      // já logado (ou voltando de login social / link de confirmação): segue pra onde ia
      if (volta) return location.replace(volta);
      return renderPerfil();
    }
    mostrar("telaEntrar");
  });
})();
