-- ============================================================
--  VIP, apoios (doações) e capítulo antecipado
--  Rodar no SQL Editor do Supabase. Pode rodar de novo sem problema.
-- ============================================================

-- ---------- VIP: até quando a conta é VIP ----------
alter table public.perfis add column if not exists vip_ate timestamptz;
-- (o leitor NÃO consegue mudar isso: o update de perfis só libera apelido e prefs)

-- quem está logado é VIP? (membro do grupo conta como VIP)
create or replace function public.is_vip()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_membro()
      or exists (select 1 from public.perfis where user_id = auth.uid() and vip_ate > now());
$$;
grant execute on function public.is_vip() to anon, authenticated;

-- ---------- Capítulo antecipado ----------
-- publico_em vazio = todo mundo lê; no futuro = só VIP e equipe até essa data
alter table public.capitulos add column if not exists publico_em timestamptz;
drop policy if exists "todos leem capitulos" on public.capitulos;
create policy "todos leem capitulos" on public.capitulos for select
  using (publico_em is null or publico_em <= now() or public.is_vip());

-- o que está antecipado agora (sem as páginas), pra mostrar o cadeado pra quem não é VIP
create or replace function public.caps_antecipados()
returns table (serie_id text, numero numeric, titulo text, data date, publico_em timestamptz)
language sql stable security definer set search_path = public as $$
  select serie_id, numero, titulo, data, publico_em from public.capitulos where publico_em > now();
$$;
grant execute on function public.caps_antecipados() to anon, authenticated;

-- ---------- Apoios (doações registradas pela equipe) ----------
create table if not exists public.apoios (
  id            bigint generated always as identity primary key,
  user_id       uuid references public.perfis(user_id) on delete set null,
  nome          text not null check (char_length(trim(nome)) between 1 and 40),
  valor         numeric(10, 2) check (valor is null or valor >= 0),
  mostrar_valor boolean not null default false,
  no_mural      boolean not null default true,
  mensagem      text check (mensagem is null or char_length(mensagem) <= 140),
  dias_vip      int not null default 0 check (dias_vip >= 0),
  registrado_por uuid default auth.uid() references auth.users on delete set null,
  criado_em     timestamptz not null default now()
);
alter table public.apoios enable row level security;
revoke all on public.apoios from anon, authenticated;

-- mural público (sem o valor, a não ser que a pessoa tenha deixado mostrar)
create or replace function public.mural_apoios(p_limite int default 60)
returns table (nome text, mensagem text, valor numeric, vip boolean, criado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select a.nome, a.mensagem, case when a.mostrar_valor then a.valor end,
         coalesce(p.vip_ate > now(), false), a.criado_em
  from public.apoios a left join public.perfis p on p.user_id = a.user_id
  where a.no_mural order by a.criado_em desc limit least(greatest(p_limite, 1), 200);
$$;
grant execute on function public.mural_apoios(int) to anon, authenticated;

-- ---------- Só a equipe: achar conta, registrar apoio, dar/tirar VIP ----------
create or replace function public.buscar_contas(p_q text)
returns table (user_id uuid, apelido text, email text, vip_ate timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_membro() then raise exception 'sem permissão'; end if;
  return query
    select p.user_id, p.apelido, u.email::text, p.vip_ate
    from public.perfis p join auth.users u on u.id = p.user_id
    where length(trim(p_q)) >= 2 and (p.apelido ilike '%' || trim(p_q) || '%' or u.email ilike '%' || trim(p_q) || '%')
    order by p.apelido limit 15;
end $$;

create or replace function public.registrar_apoio(
  p_user uuid, p_nome text, p_valor numeric, p_dias_vip int,
  p_mostrar_valor boolean default false, p_no_mural boolean default true, p_mensagem text default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare novo timestamptz;
begin
  if not public.is_membro() then raise exception 'sem permissão'; end if;
  insert into public.apoios (user_id, nome, valor, dias_vip, mostrar_valor, no_mural, mensagem)
  values (p_user, trim(p_nome), p_valor, greatest(coalesce(p_dias_vip, 0), 0), p_mostrar_valor, p_no_mural, nullif(trim(p_mensagem), ''));
  if p_user is not null and coalesce(p_dias_vip, 0) > 0 then
    update public.perfis set vip_ate = greatest(coalesce(vip_ate, now()), now()) + make_interval(days => p_dias_vip)
    where user_id = p_user returning vip_ate into novo;
  end if;
  return novo;
end $$;

create or replace function public.definir_vip(p_user uuid, p_ate timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_membro() then raise exception 'sem permissão'; end if;
  update public.perfis set vip_ate = p_ate where user_id = p_user;
end $$;

create or replace function public.listar_apoios()
returns table (id bigint, nome text, apelido text, valor numeric, dias_vip int, mostrar_valor boolean, no_mural boolean,
               mensagem text, criado_em timestamptz, vip_ate timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_membro() then raise exception 'sem permissão'; end if;
  return query
    select a.id, a.nome, p.apelido, a.valor, a.dias_vip, a.mostrar_valor, a.no_mural, a.mensagem, a.criado_em, p.vip_ate
    from public.apoios a left join public.perfis p on p.user_id = a.user_id order by a.criado_em desc limit 300;
end $$;

create or replace function public.apagar_apoio(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_membro() then raise exception 'sem permissão'; end if;
  delete from public.apoios where id = p_id;
end $$;

revoke execute on function public.buscar_contas(text), public.registrar_apoio(uuid, text, numeric, int, boolean, boolean, text),
  public.definir_vip(uuid, timestamptz), public.listar_apoios(), public.apagar_apoio(bigint) from anon, public;
grant execute on function public.buscar_contas(text), public.registrar_apoio(uuid, text, numeric, int, boolean, boolean, text),
  public.definir_vip(uuid, timestamptz), public.listar_apoios(), public.apagar_apoio(bigint) to authenticated;
