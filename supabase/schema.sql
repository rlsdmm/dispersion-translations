-- ============================================================
--  DISPERSION TRANSLATIONS — estrutura do banco no Supabase
--  Cole tudo isto no Supabase: SQL Editor → New query → Run
--  (pode rodar de novo sem problema)
-- ============================================================

-- Membros do grupo: só quem está aqui pode enviar/editar
create table if not exists public.membros (
  user_id   uuid primary key references auth.users on delete cascade,
  nome      text,
  cargo     text not null default 'membro',
  criado_em timestamptz not null default now()
);

create table if not exists public.series (
  id              text primary key,              -- ex: "lamina-do-crepusculo"
  titulo          text not null,
  titulo_original text,
  autor           text,
  generos         text[] not null default '{}',
  status          text not null default 'Em andamento',
  sinopse         text,
  capa_url        text,
  cores           text[],
  criado_em       timestamptz not null default now()
);

create table if not exists public.capitulos (
  id          bigint generated always as identity primary key,
  serie_id    text not null references public.series(id) on delete cascade on update cascade,
  numero      numeric not null,                  -- aceita 10.5
  titulo      text,
  data        date not null default current_date,
  paginas     text[] not null default '{}',      -- URLs das páginas, em ordem
  enviado_por uuid default auth.uid() references auth.users on delete set null,
  criado_em   timestamptz not null default now(),
  unique (serie_id, numero)
);

-- Diz se quem está logado é membro do grupo
create or replace function public.is_membro()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membros where user_id = auth.uid());
$$;

-- ---------- Regras de acesso (RLS) ----------
alter table public.membros   enable row level security;
alter table public.series    enable row level security;
alter table public.capitulos enable row level security;

drop policy if exists "membro ve a si mesmo" on public.membros;
create policy "membro ve a si mesmo" on public.membros
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "todos leem series" on public.series;
create policy "todos leem series" on public.series for select using (true);
drop policy if exists "membros gerenciam series" on public.series;
create policy "membros gerenciam series" on public.series
  for all to authenticated using (public.is_membro()) with check (public.is_membro());

drop policy if exists "todos leem capitulos" on public.capitulos;
create policy "todos leem capitulos" on public.capitulos for select using (true);
drop policy if exists "membros gerenciam capitulos" on public.capitulos;
create policy "membros gerenciam capitulos" on public.capitulos
  for all to authenticated using (public.is_membro()) with check (public.is_membro());

-- ---------- Armazenamento das imagens ----------
insert into storage.buckets (id, name, public)
values ('midia', 'midia', true)
on conflict (id) do update set public = true;

drop policy if exists "midia leitura publica" on storage.objects;
create policy "midia leitura publica" on storage.objects
  for select using (bucket_id = 'midia');
drop policy if exists "midia envio membros" on storage.objects;
create policy "midia envio membros" on storage.objects
  for insert to authenticated with check (bucket_id = 'midia' and public.is_membro());
drop policy if exists "midia troca membros" on storage.objects;
create policy "midia troca membros" on storage.objects
  for update to authenticated using (bucket_id = 'midia' and public.is_membro());
drop policy if exists "midia exclusao membros" on storage.objects;
create policy "midia exclusao membros" on storage.objects
  for delete to authenticated using (bucket_id = 'midia' and public.is_membro());

-- ============================================================
--  DEPOIS de criar a conta de alguém em Authentication → Users,
--  rode isto (trocando o e-mail e o nome) pra torná-lo membro:
--
--  insert into public.membros (user_id, nome, cargo)
--  select id, 'Seu Nome', 'admin' from auth.users where email = 'email@exemplo.com';
-- ============================================================
