-- Contador de visitas próprio (funciona mesmo com bloqueador de anúncio)
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo sem problema.
--
-- Cada navegador ganha um número aleatório (guardado só no navegador, sem nome,
-- e-mail ou IP). Guardamos 1 linha por navegador por dia, com quantas páginas abriu.

create table if not exists public.acessos_dia (
  dia        date not null,
  visitante  uuid not null,
  paginas    int  not null default 1,
  celular    boolean not null default false,
  origem     text,          -- de onde veio na 1ª página do dia: google, discord, twitter, outro, direto
  novo       boolean not null default false,  -- 1ª vez no site (nesse navegador)
  primary key (dia, visitante)
);
alter table public.acessos_dia enable row level security;
revoke all on public.acessos_dia from anon, authenticated;
create index if not exists acessos_dia_dia on public.acessos_dia (dia);

-- O site chama isso a cada página aberta
create or replace function public.registrar_acesso(p_visitante uuid, p_celular boolean default false,
                                                   p_origem text default null, p_novo boolean default false)
returns void language sql volatile security definer set search_path = public as $$
  insert into public.acessos_dia (dia, visitante, celular, origem, novo)
  values ((now() at time zone 'America/Sao_Paulo')::date, p_visitante, coalesce(p_celular, false),
          case when p_origem in ('google', 'discord', 'twitter', 'reddit', 'facebook', 'outro', 'direto') then p_origem else 'outro' end,
          coalesce(p_novo, false))
  on conflict (dia, visitante) do update set paginas = least(acessos_dia.paginas + 1, 5000);
$$;
revoke execute on function public.registrar_acesso(uuid, boolean, text, boolean) from public;
grant execute on function public.registrar_acesso(uuid, boolean, text, boolean) to anon, authenticated;

-- Números pro painel do grupo (só equipe)
create or replace function public.estatisticas_acessos(p_dias int default 30)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  d int := least(greatest(coalesce(p_dias, 30), 1), 365);
  desde date := (now() at time zone 'America/Sao_Paulo')::date - (d - 1);
  r json;
begin
  if not public.is_membro() then raise exception 'sem permissão'; end if;
  select json_build_object(
    'dias', (select coalesce(json_agg(x order by x.dia desc), '[]') from (
        select g.dia::date as dia,
               count(a.visitante) as visitantes,
               coalesce(sum(a.paginas), 0) as paginas,
               count(*) filter (where a.novo) as novos,
               count(*) filter (where a.celular) as celular,
               (select coalesce(sum(n), 0) from public.leituras_dia l where l.dia = g.dia::date) as leituras
        from generate_series(desde, (now() at time zone 'America/Sao_Paulo')::date, interval '1 day') g(dia)
        left join public.acessos_dia a on a.dia = g.dia::date
        group by g.dia) x),
    'unicos', (select count(distinct visitante) from public.acessos_dia where dia >= desde),
    'origens', (select coalesce(json_object_agg(origem, n), '{}') from (
        select coalesce(origem, 'direto') as origem, count(*) as n from public.acessos_dia where dia >= desde group by 1) o),
    'obras', (select coalesce(json_agg(o), '[]') from (
        select l.serie_id, s.titulo, sum(l.n) as leituras from public.leituras_dia l
        left join public.series s on s.id = l.serie_id
        where l.dia >= desde group by l.serie_id, s.titulo order by 3 desc limit 15) o)
  ) into r;
  return r;
end $$;
revoke execute on function public.estatisticas_acessos(int) from anon, public;
grant execute on function public.estatisticas_acessos(int) to authenticated;
