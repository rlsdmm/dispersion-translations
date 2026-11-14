-- Novidades do site (changelog): a equipe escreve pela Área do grupo, todo mundo lê em novidades.html
-- Rodar no SQL Editor do Supabase. Pode rodar de novo sem problema.

create table if not exists public.novidades (
  id        bigint generated always as identity primary key,
  titulo    text not null check (char_length(trim(titulo)) between 1 and 120),
  texto     text check (texto is null or char_length(texto) <= 4000),
  tipo      text not null default 'novo' check (tipo in ('novo', 'melhoria', 'correcao', 'aviso')),
  criado_em timestamptz not null default now(),
  autor     uuid default auth.uid() references auth.users on delete set null
);
create index if not exists novidades_data on public.novidades (criado_em desc);
alter table public.novidades enable row level security;
revoke all on public.novidades from anon, authenticated;
grant select on public.novidades to anon, authenticated;
grant insert (titulo, texto, tipo, criado_em), update (titulo, texto, tipo, criado_em), delete on public.novidades to authenticated;

drop policy if exists "novidades leitura" on public.novidades;
create policy "novidades leitura" on public.novidades for select using (true);
drop policy if exists "novidades equipe" on public.novidades;
create policy "novidades equipe" on public.novidades for all to authenticated
  using (public.is_membro()) with check (public.is_membro());

-- primeiras novidades (só se a tabela estiver vazia)
insert into public.novidades (titulo, texto, tipo, criado_em)
select * from (values
  ('Endereço novo: dispersiontl.com.br',
   'O site agora tem domínio próprio! O endereço antigo continua funcionando e manda pra cá.', 'novo', timestamptz '2026-11-11 20:00-03'),
  ('Escolha o visual do site 🎨',
   E'Clique no 🎨 no topo pra trocar o tema: Azul, Roxo e Papel pra todo mundo.\n- Neon, Sakura, Edgy e Fofinho são exclusivos pra quem apoia (VIP).', 'novo', timestamptz '2026-11-12 18:00-03'),
  ('Apoie a Dispersion 💙',
   E'Agora dá pra apoiar o grupo com Pix, de qualquer valor, na página Apoie.\n- Quem apoia vira VIP: selo e nome dourado, temas exclusivos, capítulos antes de todo mundo e nome no mural.\n- Tem também a barrinha com a meta do mês.', 'novo', timestamptz '2026-11-12 21:00-03'),
  ('XP, níveis e conquistas',
   E'Ler capítulos, comentar e terminar obras dá XP.\n- São 8 níveis (de Novato a Lenda da Dispersion) e 13 conquistas pra desbloquear.\n- O ranking da página inicial agora é por XP.', 'novo', timestamptz '2026-11-13 15:00-03'),
  ('Perfil público, foto e mensagens',
   E'Clique no nome de alguém nos comentários pra ver o perfil.\n- Coloque foto, bio e suas redes em Minha conta.\n- Dá pra mandar mensagem privada pra outros leitores (com opção de bloquear e denunciar).', 'novo', timestamptz '2026-11-13 19:00-03'),
  ('Ganhe um pet! 🥚',
   E'Cada leitor ganha um ovinho na página Meu pet. Aqueça todo dia e leia capítulos pra ele chocar.\n- São 8 bichinhos, do comum ao lendário, e tem chance de nascer brilhante ✨.\n- Dê comidinha (cada pet tem uma favorita secreta), faça carinho e vista acessórios.', 'novo', timestamptz '2026-11-13 23:00-03'),
  ('Leitor: zoom e comentários em loop',
   E'- No modo paginado agora tem zoom de 50% a 300% (teclas + e − também funcionam).\n- Os comentários que passam na tela repetem enquanto você fica na página.\n- Os botões "Cap. ant." e "Próx. cap." ficaram mais claros.', 'melhoria', timestamptz '2026-11-14 12:00-03'),
  ('Página da obra mais fácil de usar',
   E'- Obras longas mostram os capítulos em abas de 50, com campo "Ir pro cap.".\n- Clique num gênero ou no status pra ver todas as obras parecidas.\n- Os nomes alternativos (em inglês etc.) aparecem embaixo do título e também funcionam na busca.', 'melhoria', timestamptz '2026-11-14 14:00-03')
) v(titulo, texto, tipo, criado_em)
where not exists (select 1 from public.novidades);
