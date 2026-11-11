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
