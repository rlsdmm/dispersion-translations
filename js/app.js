/* Funções compartilhadas entre as páginas */
(function () {
  const D = window.DISPERSION;

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const store = {
    get(k, def) {
      try { const v = localStorage.getItem("dt:" + k); return v === null ? def : JSON.parse(v); } catch { return def; }
    },
    set(k, v) {
      try { localStorage.setItem("dt:" + k, JSON.stringify(v)); } catch {}
    },
  };

  /* ---------- Supabase ---------- */
  const cfg = window.DT_CONFIG || {};
  const sb = cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)
    : null;

  const PALETAS = [["#ff5e62", "#7b2ff7"], ["#43cea2", "#185a9d"], ["#f7971e", "#3a1c71"], ["#ee0979", "#ff6a00"], ["#00c6ff", "#0072ff"], ["#8e2de2", "#4a00e0"], ["#11998e", "#38ef7d"], ["#fc466b", "#3f5efb"]];
  function coresDe(id) {
    let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return PALETAS[h % PALETAS.length];
  }

  /* Carrega obras e capítulos. Sem Supabase configurado, usa os exemplos do data.js */
  async function carregar({ paginas = false } = {}) {
    if (!sb) return D.series;
    const campos = "serie_id,numero,titulo,data" + (paginas ? ",paginas" : "");
    // o Supabase devolve no máximo 1000 linhas por pedido: busca os capítulos em blocos
    async function todosCaps() {
      const N = 1000, total = [];
      for (let de = 0; ; de += N) {
        const r = await sb.from("capitulos").select(campos).order("serie_id").order("numero").range(de, de + N - 1);
        if (r.error) return r;
        total.push(...r.data);
        if (r.data.length < N) return { data: total };
      }
    }
    const [r1, r2, r3] = await Promise.all([
      sb.from("series").select("*").order("titulo"),
      todosCaps(),
      sb.rpc("caps_antecipados"),
    ]);
    if (r1.error) throw r1.error;
    if (r2.error) throw r2.error;
    // capítulos antecipados pra VIP: quem é VIP recebe no r2; os outros só veem o "cadeado"
    const antec = {};
    for (const a of r3.data || []) (antec[a.serie_id] = antec[a.serie_id] || []).push({
      numero: Number(a.numero), titulo: a.titulo, data: a.data, publicoEm: a.publico_em });
    D.series = r1.data.map((s) => ({
      id: s.id,
      titulo: s.titulo,
      tituloOriginal: s.titulo_original,
      autor: s.autor,
      generos: s.generos || [],
      status: s.status,
      sinopse: s.sinopse,
      capa: s.capa_url,
      cores: s.cores && s.cores.length === 2 ? s.cores : coresDe(s.id),
      capitulos: r2.data.filter((c) => c.serie_id === s.id).map((c) => {
        const a = (antec[s.id] || []).find((x) => x.numero === Number(c.numero));
        return { numero: Number(c.numero), titulo: c.titulo, data: c.data, urls: c.paginas, ...(a ? { vip: true, publicoEm: a.publicoEm } : {}) };
      }),
      antecipados: (antec[s.id] || []).filter((a) => !r2.data.some((c) => c.serie_id === s.id && Number(c.numero) === a.numero)),
    }));
    return D.series;
  }

  function iniciar(fn, opts) {
    return Promise.all([carregar(opts), conta.pronto]).then(fn).catch((e) => {
      console.error(e);
      document.body.insertAdjacentHTML("beforeend",
        `<p class="erro-pag">Não foi possível carregar as obras agora. Tente recarregar a página.</p>`);
    });
  }

  function serie(id) { return D.series.find((s) => s.id === id); }

  function capsOrdenados(s) { return [...s.capitulos].sort((a, b) => a.numero - b.numero); }

  function ultimoCap(s) { const c = capsOrdenados(s); return c[c.length - 1]; }

  function dataBR(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }

  function tempoRelativo(iso) {
    const dias = Math.floor((Date.now() - new Date(iso + "T12:00:00")) / 864e5);
    if (dias <= 0) return "hoje";
    if (dias === 1) return "ontem";
    if (dias < 7) return `há ${dias} dias`;
    if (dias < 30) return `há ${Math.floor(dias / 7)} sem.`;
    return dataBR(iso);
  }

  function svgURI(svg) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); }

  function quebrarTexto(txt, max) {
    const palavras = txt.split(" "); const linhas = []; let atual = "";
    for (const p of palavras) {
      if ((atual + " " + p).trim().length > max) { linhas.push(atual.trim()); atual = p; }
      else atual += " " + p;
    }
    if (atual.trim()) linhas.push(atual.trim());
    return linhas;
  }

  /* Capa provisória gerada quando a série não tem imagem */
  function capa(s) {
    if (s.capa) return s.capa;
    const [a, b] = s.cores || ["#6a5cff", "#1b1b2f"];
    const linhas = quebrarTexto(s.titulo.toUpperCase(), 12);
    const texto = linhas
      .map((l, i) => `<text x="30" y="${360 + i * 44 - (linhas.length - 1) * 44}" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="38" fill="#fff">${esc(l)}</text>`)
      .join("");
    return svgURI(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 430">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
      <pattern id="p" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="2" fill="#fff" opacity=".12"/></pattern></defs>
      <rect width="300" height="430" fill="url(#g)"/><rect width="300" height="430" fill="url(#p)"/>
      <circle cx="230" cy="110" r="70" fill="#fff" opacity=".14"/><circle cx="250" cy="90" r="34" fill="#fff" opacity=".18"/>
      <rect y="250" width="300" height="180" fill="#000" opacity=".28"/>
      ${texto}
      <text x="30" y="404" font-family="Arial,sans-serif" font-size="13" fill="#fff" opacity=".8" letter-spacing="2">${esc((s.autor || "").toUpperCase())}</text>
    </svg>`);
  }

  /* Lista de URLs das páginas de um capítulo */
  function paginas(s, cap) {
    if (cap.urls) return cap.urls;
    if (s.demo) {
      const n = typeof cap.paginas === "number" ? cap.paginas : cap.paginas.length;
      return Array.from({ length: n }, (_, i) => paginaDemo(s, cap, i + 1, n));
    }
    const pasta = cap.pasta || `capitulos/${s.id}/${cap.numero}`;
    const ext = cap.ext || "jpg";
    const nomes = Array.isArray(cap.paginas)
      ? cap.paginas
      : Array.from({ length: cap.paginas }, (_, i) => `${String(i + 1).padStart(3, "0")}.${ext}`);
    return nomes.map((n) => `${pasta}/${n}`);
  }

  function paginaDemo(s, cap, i, total) {
    const [a, b] = s.cores || ["#6a5cff", "#1b1b2f"];
    const paineis = [
      [40, 40, 720, 380], [40, 440, 350, 500], [410, 440, 350, 500], [40, 960, 720, 140],
    ];
    const rects = paineis
      .map(([x, y, w, h], k) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${k % 2 ? a : b}" opacity="${0.12 + k * 0.05}" stroke="#111" stroke-width="5"/>`)
      .join("");
    return svgURI(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1140">
      <rect width="800" height="1140" fill="#f4f1ea"/>${rects}
      <ellipse cx="560" cy="200" rx="150" ry="80" fill="#fff" stroke="#111" stroke-width="4"/>
      <text x="560" y="192" text-anchor="middle" font-family="Comic Sans MS,Arial,sans-serif" font-size="26" fill="#111">Página de</text>
      <text x="560" y="226" text-anchor="middle" font-family="Comic Sans MS,Arial,sans-serif" font-size="26" fill="#111">exemplo!</text>
      <text x="400" y="1040" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="40" fill="#111">${esc(s.titulo)}</text>
      <text x="400" y="1080" text-anchor="middle" font-family="Arial,sans-serif" font-size="26" fill="#333">Capítulo ${cap.numero} · Página ${i} de ${total}</text>
    </svg>`);
  }

  /* ---------- Progresso de leitura ----------
     Fica no navegador; com a conta logada também vai pro Supabase,
     e o que está na conta é trazido de volta ao entrar. */
  const lidos = {
    todos() { return store.get("lidos", {}); },
    marcar(sid, num) {
      const t = this.todos(); t[sid] = t[sid] || [];
      if (!t[sid].includes(num)) { t[sid].push(num); store.set("lidos", t); }
      conta.enviarHistorico(sid, num, { concluido: true });
    },
    foiLido(sid, num) { return (this.todos()[sid] || []).includes(num); },
    ultimo(sid) { return store.get("ultimo:" + sid, null); },
    abrir(sid, num) {
      store.set("ultimo:" + sid, num);
      store.set("quando:" + sid, new Date().toISOString().slice(0, 10));
      conta.enviarHistorico(sid, num, {});
    },
    posicao(sid, num) { return store.get("pos", {})[sid + "|" + num] || 0; },
    salvarPosicao(sid, num, pagina, total) {
      const p = store.get("pos", {});
      if (p[sid + "|" + num] === pagina) return;
      p[sid + "|" + num] = pagina; store.set("pos", p);
      conta.enviarHistorico(sid, num, { pagina, total });
    },
    esquecer(sid) {
      const t = this.todos(); delete t[sid]; store.set("lidos", t);
      try { localStorage.removeItem("dt:ultimo:" + sid); localStorage.removeItem("dt:quando:" + sid); } catch {}
    },
  };

  /* Onde continuar uma obra: { cap, rotulo } */
  function continuar(s) {
    const caps = capsOrdenados(s);
    if (!caps.length) return null;
    const ult = lidos.ultimo(s.id);
    const i = caps.findIndex((c) => c.numero === ult);
    if (i < 0) return { cap: caps[0], rotulo: "Começar a ler", inicio: true };
    if (lidos.foiLido(s.id, ult) && caps[i + 1]) return { cap: caps[i + 1], rotulo: "Continuar · Cap. " + caps[i + 1].numero };
    return { cap: caps[i], rotulo: "Continuar · Cap. " + caps[i].numero };
  }

  /* capítulos publicados depois da última leitura e ainda não lidos */
  function novosDesde(s) {
    const ult = lidos.ultimo(s.id);
    const quando = store.get("quando:" + s.id, null);
    if (ult == null || !quando) return [];
    return s.capitulos.filter((c) => c.numero > ult && (c.data || "") > quando && !lidos.foiLido(s.id, c.numero));
  }

  /* ---------- Conta do leitor ---------- */
  const conta = {
    user: null, perfil: null, membro: false, favoritos: new Set(), historico: [], pronto: null,
    /* VIP: quem apoiou (vip_ate no futuro) ou é da equipe */
    get vip() { return !!this.user && (this.membro || (!!this.perfil?.vip_ate && new Date(this.perfil.vip_ate) > new Date())); },

    async carregar() {
      if (!sb) return this;
      const { data } = await sb.auth.getSession();
      const user = data.session?.user || null;
      this.user = user;
      if (!user) return this;
      const [p, f, h, m] = await Promise.all([
        sb.from("perfis").select("apelido,prefs,banido,vip_ate").eq("user_id", user.id).maybeSingle(),
        sb.from("favoritos").select("serie_id,criado_em").order("criado_em", { ascending: false }),
        sb.from("historico").select("serie_id,numero,pagina,total,concluido,lido_em").order("lido_em", { ascending: false }).limit(3000),
        sb.rpc("is_membro"),
      ]);
      this.perfil = p.data || { apelido: (user.email || "leitor").split("@")[0], prefs: {} };
      this.membro = !!m.data;
      this.favoritos = new Set((f.data || []).map((x) => x.serie_id));
      this.historico = (h.data || []).map((x) => ({ ...x, numero: Number(x.numero) }));
      await this.mesclar();
      return this;
    },

    /* junta o progresso do navegador com o da conta */
    async mesclar() {
      const uid = this.user.id;
      const local = lidos.todos();
      if (!store.get("sync:" + uid, false)) {
        const ja = new Set(this.historico.filter((x) => x.concluido).map((x) => x.serie_id + "|" + x.numero));
        const subir = [];
        for (const [sid, nums] of Object.entries(local))
          for (const n of nums) if (!ja.has(sid + "|" + n)) subir.push({ user_id: uid, serie_id: sid, numero: n, concluido: true });
        if (subir.length) {
          const { error } = await sb.from("historico").upsert(subir, { onConflict: "user_id,serie_id,numero" });
          if (error) console.warn(error);
        }
        store.set("sync:" + uid, true);
      }
      // conta → navegador
      const t = {}; const pos = store.get("pos", {}); const vistos = new Set();
      for (const x of this.historico) {
        if (x.concluido) (t[x.serie_id] = t[x.serie_id] || []).push(x.numero);
        if (!vistos.has(x.serie_id)) {
          vistos.add(x.serie_id);
          store.set("ultimo:" + x.serie_id, x.numero);
          store.set("quando:" + x.serie_id, new Date(x.lido_em).toISOString().slice(0, 10));
        }
        if (!x.concluido && x.pagina) pos[x.serie_id + "|" + x.numero] = x.pagina;
      }
      for (const [sid, nums] of Object.entries(local))
        for (const n of nums) if (!(t[sid] || []).includes(n)) (t[sid] = t[sid] || []).push(n);
      store.set("lidos", t); store.set("pos", pos);
      for (const [k, v] of Object.entries(this.perfil.prefs || {})) store.set(k, v);
      aplicarTema(temaAtual());
    },

    _fila: {}, _timer: null,
    enviarHistorico(sid, num, campos) {
      if (!sb || !this.user) return;
      const k = sid + "|" + num;
      const agora = new Date().toISOString();
      this._fila[k] = { ...(this._fila[k] || {}), user_id: this.user.id, serie_id: sid, numero: num, lido_em: agora, ...campos };
      const h = this.historico.find((x) => x.serie_id === sid && x.numero === num);
      if (h) Object.assign(h, campos, { lido_em: agora });
      else this.historico.unshift({ serie_id: sid, numero: num, pagina: 0, concluido: false, ...campos, lido_em: agora });
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this.descarregar(), campos.concluido ? 0 : 3000);
    },
    descarregar() {
      const linhas = Object.values(this._fila); this._fila = {};
      // agrupa por conjunto de campos, pra nunca mandar "concluido: false" por cima de um capítulo lido
      const grupos = {};
      for (const l of linhas) { const g = Object.keys(l).sort().join(); (grupos[g] = grupos[g] || []).push(l); }
      for (const g of Object.values(grupos))
        sb.from("historico").upsert(g, { onConflict: "user_id,serie_id,numero" }).then(({ error }) => error && console.warn(error));
    },

    _prefTimer: null,
    salvarPref(k, v) {
      store.set(k, v);
      if (!sb || !this.user || !this.perfil) return;
      this.perfil.prefs = { ...(this.perfil.prefs || {}), [k]: v };
      clearTimeout(this._prefTimer);
      this._prefTimer = setTimeout(() => sb.from("perfis").update({ prefs: this.perfil.prefs }).eq("user_id", this.user.id).then(() => {}), 1200);
    },

    async favoritar(sid, sim) {
      const q = sim
        ? sb.from("favoritos").upsert({ user_id: this.user.id, serie_id: sid }, { onConflict: "user_id,serie_id" })
        : sb.from("favoritos").delete().eq("user_id", this.user.id).eq("serie_id", sid);
      const { error } = await q;
      if (error) throw error;
      sim ? this.favoritos.add(sid) : this.favoritos.delete(sid);
    },

    /* link pra tela de entrar que volta pra página atual depois */
    linkEntrar() { return "conta.html?volta=" + encodeURIComponent(location.pathname.split("/").pop() + location.search); },
  };
  addEventListener("pagehide", () => conta.descarregar());
  addEventListener("visibilitychange", () => document.visibilityState === "hidden" && conta.descarregar());
  conta.pronto = conta.carregar().catch((e) => { console.warn(e); return conta; });
  conta.pronto.then(() => aplicarTema(temaAtual())); // tema exclusivo de VIP volta pro padrão se não for VIP

  function avatar(nome, id, cls = "") {
    const [a, b] = coresDe(id || nome || "?");
    return `<span class="avatar ${cls}" style="background:linear-gradient(135deg,${a},${b})">${esc((nome || "?").trim().charAt(0).toUpperCase())}</span>`;
  }

  /* atualiza o topo quando a conta termina de carregar */
  function atualizarNav() {
    const el = document.getElementById("navConta");
    const bib = document.getElementById("navBib");
    if (!el) return;
    if (!sb) { el.hidden = true; if (bib) bib.hidden = true; return; }
    if (conta.user) {
      el.innerHTML = avatar(conta.perfil.apelido, conta.user.id) + `<span class="so-desk-nav">${esc(conta.perfil.apelido)}</span>`;
      el.title = "Minha conta";
      const novos = D.series.filter((s) => conta.favoritos.has(s.id) && novosDesde(s).length).length;
      if (bib && novos && !bib.querySelector(".bolinha")) bib.insertAdjacentHTML("beforeend", `<span class="bolinha" title="Obras favoritas com capítulo novo">${novos}</span>`);
    } else {
      el.textContent = "Entrar";
      el.href = conta.linkEntrar();
    }
  }

  /* ---------- tema (visual) escolhido pelo leitor ---------- */
  const TEMAS = [
    ["azul", "Azul", "#070b16", "#3b82f6", "#22d3ee"],
    ["roxo", "Roxo", "#0d0d14", "#8b5cf6", "#ec4899"],
    ["papel", "Papel", "#f4efe6", "#c1272d", "#1d1a16"],
    ["neon", "Neon", "#050505", "#a3e635", "#22d3ee", true],
    ["sakura", "Sakura", "#1a1018", "#f472b6", "#fb923c", true],
    ["edgy", "Edgy", "#080606", "#dc2626", "#fb3b55", true],
    ["fofinho", "Fofinho", "#fff6fa", "#ff7eb6", "#b69cff", true],
  ];
  const temaVip = (t) => TEMAS.some((x) => x[0] === t && x[5]);
  const temaAtual = () => {
    const t = store.get("tema", "azul");
    if (!TEMAS.some((x) => x[0] === t)) return "azul";
    return temaVip(t) && !conta.vip ? "azul" : t;
  };
  function aplicarTema(t) {
    const raiz = document.documentElement;
    if (!t || t === "azul" || t === "padrao") { delete raiz.dataset.tema; return; }
    raiz.dataset.tema = t;
    if (!document.getElementById("fontesTemas")) {
      const l = document.createElement("link");
      l.id = "fontesTemas"; l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@600;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Space+Grotesk:wght@400;600;700&family=Nunito:wght@400;600;800;900&family=Oswald:wght@500;700&family=Rubik:wght@400;500;700&family=Fredoka:wght@400;500;600;700&display=swap";
      document.head.append(l);
    }
  }
  function menuTema() {
    const at = temaAtual();
    return TEMAS.map(([id, nome, bg, a, b, vip]) => {
      const travado = vip && !conta.vip;
      return `<button type="button" class="op-tema ${id === at ? "on" : ""} ${travado ? "travado" : ""}" data-tema="${id}" ${travado ? 'title="Tema exclusivo para apoiadores VIP"' : ""}>
      <span class="amostra" style="background:${bg}"><i style="background:linear-gradient(135deg,${a},${b})"></i></span>${nome}${
        id === "azul" ? " <small>padrão</small>" : vip ? ` <small class="${travado ? "" : "vip-ok"}">${travado ? "🔒 VIP" : "VIP"}</small>` : ""}</button>`;
    }).join("");
  }
  document.addEventListener("click", (e) => {
    const menu = document.getElementById("menuTema");
    if (!menu) return;
    if (e.target.closest("#btnTema")) { menu.hidden = !menu.hidden; if (!menu.hidden) menu.innerHTML = menuTema(); return; }
    const op = e.target.closest(".op-tema");
    if (op) {
      if (op.classList.contains("travado")) { location.href = "apoie.html#vip"; return; }
      conta.salvarPref("tema", op.dataset.tema); aplicarTema(op.dataset.tema); menu.innerHTML = menuTema(); return;
    }
    if (!e.target.closest("#menuTema")) menu.hidden = true;
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { const m = document.getElementById("menuTema"); if (m) m.hidden = true; } });

  function header(ativo) {
    setTimeout(() => conta.pronto.then(atualizarNav));
    return `<header class="topo">
      <a class="marca" href="index.html"><span class="logo">D</span><span>Dispersion<b>Translations</b></span></a>
      <nav>
        <a href="index.html" class="so-desk-nav ${ativo === "inicio" ? "on" : ""}">Início</a>
        <a href="index.html#obras" class="so-desk-nav">Obras</a>
        <a href="biblioteca.html" id="navBib" class="${ativo === "biblioteca" ? "on" : ""}" title="Minha biblioteca">📚<span class="so-desk-nav"> Biblioteca</span></a>
        <a href="apoie.html" class="btn-apoie ${ativo === "apoie" ? "on" : ""}" title="Apoie o grupo">💙<span class="so-desk-nav"> Apoie</span></a>
        <a href="${esc(D.grupo.discord)}" target="_blank" rel="noopener" class="btn-discord">Discord</a>
        <span class="tema-wrap"><button type="button" id="btnTema" class="btn-tema" title="Mudar o visual do site" aria-label="Mudar o visual do site">🎨</button>
          <div class="menu-tema" id="menuTema" hidden></div></span>
        <a href="conta.html" id="navConta" class="nav-conta ${ativo === "conta" ? "on" : ""}">Entrar</a>
      </nav>
    </header>`;
  }

  function footer() {
    return `<footer class="rodape">
      <p><b>${esc(D.grupo.nome)}</b> — ${esc(D.grupo.slogan)}</p>
      <p class="aviso">Projeto de fãs, sem fins lucrativos. Todos os direitos das obras pertencem aos seus autores e editoras. Apoie o lançamento oficial quando disponível.</p>
      <p class="aviso"><a href="index.html#sobre">Sobre</a> · <a href="privacidade.html">Privacidade</a> · <a href="admin.html">Área do grupo</a></p>
    </footer>`;
  }

  /* barrinha da meta do mês ("já recebemos X de Y") — usada na página Apoie e na inicial */
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  /* ---------- XP: níveis e conquistas (o XP em si vem do banco: supabase/xp-e-conquistas.sql) ---------- */
  const NIVEIS = [
    [0, "Novato", "🌱"], [100, "Leitor", "📖"], [300, "Leitor Assíduo", "📚"], [700, "Devorador de Mangá", "🍙"],
    [1500, "Otaku", "⭐"], [3000, "Veterano", "🗡️"], [6000, "Sensei", "🎴"], [12000, "Lenda da Dispersion", "🐉"],
  ];
  function nivel(xp) {
    xp = Number(xp) || 0;
    let i = 0;
    while (i + 1 < NIVEIS.length && xp >= NIVEIS[i + 1][0]) i++;
    const [de, nome, emoji] = NIVEIS[i], prox = NIVEIS[i + 1];
    return { n: i + 1, nome, emoji, xp, de, ate: prox ? prox[0] : null, proxNome: prox ? prox[1] : null,
      pct: prox ? Math.min(100, Math.round(((xp - de) / (prox[0] - de)) * 100)) : 100 };
  }
  const seloNivel = (xp) => {
    const v = nivel(xp);
    return `<span class="selo-nivel nv${Math.min(v.n, 8)}" title="Nível ${v.n} · ${v.nome} · ${v.xp} XP">${v.emoji} Nv ${v.n}</span>`;
  };
  // [id, emoji, nome, descrição, teste(stats)]
  const CONQUISTAS = [
    ["cap1", "📖", "Primeiro capítulo", "Terminou de ler um capítulo", (x) => x.caps >= 1],
    ["cap50", "📚", "Maratonista", "Terminou 50 capítulos", (x) => x.caps >= 50],
    ["cap250", "🏃", "Devorador", "Terminou 250 capítulos", (x) => x.caps >= 250],
    ["cap1000", "🐉", "Mil capítulos", "Terminou 1000 capítulos", (x) => x.caps >= 1000],
    ["obra1", "🏁", "Do começo ao fim", "Leu todos os capítulos de uma obra", (x) => x.obras >= 1],
    ["obra10", "🏆", "Colecionador", "Terminou 10 obras", (x) => x.obras >= 10],
    ["com1", "💬", "Primeira palavra", "Deixou o primeiro comentário", (x) => x.comentarios >= 1],
    ["com50", "🗣️", "Tagarela", "Fez 50 comentários", (x) => x.comentarios >= 50],
    ["seq7", "🔥", "Uma semana seguida", "Leu ou comentou 7 dias seguidos", (x) => x.melhor_seq >= 7],
    ["seq30", "☄️", "Um mês sem parar", "Leu ou comentou 30 dias seguidos", (x) => x.melhor_seq >= 30],
    ["fav10", "♥", "Coração grande", "Favoritou 10 obras", (x) => x.favoritos >= 10],
    ["coruja", "🌙", "Coruja", "Terminou um capítulo entre meia-noite e 5h", (x) => x.coruja],
    ["apoio", "💙", "Apoiador", "Apoiou a Dispersion", (x) => x.apoiador],
  ];

  async function metaDoMes(el, { compacta = false } = {}) {
    const A = D.grupo.apoie || {};
    if (!el || !sb || !A.metaMensal) return;
    const { data, error } = await sb.rpc("arrecadado_mes");
    if (error || !data) return;
    const total = Number(data.total) || 0, meta = Number(A.metaMensal);
    const pct = Math.min(100, Math.round((total / meta) * 100));
    const real = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: v % 1 ? 2 : 0 });
    const mes = MESES[Number(String(data.mes).slice(5, 7)) - 1] || "";
    const batida = total >= meta;
    el.innerHTML = `<div class="meta ${compacta ? "compacta" : ""} ${batida ? "batida" : ""}">
      <div class="meta-topo">
        <span>${batida ? "🎉 Meta de " + mes + " batida!" : "💙 Meta de " + mes}</span>
        <span><b>${real(total)}</b> de ${real(meta)}</span>
      </div>
      <div class="meta-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Meta do mês"><div style="width:${Math.max(pct, total > 0 ? 3 : 0)}%"></div></div>
      <div class="meta-pe">
        <span>${data.apoios ? `${data.apoios} ${data.apoios === 1 ? "apoio" : "apoios"} este mês · ${pct}%` : "Ninguém apoiou ainda este mês. Seja a primeira pessoa!"}${!compacta && A.metaPra ? ` · pra ${esc(A.metaPra)}` : ""}</span>
        ${compacta ? `<a href="apoie.html">Apoiar →</a>` : ""}
      </div>
    </div>`;
    el.hidden = false;
  }

  window.DT = {
    D, sb, carregar, iniciar, coresDe, esc, store, serie, capsOrdenados, ultimoCap, dataBR, tempoRelativo, capa, paginas,
    lidos, continuar, novosDesde, conta, avatar, atualizarNav, header, footer, metaDoMes, nivel, seloNivel, NIVEIS, CONQUISTAS,
  };
})();
