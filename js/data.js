/*
 * ============================================================
 *  CATÁLOGO DA DISPERSION TRANSLATIONS
 * ============================================================
 *  É aqui que vocês adicionam séries e capítulos novos.
 *
 *  Como adicionar um capítulo:
 *   1. Coloque as páginas em:  capitulos/<id-da-serie>/<numero>/
 *      com nomes 001.jpg, 002.jpg, 003.jpg ...
 *   2. Adicione uma linha na lista "capitulos" da série:
 *        { numero: 4, titulo: "Nome do cap", data: "2026-11-20", paginas: 18 }
 *
 *  Opções de cada capítulo:
 *   - paginas: número de páginas (usa 001.jpg, 002.jpg...)  OU
 *              uma lista de nomes: ["01.png", "02.png", ...]
 *   - ext:     extensão dos arquivos se não for jpg (ex: "png", "webp")
 *   - pasta:   caminho da pasta, se for diferente do padrão
 *
 *  Capa da série: coloque a imagem em capas/ e preencha "capa".
 *  Se "capa" estiver vazio, o site gera uma capa provisória.
 *
 *  "demo: true" = gera páginas de exemplo (apague quando tiver as imagens reais).
 * ============================================================
 */
window.DISPERSION = {
  grupo: {
    nome: "Dispersion Translations",
    slogan: "Traduções feitas por fãs, para fãs.",
    descricao:
      "Somos um grupo de tradução de mangás sem fins lucrativos. Traduzimos obras que amamos e que ainda não têm versão em português. Se a obra for licenciada no Brasil, apoie o lançamento oficial!",
    discord: "https://discord.gg/",
    links: [
      { nome: "Discord", url: "https://discord.gg/" },
      { nome: "Twitter / X", url: "https://x.com/" },
    ],
  },

  series: [
    {
      id: "lamina-do-crepusculo",
      titulo: "Lâmina do Crepúsculo",
      tituloOriginal: "Tasogare no Yaiba",
      autor: "Autor Exemplo",
      generos: ["Ação", "Fantasia", "Drama"],
      status: "Em andamento",
      sinopse:
        "Num mundo onde o sol nunca termina de se pôr, uma jovem ferreira descobre que a espada que forjou é capaz de cortar o próprio tempo. Agora, ela é caçada por todos que desejam esse poder.",
      capa: "",
      cores: ["#ff5e62", "#7b2ff7"],
      demo: true,
      capitulos: [
        { numero: 1, titulo: "A forja ao entardecer", data: "2026-10-12", paginas: 8 },
        { numero: 2, titulo: "Aço que lembra", data: "2026-10-26", paginas: 8 },
        { numero: 3, titulo: "Os caçadores", data: "2026-11-08", paginas: 8 },
      ],
    },
    {
      id: "cafe-das-estrelas",
      titulo: "Café das Estrelas",
      tituloOriginal: "Hoshi no Kissaten",
      autor: "Autora Exemplo",
      generos: ["Slice of Life", "Romance", "Comédia"],
      status: "Em andamento",
      sinopse:
        "Um café que só abre à meia-noite, frequentado por clientes que não são exatamente deste planeta. O novo barista só queria um emprego de meio período…",
      capa: "",
      cores: ["#43cea2", "#185a9d"],
      demo: true,
      capitulos: [
        { numero: 1, titulo: "Primeiro turno", data: "2026-09-30", paginas: 6 },
        { numero: 2, titulo: "Cliente número 404", data: "2026-11-02", paginas: 6 },
      ],
    },
    {
      id: "eco-silencioso",
      titulo: "Eco Silencioso",
      tituloOriginal: "Shizuka na Kodama",
      autor: "Autor Exemplo",
      generos: ["Mistério", "Sobrenatural"],
      status: "Completo",
      sinopse:
        "Em uma cidade onde ninguém consegue ouvir a própria voz, um garoto começa a escutar os pensamentos de quem já partiu.",
      capa: "",
      cores: ["#f7971e", "#3a1c71"],
      demo: true,
      capitulos: [
        { numero: 1, titulo: "Ruído", data: "2026-08-14", paginas: 7 },
        { numero: 2, titulo: "Frequência", data: "2026-08-28", paginas: 7 },
        { numero: 3, titulo: "Silêncio final", data: "2026-09-11", paginas: 7 },
      ],
    },
  ],
};
