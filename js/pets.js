/* ============================================================
 *  PETS: desenhos (SVG) do ovo e dos bichinhos
 *  O sorteio e o "chocar" acontecem no banco (supabase/pets.sql).
 *  Cada bicho é desenhado aqui a partir da espécie + cor (0–359).
 * ============================================================ */
(function () {
  const RARIDADES = {
    comum: ["Comum", "#94a3b8"],
    incomum: ["Incomum", "#4ade80"],
    raro: ["Raro", "#60a5fa"],
    lendario: ["Lendário", "#fbbf24"],
  };
  // id: [nome, raridade, descrição]
  const ESPECIES = {
    bolinho: ["Bolinho", "comum", "Uma gotinha de geleia que pula de alegria quando você termina um capítulo."],
    pipoca: ["Pipoca", "comum", "Um passarinho redondo que cochila em cima dos mangás abertos."],
    mochi: ["Mochi", "comum", "Coelhinho fofo e macio, adora virar páginas com as patinhas."],
    nuvem: ["Nuvenzinha", "incomum", "Uma nuvem que flutua pelo site e chora de emoção nos finais tristes."],
    brotinho: ["Brotinho", "incomum", "Cresce um pouquinho a cada obra que você termina de ler."],
    estrelinha: ["Estrelinha", "raro", "Caiu do céu numa noite de lançamento e nunca mais foi embora."],
    nanquim: ["Nanquim", "raro", "Nasceu de uma gota de tinta da mesa de um mangaká. Deixa marquinhas por onde passa."],
    draguinho: ["Draguinho", "lendario", "Um dragão minúsculo que guarda a sua estante. Dizem que só aparece pra leitores dedicados."],
  };

  const hsl = (h, s, l) => `hsl(${h} ${s}% ${l}%)`;
  const paleta = (h) => ({ c1: hsl(h, 75, 74), c2: hsl(h, 60, 60), c3: hsl(h, 90, 91), linha: hsl(h, 35, 28) });

  // humor do desenho atual: feliz | radiante | triste | fome | dormindo
  let HUMOR = "feliz";

  // rostinho padrão: olhos brilhantes, bochechas e boquinha "w" (muda com o humor)
  function rosto(cx, cy, linha, { boca = true, e = 1, olhoCor = "#2b1d2e" } = {}) {
    const dx = 13 * e, h = HUMOR;
    const arco = (x, baixo) => `<path d="M${x - 6 * e} ${cy + (baixo ? -1 : 2) * e} q${6 * e} ${(baixo ? 6 : -8) * e} ${12 * e} 0" stroke="${olhoCor}" stroke-width="${3 * e}" fill="none" stroke-linecap="round"/>`;
    const olho = (x) => `<ellipse cx="${x}" cy="${cy}" rx="${5.5 * e}" ry="${7 * e}" fill="${olhoCor}"/>
      <circle cx="${x + 1.8 * e}" cy="${cy - 2.6 * e}" r="${2.3 * e}" fill="#fff"/><circle cx="${x - 1.6 * e}" cy="${cy + 2.4 * e}" r="${1 * e}" fill="#fff" opacity=".8"/>`;
    const olhos = h === "radiante" ? arco(cx - dx) + arco(cx + dx)
      : h === "dormindo" ? arco(cx - dx, true) + arco(cx + dx, true)
      : olho(cx - dx) + olho(cx + dx);
    const sobrancelhas = h === "triste" || h === "fome"
      ? `<path d="M${cx - dx - 6 * e} ${cy - 10 * e} l${9 * e} ${-3.5 * e} M${cx + dx + 6 * e} ${cy - 10 * e} l${-9 * e} ${-3.5 * e}" stroke="${olhoCor}" stroke-width="${2.2 * e}" stroke-linecap="round"/>` : "";
    const traco = `stroke="${linha}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
    const bocas = {
      feliz: `<path d="M${cx - 5} ${cy + 7 * e} q2.5 3.5 5 0 q2.5 3.5 5 0" ${traco}/>`,
      radiante: `<path d="M${cx - 6} ${cy + 6 * e} q6 9 12 0z" fill="#8a2a43" stroke="${linha}" stroke-width="2" stroke-linejoin="round"/><path d="M${cx - 3} ${cy + 10 * e} q3 2 6 0" fill="#ff8fab"/>`,
      triste: `<path d="M${cx - 5} ${cy + 11 * e} q5 -5 10 0" ${traco}/>`,
      fome: `<ellipse cx="${cx}" cy="${cy + 9 * e}" rx="3.5" ry="4.5" fill="#8a2a43" stroke="${linha}" stroke-width="2"/>`,
      dormindo: `<path d="M${cx - 3} ${cy + 8 * e} q3 2 6 0" ${traco}/>`,
    };
    const extra = h === "triste" ? `<path d="M${cx - dx - 1} ${cy + 7 * e} q-3.5 6 0 8.5 q3.5 -2.5 0 -8.5z" fill="#7cc4ff" stroke="#3b82c4" stroke-width="1"/>`
      : h === "fome" ? `<path d="M${cx + 4} ${cy + 13 * e} q-1.5 4 0 6 q1.5 -2 0 -6z" fill="#bfe6ff"/>` : "";
    return `<g class="olhos">${olhos}</g>${sobrancelhas}
      <ellipse cx="${cx - 21 * e}" cy="${cy + 8 * e}" rx="${5 * e}" ry="${3 * e}" fill="#ff8fab" opacity="${h === "radiante" ? ".8" : ".55"}"/>
      <ellipse cx="${cx + 21 * e}" cy="${cy + 8 * e}" rx="${5 * e}" ry="${3 * e}" fill="#ff8fab" opacity="${h === "radiante" ? ".8" : ".55"}"/>
      ${boca === "nunca" ? "" : boca || h !== "feliz" ? bocas[h] || bocas.feliz : ""}${extra}`;
  }
  const sombra = `<ellipse class="sombra" cx="60" cy="110" rx="32" ry="4.5" fill="#000" opacity=".14"/>`;
  const brilho = (x, y, r = 5, cor = "#fff") =>
    `<path d="M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z" fill="${cor}"/>`;

  function estrela(cx, cy, R, r) {
    let d = "";
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r : R;
      d += (i ? "L" : "M") + (cx + rr * Math.cos(a)).toFixed(1) + " " + (cy + rr * Math.sin(a)).toFixed(1);
    }
    return d + "Z";
  }

  const DESENHOS = {
    bolinho: (p) => `${sombra}<g class="corpo">
      <path d="M60 36 q-5 -9 0 -16 q5 7 0 16z" fill="${p.c1}" stroke="${p.linha}" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M18 92 C18 58 36 34 60 34 C84 34 102 58 102 92 C102 105 88 107 60 107 C32 107 18 105 18 92Z" fill="${p.c1}" stroke="${p.linha}" stroke-width="3"/>
      <path d="M26 92 C30 100 46 102 60 102 C74 102 90 100 94 92" stroke="${p.c2}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".6"/>
      <ellipse cx="41" cy="54" rx="9" ry="5.5" fill="#fff" opacity=".65" transform="rotate(-28 41 54)"/>
      ${rosto(60, 76, p.linha)}</g>`,

    pipoca: (p) => `${sombra}<g class="corpo">
      <path d="M50 102 l-4 7 M50 102 l0 8 M50 102 l4 7 M70 102 l-4 7 M70 102 l0 8 M70 102 l4 7" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
      <path d="M58 38 q-6 -12 2 -18 q-1 8 4 10 q2 -8 9 -8 q-5 6 -3 14" fill="${p.c1}" stroke="${p.linha}" stroke-width="2.5" stroke-linejoin="round"/>
      <ellipse cx="25" cy="74" rx="9" ry="15" fill="${p.c2}" stroke="${p.linha}" stroke-width="3" transform="rotate(22 25 74)"/>
      <ellipse cx="95" cy="74" rx="9" ry="15" fill="${p.c2}" stroke="${p.linha}" stroke-width="3" transform="rotate(-22 95 74)"/>
      <circle cx="60" cy="70" r="35" fill="${p.c1}" stroke="${p.linha}" stroke-width="3"/>
      <ellipse cx="60" cy="86" rx="21" ry="15" fill="${p.c3}"/>
      <ellipse cx="44" cy="50" rx="8" ry="5" fill="#fff" opacity=".6" transform="rotate(-30 44 50)"/>
      ${rosto(60, 64, p.linha, { boca: "nunca" })}
      <path d="M54 72 l6 7 l6 -7z" fill="#fbbf24" stroke="${p.linha}" stroke-width="2" stroke-linejoin="round"/></g>`,

    mochi: (p) => `${sombra}<g class="corpo">
      <g class="orelhas">
        <ellipse cx="43" cy="36" rx="10" ry="25" fill="${p.c1}" stroke="${p.linha}" stroke-width="3" transform="rotate(-14 43 36)"/>
        <ellipse cx="43" cy="38" rx="4.5" ry="16" fill="#ffc2d4" transform="rotate(-14 43 38)"/>
        <ellipse cx="77" cy="36" rx="10" ry="25" fill="${p.c1}" stroke="${p.linha}" stroke-width="3" transform="rotate(14 77 36)"/>
        <ellipse cx="77" cy="38" rx="4.5" ry="16" fill="#ffc2d4" transform="rotate(14 77 38)"/>
      </g>
      <ellipse cx="60" cy="79" rx="39" ry="30" fill="${p.c1}" stroke="${p.linha}" stroke-width="3"/>
      <ellipse cx="46" cy="106" rx="8" ry="4.5" fill="${p.c3}" stroke="${p.linha}" stroke-width="2.5"/>
      <ellipse cx="74" cy="106" rx="8" ry="4.5" fill="${p.c3}" stroke="${p.linha}" stroke-width="2.5"/>
      <ellipse cx="40" cy="64" rx="8" ry="5" fill="#fff" opacity=".6" transform="rotate(-25 40 64)"/>
      ${rosto(60, 79, p.linha)}</g>`,

    nuvem: (p) => `${sombra}<g class="corpo flutua">
      <path d="M30 100 C14 100 12 78 27 74 C25 56 45 48 55 58 C59 39 88 39 89 60 C106 58 111 82 97 89 C101 99 93 101 87 100 Z" fill="${p.c3}" stroke="${p.linha}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M36 66 C38 60 44 58 48 60" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".9"/>
      ${rosto(60, 80, p.linha)}
      <path d="M100 30 q4 6 0 9 q-4 -3 0 -9z" fill="${p.c2}" opacity=".8"/>
      ${brilho(20, 40, 5, p.c2)}${brilho(104, 52, 3.5, p.c2)}</g>`,

    brotinho: (p) => `${sombra}<g class="corpo">
      <g class="folhas">
        <path d="M60 54 q-3 -14 2 -24" stroke="#3f8f4a" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M62 31 q14 -15 28 -5 q-13 13 -28 5z" fill="#86d97a" stroke="#3f8f4a" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M61 35 q-14 -13 -26 -3 q13 11 26 3z" fill="#6cc764" stroke="#3f8f4a" stroke-width="2.5" stroke-linejoin="round"/>
      </g>
      <ellipse cx="60" cy="81" rx="35" ry="28" fill="${p.c1}" stroke="${p.linha}" stroke-width="3"/>
      <ellipse cx="42" cy="68" rx="8" ry="5" fill="#fff" opacity=".6" transform="rotate(-25 42 68)"/>
      ${rosto(60, 83, p.linha)}</g>`,

    estrelinha: (p) => {
      const d = estrela(60, 68, 46, 22);
      return `${sombra}<g class="corpo">
        <path d="${d}" fill="${p.linha}" stroke="${p.linha}" stroke-width="15" stroke-linejoin="round"/>
        <path d="${d}" fill="${p.c1}" stroke="${p.c1}" stroke-width="9" stroke-linejoin="round"/>
        <path d="M48 44 L56 32" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>
        ${rosto(60, 72, p.linha, { e: 0.85 })}</g>
        <g class="brilhinhos">${brilho(16, 26, 6, p.c2)}${brilho(106, 34, 5, p.c2)}${brilho(102, 100, 4, p.c2)}</g>`;
    },

    nanquim: (p) => {
      const tinta = hsl(p.h, 30, 20), escuro = hsl(p.h, 35, 9);
      return `${sombra}<g class="corpo">
        <path d="M22 70 C22 44 40 30 60 30 C80 30 98 44 98 70 L98 92 C98 99 91 99 91 92 C91 99 83 102 81 94 C80 105 71 107 69 97 C67 103 59 102 59 95 C57 106 45 105 46 95 C44 101 36 99 36 91 C34 97 23 97 23 89 Z"
          fill="${tinta}" stroke="${escuro}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M36 50 C40 42 48 38 54 38" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".35"/>
        ${HUMOR === "feliz" ? `<g class="olhos">
          <ellipse cx="46" cy="68" rx="10" ry="12" fill="#fff"/><ellipse cx="48" cy="70" rx="5" ry="6.5" fill="${escuro}"/><circle cx="50" cy="67" r="2" fill="#fff"/>
          <ellipse cx="74" cy="68" rx="10" ry="12" fill="#fff"/><ellipse cx="76" cy="70" rx="5" ry="6.5" fill="${escuro}"/><circle cx="78" cy="67" r="2" fill="#fff"/>
        </g>` : rosto(60, 70, "#fff", { olhoCor: "#fff", e: 1.1 })}
        <ellipse cx="34" cy="82" rx="5" ry="3" fill="${hsl(p.h, 80, 70)}" opacity=".5"/>
        <ellipse cx="86" cy="82" rx="5" ry="3" fill="${hsl(p.h, 80, 70)}" opacity=".5"/>
        ${HUMOR === "feliz" ? `<path d="M56 84 q4 4 8 0" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".85"/>` : ""}</g>
        <circle cx="16" cy="104" r="3.5" fill="${tinta}"/><circle cx="106" cy="102" r="2.5" fill="${tinta}"/><circle cx="100" cy="110" r="1.8" fill="${tinta}"/>`;
    },

    draguinho: (p) => `${sombra}<g class="corpo">
      <path d="M86 92 C104 96 110 84 106 74" stroke="${p.linha}" stroke-width="9" fill="none" stroke-linecap="round"/>
      <path d="M86 92 C104 96 110 84 106 74" stroke="${p.c1}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
      <path d="M106 74 l-7 -5 l9 -6 l3 10z" fill="${p.c2}" stroke="${p.linha}" stroke-width="2.5" stroke-linejoin="round"/>
      <g class="asas">
        <path d="M36 64 C18 52 10 36 18 30 C22 40 28 40 31 46 C31 38 38 37 40 44 C40 38 46 38 46 46 Z" fill="${p.c2}" stroke="${p.linha}" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M84 64 C102 52 110 36 102 30 C98 40 92 40 89 46 C89 38 82 37 80 44 C80 38 74 38 74 46 Z" fill="${p.c2}" stroke="${p.linha}" stroke-width="2.5" stroke-linejoin="round"/>
      </g>
      <path d="M45 50 l-4 -14 l10 9z M75 50 l4 -14 l-10 9z" fill="#ffe08a" stroke="${p.linha}" stroke-width="2.5" stroke-linejoin="round"/>
      <ellipse cx="60" cy="77" rx="33" ry="31" fill="${p.c1}" stroke="${p.linha}" stroke-width="3"/>
      <ellipse cx="60" cy="88" rx="19" ry="16" fill="${p.c3}"/>
      <path d="M52 86 h16 M51 93 h18 M54 99 h12" stroke="${p.c2}" stroke-width="2" stroke-linecap="round" opacity=".55"/>
      <ellipse cx="46" cy="104" rx="7" ry="4.5" fill="${p.c2}" stroke="${p.linha}" stroke-width="2.5"/>
      <ellipse cx="74" cy="104" rx="7" ry="4.5" fill="${p.c2}" stroke="${p.linha}" stroke-width="2.5"/>
      <ellipse cx="42" cy="58" rx="7" ry="4.5" fill="#fff" opacity=".6" transform="rotate(-30 42 58)"/>
      ${HUMOR === "feliz" ? `${rosto(60, 68, p.linha, { boca: false })}
      <path d="M55 75 q5 4 10 0" stroke="${p.linha}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <path d="M62 76 l1.5 3.5 l1.5 -3.5" fill="#fff" stroke="${p.linha}" stroke-width="1"/>` : rosto(60, 68, p.linha)}</g>`,
  };

  /* ---------- acessórios ---------- */
  // id: [emoji, nome, lugar, como liberar]
  const ACESSORIOS = {
    laco: ["🎀", "Laço", "cabeca", "Termine de ler uma obra inteira"],
    coroa: ["👑", "Coroa", "cabeca", "Termine 10 obras"],
    bruxa: ["🧙", "Chapéu de bruxa", "cabeca", "Exclusivo VIP"],
    fone: ["🎧", "Fone", "cabeca", "Conquista Coruja (ler entre meia-noite e 5h)"],
    flor: ["🌸", "Florzinha", "cabeca", "Descubra a comida favorita do seu pet"],
    gato: ["🐱", "Orelhinhas de gato", "cabeca", "Chegue no nível 2 (100 XP)"],
    oculos: ["👓", "Óculos", "rosto", "Chegue no nível 3 (300 XP)"],
    escuros: ["🕶️", "Óculos escuros", "rosto", "Exclusivo VIP"],
    cachecol: ["🧣", "Cachecol", "rosto", "Chegue no nível 4 (700 XP)"],
    sininho: ["🔔", "Sininho", "rosto", "Cuide do pet por 7 dias"],
  };
  // onde cada coisa fica em cada bicho: topo da cabeça [x, y, escala, giro], olhos [x, y, escala], pescoço [y, largura]
  const PONTOS = {
    bolinho: { topo: [60, 37, 1, 0], olhos: [60, 76, 1], pescoco: [95, 66] },
    pipoca: { topo: [60, 39, 1, 0], olhos: [60, 64, 1], pescoco: [88, 50] },
    mochi: { topo: [60, 52, .95, 0], olhos: [60, 79, 1], pescoco: [99, 58] },
    nuvem: { topo: [70, 46, .95, 8], olhos: [60, 80, 1], pescoco: [98, 56] },
    brotinho: { topo: [42, 60, .85, -22], olhos: [60, 83, 1], pescoco: [101, 52] },
    estrelinha: { topo: [60, 30, .75, 0], olhos: [60, 72, .85], pescoco: [88, 30] },
    nanquim: { topo: [60, 33, 1, 0], olhos: [60, 70, 1.12], pescoco: [93, 62] },
    draguinho: { topo: [60, 47, .9, 0], olhos: [60, 68, 1], pescoco: [90, 46] },
  };
  const DES_ACESSORIO = {
    laco: () => `<g transform="translate(0 -6)">
      <path d="M0 0 C-8 -12 -22 -10 -20 0 C-22 10 -8 12 0 0Z" fill="#f472b6" stroke="#9d174d" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M0 0 C8 -12 22 -10 20 0 C22 10 8 12 0 0Z" fill="#f472b6" stroke="#9d174d" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M-14 -3 q4 3 0 6 M14 -3 q-4 3 0 6" stroke="#be185d" stroke-width="1.5" fill="none"/>
      <circle r="5" fill="#ec4899" stroke="#9d174d" stroke-width="2.2"/></g>`,
    coroa: () => `<path d="M-17 1 L-19 -18 L-9 -9 L0 -23 L9 -9 L19 -18 L17 1Z" fill="#fcd34d" stroke="#b45309" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M-16 -4 H16" stroke="#f59e0b" stroke-width="2"/><circle cx="0" cy="-23" r="2.6" fill="#f472b6" stroke="#b45309" stroke-width="1.4"/>
      <circle cx="-19" cy="-18" r="2" fill="#60a5fa" stroke="#b45309" stroke-width="1.2"/><circle cx="19" cy="-18" r="2" fill="#60a5fa" stroke="#b45309" stroke-width="1.2"/>
      <circle cx="0" cy="-5" r="2.6" fill="#ef4444" stroke="#b45309" stroke-width="1.2"/>`,
    bruxa: () => `<path d="M-14 -3 L2 -36 Q5 -40 9 -36 L14 -3Z" fill="#6d28d9" stroke="#2e1065" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M-13 -9 L13 -9 L14 -3 L-14 -3Z" fill="#fbbf24" stroke="#2e1065" stroke-width="2"/>
      <ellipse cx="0" cy="-2" rx="25" ry="5.5" fill="#7c3aed" stroke="#2e1065" stroke-width="2.4"/>
      ${brilho(6, -24, 3, "#fde68a")}`,
    fone: () => `<path d="M-25 8 Q-26 -24 0 -24 Q26 -24 25 8" stroke="#334155" stroke-width="5" fill="none" stroke-linecap="round"/>
      <rect x="-31" y="0" width="11" height="17" rx="5" fill="#f472b6" stroke="#334155" stroke-width="2.4"/>
      <rect x="20" y="0" width="11" height="17" rx="5" fill="#f472b6" stroke="#334155" stroke-width="2.4"/>`,
    flor: () => `<g transform="translate(15 -4)">${[0, 72, 144, 216, 288].map((a) =>
      `<circle cx="${(7 * Math.cos((a * Math.PI) / 180)).toFixed(1)}" cy="${(7 * Math.sin((a * Math.PI) / 180)).toFixed(1)}" r="5.5" fill="#fbcfe8" stroke="#db2777" stroke-width="1.6"/>`).join("")}
      <circle r="4.5" fill="#fde047" stroke="#ca8a04" stroke-width="1.6"/></g>`,
    gato: (p) => `<path d="M-24 4 L-18 -17 L-6 -3Z" fill="${p.c2}" stroke="${p.linha}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M-19 0 L-17 -10 L-11 -3Z" fill="#ffc2d4"/>
      <path d="M24 4 L18 -17 L6 -3Z" fill="${p.c2}" stroke="${p.linha}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M19 0 L17 -10 L11 -3Z" fill="#ffc2d4"/>`,
    oculos: () => `<circle cx="-13" cy="0" r="9.5" fill="rgba(255,255,255,.18)" stroke="#1f2937" stroke-width="2.6"/>
      <circle cx="13" cy="0" r="9.5" fill="rgba(255,255,255,.18)" stroke="#1f2937" stroke-width="2.6"/>
      <path d="M-4 -1 q4 -3 8 0" stroke="#1f2937" stroke-width="2.4" fill="none"/>
      <path d="M-18 -4 l4 -2 M8 -4 l4 -2" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>`,
    escuros: () => `<path d="M-24 -6 H-3 Q-3 8 -13 8 Q-23 8 -24 -6Z M24 -6 H3 Q3 8 13 8 Q23 8 24 -6Z" fill="#111827" stroke="#000" stroke-width="2"/>
      <path d="M-3 -5 H3" stroke="#000" stroke-width="2.6"/>
      <path d="M-20 -3 l5 0 M7 -3 l5 0" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".55"/>`,
    cachecol: (p, larg) => `<path d="M${-larg / 2} -5 Q0 4 ${larg / 2} -5 L${larg / 2} 3 Q0 12 ${-larg / 2} 3Z" fill="#ef4444" stroke="#7f1d1d" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M${larg / 2 - 14} 2 l-2 16 l9 0 l1 -16" fill="#ef4444" stroke="#7f1d1d" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M${-larg / 4} -1 v5 M0 2 v6 M${larg / 4} -1 v5" stroke="#fca5a5" stroke-width="2.4" stroke-linecap="round"/>`,
    sininho: (p, larg) => `<path d="M${-larg / 2} -3 Q0 6 ${larg / 2} -3" stroke="#dc2626" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <circle cx="0" cy="7" r="6.5" fill="#fcd34d" stroke="#b45309" stroke-width="2"/>
      <path d="M-4 7 h8" stroke="#b45309" stroke-width="1.6"/><circle cx="0" cy="10" r="1.4" fill="#b45309"/>`,
  };
  function desenharAcessorios(esp, pet, p) {
    const pt = PONTOS[esp]; let s = "";
    const cab = DES_ACESSORIO[pet.acessorio_cabeca] && ACESSORIOS[pet.acessorio_cabeca][2] === "cabeca" ? pet.acessorio_cabeca : null;
    const ros = DES_ACESSORIO[pet.acessorio_rosto] && ACESSORIOS[pet.acessorio_rosto][2] === "rosto" ? pet.acessorio_rosto : null;
    if (ros === "cachecol" || ros === "sininho") s += `<g class="ac-${ros}" transform="translate(60 ${pt.pescoco[0]})">${DES_ACESSORIO[ros](p, pt.pescoco[1])}</g>`;
    if (ros === "oculos" || ros === "escuros") s += `<g class="ac-${ros}" transform="translate(${pt.olhos[0]} ${pt.olhos[1]}) scale(${pt.olhos[2]})">${DES_ACESSORIO[ros](p)}</g>`;
    if (cab) s += `<g class="ac-${cab}" transform="translate(${pt.topo[0]} ${pt.topo[1]}) rotate(${pt.topo[3]}) scale(${pt.topo[2]})">${DES_ACESSORIO[cab](p)}</g>`;
    return s;
  }

  function desenharPet(pet, classe = "", humor = "feliz") {
    const esp = DESENHOS[pet.especie] ? pet.especie : "bolinho";
    const p = { ...paleta(pet.cor ?? 200), h: pet.cor ?? 200 };
    HUMOR = HUMORES[humor] ? humor : "feliz";
    const brilhos = pet.brilhante
      ? `<g class="brilhante">${brilho(14, 20, 7, "#fde68a")}${brilho(108, 26, 5, "#fde68a")}${brilho(18, 92, 4, "#fde68a")}${brilho(104, 96, 6, "#fde68a")}</g>` : "";
    const zz = HUMOR === "dormindo" ? `<g class="zz" fill="${p.linha}" font-weight="900" font-family="system-ui,sans-serif"><text x="90" y="34" font-size="15">z</text><text x="100" y="22" font-size="11">z</text><text x="107" y="13" font-size="8">z</text></g>` : "";
    // tudo (corpo + acessórios) mexe junto; a sombra fica parada
    const corpo = DESENHOS[esp](p).replace(sombra, "");
    const svg = `<svg class="pet-svg ${esp} humor-${HUMOR} ${classe}" viewBox="0 0 120 120" role="img" aria-label="${ESPECIES[esp][0]}">${sombra}<g class="corpo-todo">${corpo}${desenharAcessorios(esp, pet, p)}</g>${brilhos}${zz}</svg>`;
    HUMOR = "feliz";
    return svg;
  }

  /* ---------- fome e humor (as contas valem iguais às do banco: supabase/pets-comida.sql) ---------- */
  const HUMORES = {
    radiante: ["✨", "Radiante"], feliz: ["😊", "Contente"], triste: ["🥺", "Tristinho"],
    fome: ["🍽️", "Com fome"], dormindo: ["💤", "Dormindo"],
  };
  const COMIDAS = { onigiri: ["🍙", "Onigiri"], dango: ["🍡", "Dango"], pudim: ["🍮", "Pudim"], morango: ["🍓", "Morango"] };
  // valores de agora a partir do que está salvo (barriga -2/h, felicidade -1/h)
  function valoresAgora(row) {
    const desde = new Date(row.atualizado_em || row.nasceu_em || Date.now());
    const horas = Math.max(0, (Date.now() - desde) / 36e5);
    return { saciedade: Math.max(0, (row.saciedade ?? 70) - Math.floor(horas * 2)), felicidade: Math.max(0, (row.felicidade ?? 80) - Math.floor(horas)) };
  }
  function humorDe(v) {
    const hora = new Date().getHours();
    if (hora < 6) return "dormindo";
    if (v.saciedade < 20) return "fome";
    if (v.felicidade < 35) return "triste";
    if (v.felicidade >= 75 && v.saciedade >= 50) return "radiante";
    return "feliz";
  }

  // cor do ovo: sai do id da pessoa (o bicho de dentro só é sorteado quando nasce)
  function corOvo(id) {
    let h = 0;
    for (const ch of String(id || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % 360;
  }

  // estagio: 0 inteiro, 1 primeira rachadura, 2 rachando, 3 quase nascendo
  function desenharOvo(estagio, h, classe = "") {
    const linha = hsl(h, 35, 38), casca = hsl(h, 60, 93), manchas = hsl(h, 65, 76);
    const rach = [
      "",
      `<path d="M48 38 l6 7 l-4 5 l7 6" />`,
      `<path d="M48 38 l6 7 l-4 5 l7 6" /><path d="M76 66 l-7 5 l6 5 l-6 7" />`,
      `<path d="M22 70 l10 -7 l8 9 l10 -9 l10 9 l10 -9 l10 8 l9 -6 l8 4" /><path d="M48 38 l6 7 l-4 5 l7 6" />`,
    ][Math.max(0, Math.min(3, estagio))];
    return `<svg class="ovo-svg e${estagio} ${classe}" viewBox="0 0 120 120" role="img" aria-label="Ovo">
      ${estagio >= 3 ? `<ellipse cx="60" cy="70" rx="50" ry="52" fill="${hsl(h, 90, 75)}" opacity=".35" class="aura"/>` : ""}
      <ellipse class="sombra" cx="60" cy="113" rx="30" ry="4.5" fill="#000" opacity=".14"/>
      <g class="casca">
        <path d="M60 14 C88 14 101 58 101 78 C101 101 83 112 60 112 C37 112 19 101 19 78 C19 58 32 14 60 14Z" fill="${casca}" stroke="${linha}" stroke-width="3"/>
        <ellipse cx="44" cy="58" rx="8" ry="6" fill="${manchas}"/><ellipse cx="76" cy="44" rx="6" ry="5" fill="${manchas}"/>
        <ellipse cx="72" cy="90" rx="10" ry="7" fill="${manchas}"/><ellipse cx="42" cy="94" rx="5" ry="4" fill="${manchas}"/>
        <ellipse cx="44" cy="34" rx="7" ry="11" fill="#fff" opacity=".7" transform="rotate(25 44 34)"/>
        <g fill="none" stroke="${linha}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${rach}</g>
      </g></svg>`;
  }

  window.PETS = { ESPECIES, RARIDADES, HUMORES, COMIDAS, ACESSORIOS, desenharPet, desenharOvo, corOvo, valoresAgora, humorDe };
})();
