-- Perfil público (bio, redes sociais, selos especiais) + mensagens entre leitores
-- Rodar no SQL Editor do Supabase. Pode rodar de novo sem problema.

-- ---------- perfil público ----------
alter table public.perfis add column if not exists bio   text  check (bio is null or char_length(bio) <= 300);
alter table public.perfis add column if not exists redes jsonb not null default '{}'
  check (jsonb_typeof(redes) = 'object' and pg_column_size(redes) <= 1500);
alter table public.perfis add column if not exists selos text[] not null default '{}';   -- só a equipe muda
alter table public.perfis add column if not exists aceita_mensagens boolean not null default true;
grant update (bio, redes, aceita_mensagens) on public.perfis to authenticated;

-- tudo que aparece na página de perfil de alguém
create or replace function public.perfil_publico(p_user uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'user_id', p.user_id, 'apelido', p.apelido, 'bio', p.bio, 'redes', p.redes, 'selos', p.selos,
    'aceita_mensagens', p.aceita_mensagens, 'criado_em', p.criado_em, 'banido', p.banido,
    'vip', coalesce(p.vip_ate > now(), false),
    'equipe', exists (select 1 from public.membros m where m.user_id = p.user_id),
    'xp', (select row_to_json(x) from public.xp_calc(array[p.user_id]) x))
  from public.perfis p where p.user_id = p_user;
$$;
grant execute on function public.perfil_publico(uuid) to anon, authenticated;

-- equipe dá/tira selos especiais
create or replace function public.definir_selos(p_user uuid, p_selos text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_membro() then raise exception 'sem permissão'; end if;
  update public.perfis set selos = coalesce(p_selos, '{}') where user_id = p_user;
end $$;
revoke execute on function public.definir_selos(uuid, text[]) from anon, public;
grant execute on function public.definir_selos(uuid, text[]) to authenticated;

-- ---------- bloqueios ----------
create table if not exists public.bloqueios (
  quem      uuid not null default auth.uid() references public.perfis(user_id) on delete cascade,
  bloqueado uuid not null references public.perfis(user_id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (quem, bloqueado),
  check (quem <> bloqueado)
);
alter table public.bloqueios enable row level security;
revoke all on public.bloqueios from anon, authenticated;
grant select, insert, delete on public.bloqueios to authenticated;
drop policy if exists "bloqueios proprios" on public.bloqueios;
create policy "bloqueios proprios" on public.bloqueios
  for all to authenticated using (quem = auth.uid()) with check (quem = auth.uid());

-- ---------- mensagens ----------
create table if not exists public.mensagens (
  id        bigint generated always as identity primary key,
  de        uuid not null default auth.uid() references public.perfis(user_id) on delete cascade,
  para      uuid not null references public.perfis(user_id) on delete cascade,
  texto     text not null check (char_length(trim(texto)) between 1 and 2000),
  criado_em timestamptz not null default now(),
  lida_em   timestamptz,
  check (de <> para)
);
create index if not exists mensagens_para on public.mensagens (para, criado_em desc);
create index if not exists mensagens_de on public.mensagens (de, criado_em desc);
alter table public.mensagens enable row level security;
revoke all on public.mensagens from anon, authenticated;
grant select on public.mensagens to authenticated;
grant insert (para, texto) on public.mensagens to authenticated;

-- quem pode mandar pra quem (e limite anti-spam)
create or replace function public.pode_mandar(p_para uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and auth.uid() <> p_para
    and not coalesce((select banido from public.perfis where user_id = auth.uid()), true)
    and exists (select 1 from public.perfis where user_id = p_para and aceita_mensagens and not banido)
    and not exists (select 1 from public.bloqueios where quem = p_para and bloqueado = auth.uid())
    and not exists (select 1 from public.bloqueios where quem = auth.uid() and bloqueado = p_para)
    and (select count(*) from public.mensagens where de = auth.uid() and criado_em > now() - interval '1 minute') < 10
    and (select count(*) from public.mensagens where de = auth.uid() and criado_em > now() - interval '1 day') < 300;
$$;
grant execute on function public.pode_mandar(uuid) to authenticated;

drop policy if exists "ve as proprias mensagens" on public.mensagens;
create policy "ve as proprias mensagens" on public.mensagens
  for select to authenticated using (auth.uid() in (de, para));
drop policy if exists "manda mensagem" on public.mensagens;
create policy "manda mensagem" on public.mensagens
  for insert to authenticated with check (de = auth.uid() and public.pode_mandar(para));

-- lista de conversas (uma linha por pessoa, com a última mensagem)
create or replace function public.minhas_conversas()
returns table (outro uuid, apelido text, vip boolean, equipe boolean, ultima text, ultima_em timestamptz, minha boolean, nao_lidas bigint)
language sql stable security definer set search_path = public as $$
  with m as (
    select case when de = auth.uid() then para else de end as outro, texto, criado_em, de = auth.uid() as minha,
           (para = auth.uid() and lida_em is null) as nao_lida
    from public.mensagens where auth.uid() in (de, para)
  ), u as (
    select distinct on (outro) outro, texto, criado_em, minha from m order by outro, criado_em desc
  )
  select u.outro, p.apelido, coalesce(p.vip_ate > now(), false),
         exists (select 1 from public.membros x where x.user_id = u.outro),
         u.texto, u.criado_em, u.minha,
         (select count(*) from m where m.outro = u.outro and m.nao_lida)
  from u join public.perfis p on p.user_id = u.outro
  order by u.criado_em desc;
$$;

create or replace function public.marcar_lidas(p_de uuid)
returns void language sql volatile security definer set search_path = public as $$
  update public.mensagens set lida_em = now() where para = auth.uid() and de = p_de and lida_em is null;
$$;

create or replace function public.nao_lidas()
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from public.mensagens m
  where m.para = auth.uid() and m.lida_em is null
    and not exists (select 1 from public.bloqueios b where b.quem = auth.uid() and b.bloqueado = m.de);
$$;
grant execute on function public.minhas_conversas(), public.marcar_lidas(uuid), public.nao_lidas() to authenticated;
revoke execute on function public.minhas_conversas(), public.marcar_lidas(uuid), public.nao_lidas() from anon, public;

-- ---------- denúncias (a equipe só vê a mensagem que foi denunciada) ----------
create table if not exists public.denuncias (
  id          bigint generated always as identity primary key,
  mensagem_id bigint references public.mensagens(id) on delete set null,
  quem        uuid references public.perfis(user_id) on delete set null,
  denunciado  uuid references public.perfis(user_id) on delete set null,
  texto       text,                         -- cópia da mensagem denunciada
  motivo      text check (motivo is null or char_length(motivo) <= 300),
  resolvida   boolean not null default false,
  criado_em   timestamptz not null default now()
);
alter table public.denuncias enable row level security;
revoke all on public.denuncias from anon, authenticated;

create or replace function public.denunciar_mensagem(p_id bigint, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare m public.mensagens;
begin
  select * into m from public.mensagens where id = p_id and para = auth.uid();
  if m.id is null then raise exception 'mensagem não encontrada'; end if;
  insert into public.denuncias (mensagem_id, quem, denunciado, texto, motivo)
  values (m.id, auth.uid(), m.de, m.texto, nullif(trim(p_motivo), ''));
end $$;

create or replace function public.listar_denuncias()
returns table (id bigint, quem text, denunciado uuid, denunciado_apelido text, texto text, motivo text, resolvida boolean, criado_em timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_membro() then raise exception 'sem permissão'; end if;
  return query
    select d.id, pq.apelido, d.denunciado, pd.apelido, d.texto, d.motivo, d.resolvida, d.criado_em
    from public.denuncias d
    left join public.perfis pq on pq.user_id = d.quem
    left join public.perfis pd on pd.user_id = d.denunciado
    order by d.resolvida, d.criado_em desc limit 200;
end $$;

create or replace function public.resolver_denuncia(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_membro() then raise exception 'sem permissão'; end if;
  update public.denuncias set resolvida = true where id = p_id;
end $$;

grant execute on function public.denunciar_mensagem(bigint, text) to authenticated;
grant execute on function public.listar_denuncias(), public.resolver_denuncia(bigint) to authenticated;
revoke execute on function public.denunciar_mensagem(bigint, text), public.listar_denuncias(), public.resolver_denuncia(bigint) from anon, public;

-- conta bloqueada também não manda mensagem (o banir() já apaga os comentários)
