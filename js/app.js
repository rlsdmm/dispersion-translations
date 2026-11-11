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

  /* Progresso de leitura salvo no navegador */
  const lidos = {
    todos() { return store.get("lidos", {}); },
    marcar(sid, num) { const t = this.todos(); t[sid] = t[sid] || []; if (!t[sid].includes(num)) t[sid].push(num); store.set("lidos", t); store.set("ultimo:" + sid, num); },
    foiLido(sid, num) { return (this.todos()[sid] || []).includes(num); },
    ultimo(sid) { return store.get("ultimo:" + sid, null); },
  };

  function header(ativo) {
    return `<header class="topo">
      <a class="marca" href="index.html"><span class="logo">D</span><span>Dispersion<b>Translations</b></span></a>
      <nav>
        <a href="index.html" class="${ativo === "inicio" ? "on" : ""}">Início</a>
        <a href="index.html#obras">Obras</a>
        <a href="index.html#sobre">Sobre</a>
        <a href="${esc(D.grupo.discord)}" target="_blank" rel="noopener" class="btn-discord">Discord</a>
      </nav>
    </header>`;
  }

  function footer() {
    return `<footer class="rodape">
      <p><b>${esc(D.grupo.nome)}</b> — ${esc(D.grupo.slogan)}</p>
      <p class="aviso">Projeto de fãs, sem fins lucrativos. Todos os direitos das obras pertencem aos seus autores e editoras. Apoie o lançamento oficial quando disponível.</p>
    </footer>`;
  }

  window.DT = { D, esc, store, serie, capsOrdenados, ultimoCap, dataBR, tempoRelativo, capa, paginas, lidos, header, footer };
})();
