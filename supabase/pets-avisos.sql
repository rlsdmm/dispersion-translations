-- Avisos do pet: bolinha no site + e-mail pro dono quando o pet tá com fome ou tristinho
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo sem problema.
--
-- Regras do e-mail (quem manda é o Worker da Cloudflare, 2x por dia):
--   * só pet já nascido, com barriga < 20 ou felicidade < 30
--   * no máximo 1 e-mail a cada ~2 dias
--   * se a pessoa não voltar depois de 3 e-mails seguidos, para (volta a avisar quando ela cuidar do pet de novo)
--   * dá pra desligar na página do pet ou pelo link no próprio e-mail

alter table public.pets add column if not exists avisar_email boolean not null default true;
alter table public.pets add column if not exists ultimo_aviso timestamptz;
alter table public.pets add column if not exists avisos_seguidos int not null default 0;
alter table public.pets add column if not exists aviso_token uuid not null default gen_random_uuid();
create unique index if not exists pets_aviso_token on public.pets (aviso_token);

-- chaves de serviços internos (só o hash fica aqui; a chave de verdade fica no Worker)
create table if not exists public.chaves_internas (nome text primary key, hash text not null);
alter table public.chaves_internas enable row level security;
revoke all on public.chaves_internas from anon, authenticated;

create or replace function public.chave_interna_ok(p_nome text, p_chave text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(length(p_chave) >= 32, false) and exists (
    select 1 from public.chaves_internas where nome = p_nome and hash = encode(sha256(convert_to(p_chave, 'UTF8')), 'hex'));
$$;
revoke execute on function public.chave_interna_ok(text, text) from anon, authenticated, public;

-- estado rápido pro ícone 🐾 do topo do site (não cria pet)
create or replace function public.pet_status()
returns json language plpgsql stable security definer set search_path = public as $$
declare p public.pets; a record; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if auth.uid() is null then return null; end if;
  select * into p from public.pets where user_id = auth.uid();
  if not found then return null; end if;
  select * into a from public.pet_agora(p);
  return json_build_object('nasceu', p.nasceu_em is not null, 'nome', p.nome, 'especie', p.especie,
    'saciedade', a.barriga, 'felicidade', a.alegria, 'avisar_email', p.avisar_email,
    'aqueceu_hoje', exists (select 1 from public.pet_aquecidas where user_id = auth.uid() and dia = hoje));
end $$;

-- liga/desliga o e-mail (página do pet)
create or replace function public.avisos_pet(p_ligado boolean)
returns boolean language sql volatile security definer set search_path = public as $$
  update public.pets set avisar_email = coalesce(p_ligado, false) where user_id = auth.uid() returning avisar_email;
$$;

-- desligar pelo link do e-mail (sem precisar entrar na conta)
create or replace function public.parar_avisos_pet(p_token uuid)
returns text language sql volatile security definer set search_path = public as $$
  update public.pets set avisar_email = false where aviso_token = p_token returning coalesce(nome, 'seu pet');
$$;

-- lista de quem precisa receber e-mail agora (só o Worker, com a chave)
create or replace function public.pets_para_avisar(p_chave text)
returns table (user_id uuid, email text, apelido text, nome text, especie text, barriga int, alegria int, token uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.chave_interna_ok('avisos', p_chave) then raise exception 'sem permissão'; end if;
  return query
    select p.user_id, u.email::text, pf.apelido, p.nome, p.especie, a.barriga, a.alegria, p.aviso_token
    from public.pets p
    join auth.users u on u.id = p.user_id
    left join public.perfis pf on pf.user_id = p.user_id
    cross join lateral public.pet_agora(p) a
    where p.nasceu_em is not null and p.avisar_email
      and u.email is not null and u.email_confirmed_at is not null
      and not coalesce(pf.banido, false)
      and (a.barriga < 20 or a.alegria < 30)
      and (p.ultimo_aviso is null or p.ultimo_aviso < now() - interval '44 hours')
      and (p.avisos_seguidos < 3 or coalesce(p.atualizado_em, p.nasceu_em) > p.ultimo_aviso)
    order by p.ultimo_aviso nulls first
    limit 90;
end $$;

-- marca que o e-mail foi enviado
create or replace function public.marcar_aviso_pet(p_chave text, p_user uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.chave_interna_ok('avisos', p_chave) then raise exception 'sem permissão'; end if;
  update public.pets set
    avisos_seguidos = case when ultimo_aviso is null or coalesce(atualizado_em, nasceu_em) > ultimo_aviso then 1 else avisos_seguidos + 1 end,
    ultimo_aviso = now()
  where user_id = p_user;
end $$;

revoke execute on function public.pet_status(), public.avisos_pet(boolean) from anon, public;
grant execute on function public.pet_status(), public.avisos_pet(boolean) to authenticated;
grant execute on function public.parar_avisos_pet(uuid), public.pets_para_avisar(text), public.marcar_aviso_pet(text, uuid) to anon, authenticated;
