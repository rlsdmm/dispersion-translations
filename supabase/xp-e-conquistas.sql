-- XP, níveis e conquistas dos leitores
-- Rodar no SQL Editor do Supabase. Pode rodar de novo sem problema.
--
-- Como o XP é calculado (tudo a partir do que já fica salvo no banco):
--   +10 por capítulo terminado (no máximo 150 capítulos contam por dia)
--   +5  por comentário (no máximo 10 comentários contam por dia)
--   +50 por obra terminada (todos os capítulos publicados lidos)
--   +5  por dia em que a pessoa leu ou comentou
--   Capítulos e comentários feitos enquanto a pessoa era VIP valem o dobro.
-- Os nomes dos níveis e das conquistas ficam no js/app.js (NIVEIS e CONQUISTAS).

-- ---------- dias de atividade (pra sequência de dias seguidos) ----------
create table if not exists public.xp_dias (
  user_id uuid not null references auth.users on delete cascade,
  dia     date not null,
  primary key (user_id, dia)
);
alter table public.xp_dias enable row level security;
revoke all on public.xp_dias from anon, authenticated;

-- a data de leitura é sempre a do servidor (ninguém consegue inventar datas pra ganhar sequência)
create or replace function public.historico_carimbo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.lido_em := now();
  insert into public.xp_dias (user_id, dia)
  values (new.user_id, (now() at time zone 'America/Sao_Paulo')::date) on conflict do nothing;
  return new;
end $$;
drop trigger if exists historico_carimbo on public.historico;
create trigger historico_carimbo before insert or update on public.historico
  for each row execute function public.historico_carimbo();

create or replace function public.comentario_dia()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.xp_dias (user_id, dia)
  values (new.user_id, (new.criado_em at time zone 'America/Sao_Paulo')::date) on conflict do nothing;
  return new;
end $$;
drop trigger if exists comentario_dia on public.comentarios;
create trigger comentario_dia after insert on public.comentarios
  for each row execute function public.comentario_dia();

-- preenche com o que já existe
insert into public.xp_dias (user_id, dia)
  select user_id, (lido_em at time zone 'America/Sao_Paulo')::date from public.historico
  union select user_id, (criado_em at time zone 'America/Sao_Paulo')::date from public.comentarios
on conflict do nothing;

-- ---------- cálculo (interno) ----------
create or replace function public.xp_calc(p_users uuid[] default null)
returns table (user_id uuid, xp int, caps int, obras int, comentarios int, dias int,
               seq_atual int, melhor_seq int, favoritos int, coruja boolean, apoiador boolean)
language sql stable security definer set search_path = public as $$
with us as (
  select p.user_id from public.perfis p
  where (p_users is null or p.user_id = any (p_users)) and not p.banido
),
vip as (
  select a.user_id, a.criado_em as ini, a.criado_em + make_interval(days => a.dias_vip) as fim
  from public.apoios a where a.dias_vip > 0 and a.user_id in (select user_id from us)
),
lidos as (
  select h.user_id, h.serie_id, h.lido_em,
         row_number() over (partition by h.user_id, (h.lido_em at time zone 'America/Sao_Paulo')::date order by h.lido_em, h.numero) as rn,
         exists (select 1 from vip v where v.user_id = h.user_id and h.lido_em between v.ini and v.fim) as dobro
  from public.historico h
  join public.capitulos c on c.serie_id = h.serie_id and c.numero = h.numero
  where h.concluido and h.user_id in (select user_id from us)
),
xc as (
  select l.user_id, count(*)::int as n,
         sum(case when l.rn <= 150 then case when l.dobro then 20 else 10 end else 0 end)::int as pts,
         bool_or(extract(hour from l.lido_em at time zone 'America/Sao_Paulo') < 5) as coruja
  from lidos l group by l.user_id
),
com as (
  select c.user_id,
         row_number() over (partition by c.user_id, (c.criado_em at time zone 'America/Sao_Paulo')::date order by c.criado_em) as rn,
         exists (select 1 from vip v where v.user_id = c.user_id and c.criado_em between v.ini and v.fim) as dobro
  from public.comentarios c where c.user_id in (select user_id from us)
),
xm as (
  select m.user_id, count(*)::int as n,
         sum(case when m.rn <= 10 then case when m.dobro then 10 else 5 end else 0 end)::int as pts
  from com m group by m.user_id
),
tot as (
  select c.serie_id, count(*) as n from public.capitulos c
  where c.publico_em is null or c.publico_em <= now() group by c.serie_id
),
ob as (
  select x.user_id, count(*)::int as n
  from (select l.user_id, l.serie_id, count(*) as n from lidos l group by l.user_id, l.serie_id) x
  join tot t on t.serie_id = x.serie_id
  where x.n >= t.n group by x.user_id
),
d as (
  select x.user_id, x.dia, x.dia - (row_number() over (partition by x.user_id order by x.dia))::int as grp
  from public.xp_dias x where x.user_id in (select user_id from us)
),
seqs as (select d.user_id, d.grp, count(*)::int as len, max(d.dia) as ultimo from d group by d.user_id, d.grp),
sq as (
  select s.user_id, sum(s.len)::int as dias, max(s.len)::int as melhor,
         coalesce(max(s.len) filter (where s.ultimo >= (now() at time zone 'America/Sao_Paulo')::date - 1), 0)::int as atual
  from seqs s group by s.user_id
),
fv as (select f.user_id, count(*)::int as n from public.favoritos f where f.user_id in (select user_id from us) group by f.user_id)
select us.user_id,
       (coalesce(xc.pts, 0) + coalesce(xm.pts, 0) + 50 * coalesce(ob.n, 0) + 5 * coalesce(sq.dias, 0))::int,
       coalesce(xc.n, 0), coalesce(ob.n, 0), coalesce(xm.n, 0), coalesce(sq.dias, 0),
       coalesce(sq.atual, 0), coalesce(sq.melhor, 0), coalesce(fv.n, 0), coalesce(xc.coruja, false),
       exists (select 1 from public.apoios a where a.user_id = us.user_id)
from us
left join xc on xc.user_id = us.user_id
left join xm on xm.user_id = us.user_id
left join ob on ob.user_id = us.user_id
left join sq on sq.user_id = us.user_id
left join fv on fv.user_id = us.user_id;
$$;
revoke execute on function public.xp_calc(uuid[]) from anon, authenticated, public;

-- ---------- o que o site chama ----------
-- tudo sobre a própria pessoa (página "Minha conta")
create or replace function public.meu_xp()
returns json language sql stable security definer set search_path = public as $$
  select row_to_json(x) from public.xp_calc(array[auth.uid()]) x;
$$;

-- só o XP de algumas contas (selo de nível nos comentários)
create or replace function public.xp_de(p_users uuid[])
returns table (user_id uuid, xp int)
language sql stable security definer set search_path = public as $$
  select x.user_id, x.xp from public.xp_calc((p_users)[1:200]) x;
$$;

-- ranking da página inicial
create or replace function public.top_xp(p_limite int default 5)
returns table (user_id uuid, apelido text, xp int, vip boolean, equipe boolean)
language sql stable security definer set search_path = public as $$
  select x.user_id, p.apelido, x.xp, coalesce(p.vip_ate > now(), false),
         exists (select 1 from public.membros m where m.user_id = x.user_id)
  from public.xp_calc(null) x join public.perfis p on p.user_id = x.user_id
  where x.xp > 0
  order by x.xp desc, p.apelido
  limit least(greatest(p_limite, 1), 20);
$$;

grant execute on function public.meu_xp() to authenticated;
grant execute on function public.xp_de(uuid[]), public.top_xp(int) to anon, authenticated;
