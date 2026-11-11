-- ============================================================
--  DISPERSION TRANSLATIONS — contas de leitores
--  Rode DEPOIS do schema.sql. Pode rodar de novo sem problema.
--  Perfis, favoritos, histórico/progresso, comentários,
--  contadores e exclusão da própria conta.
-- ============================================================

-- ---------- Perfil público de cada conta ----------
create table if not exists public.perfis (
  user_id   uuid primary key references auth.users on delete cascade,
  apelido   text not null check (char_length(apelido) between 2 and 24),
  prefs     jsonb not null default '{}',          -- modo de leitura, largura, direção…
  banido    boolean not null default false,       -- bloqueado de comentar
  criado_em timestamptz not null default now()
);

-- Cria o perfil sozinho quando alguém se cadastra (e-mail, Discord ou Google)
create or replace function public.novo_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
declare ap text;
begin
  ap := coalesce(
    nullif(trim(new.raw_user_meta_data->>'apelido'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    split_part(new.email, '@', 1)
  );
  ap := left(coalesce(ap, ''), 24);
  if char_length(ap) < 2 then ap := 'leitor'; end if;
  insert into public.perfis (user_id, apelido) values (new.id, ap) on conflict do nothing;
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.novo_perfil();

-- Perfis pras contas que já existiam (ex: membros do grupo)
insert into public.perfis (user_id, apelido)
select u.id, left(coalesce(m.nome, split_part(u.email, '@', 1)), 24)
from auth.users u left join public.membros m on m.user_id = u.id
on conflict do nothing;

-- ---------- Favoritos ----------
create table if not exists public.favoritos (
  user_id   uuid not null default auth.uid() references auth.users on delete cascade,
  serie_id  text not null references public.series(id) on delete cascade on update cascade,
  criado_em timestamptz not null default now(),
  primary key (user_id, serie_id)
);

-- ---------- Histórico e progresso de leitura ----------
create table if not exists public.historico (
  user_id   uuid not null default auth.uid() references auth.users on delete cascade,
  serie_id  text not null references public.series(id) on delete cascade on update cascade,
  numero    numeric not null,
  pagina    int not null default 0,              -- última página vista (começa em 0)
  total     int,
  concluido boolean not null default false,
  lido_em   timestamptz not null default now(),
  primary key (user_id, serie_id, numero)
);
create index if not exists historico_recentes on public.historico (user_id, lido_em desc);

-- ---------- Comentários por capítulo ----------
create table if not exists public.comentarios (
  id        bigint generated always as identity primary key,
  serie_id  text not null references public.series(id) on delete cascade on update cascade,
  numero    numeric not null,
  user_id   uuid not null default auth.uid() references public.perfis(user_id) on delete cascade,
  texto     text not null check (char_length(trim(texto)) between 1 and 1000),
  criado_em timestamptz not null default now()
);
create index if not exists comentarios_cap on public.comentarios (serie_id, numero, criado_em);

-- ---------- Funções ----------
-- Contas que são da equipe (pra mostrar o selo "Equipe" nos comentários)
create or replace function public.equipe_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select user_id from public.membros;
$$;

-- Quantos favoritaram e quantos leram uma obra
create or replace function public.contagens(p_serie text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'favoritos', (select count(*) from public.favoritos where serie_id = p_serie),
    'leitores',  (select count(distinct user_id) from public.historico where serie_id = p_serie)
  );
$$;

-- Membro do grupo bloqueia/desbloqueia alguém de comentar
create or replace function public.banir(p_user uuid, p_banido boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_membro() then raise exception 'sem permissão'; end if;
  if exists (select 1 from public.membros where user_id = p_user) then raise exception 'não dá pra bloquear membro'; end if;
  update public.perfis set banido = p_banido where user_id = p_user;
  if p_banido then delete from public.comentarios where user_id = p_user; end if;
end $$;

-- O próprio leitor apaga a conta e todos os dados dele
create or replace function public.excluir_conta()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'não logado'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------- Permissões da API ----------
grant select on public.perfis to anon, authenticated;
grant insert (user_id, apelido) , update (apelido, prefs) on public.perfis to authenticated;
grant select, insert, update, delete on public.favoritos, public.historico to authenticated;
grant select on public.comentarios to anon, authenticated;
grant insert (serie_id, numero, texto), delete on public.comentarios to authenticated;
grant execute on function public.equipe_ids(), public.contagens(text) to anon, authenticated;
grant execute on function public.banir(uuid, boolean), public.excluir_conta() to authenticated;
revoke execute on function public.banir(uuid, boolean), public.excluir_conta() from anon, public;

-- ---------- Regras de acesso (RLS) ----------
alter table public.perfis      enable row level security;
alter table public.favoritos   enable row level security;
alter table public.historico   enable row level security;
alter table public.comentarios enable row level security;

drop policy if exists "perfis publicos" on public.perfis;
create policy "perfis publicos" on public.perfis for select using (true);
drop policy if exists "cria o proprio perfil" on public.perfis;
create policy "cria o proprio perfil" on public.perfis
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "edita o proprio perfil" on public.perfis;
create policy "edita o proprio perfil" on public.perfis
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "favoritos proprios" on public.favoritos;
create policy "favoritos proprios" on public.favoritos
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "historico proprio" on public.historico;
create policy "historico proprio" on public.historico
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "todos leem comentarios" on public.comentarios;
create policy "todos leem comentarios" on public.comentarios for select using (true);
drop policy if exists "leitor comenta" on public.comentarios;
create policy "leitor comenta" on public.comentarios
  for insert to authenticated with check (
    user_id = auth.uid()
    and not exists (select 1 from public.perfis p where p.user_id = auth.uid() and p.banido)
    -- anti-flood: 1 comentário a cada 15 segundos
    and not exists (select 1 from public.comentarios c where c.user_id = auth.uid() and c.criado_em > now() - interval '15 seconds')
  );
drop policy if exists "apaga o proprio ou membro modera" on public.comentarios;
create policy "apaga o proprio ou membro modera" on public.comentarios
  for delete to authenticated using (user_id = auth.uid() or public.is_membro());
