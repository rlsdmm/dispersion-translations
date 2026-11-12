-- Populares do mês + comentários por página (estilo danmaku)
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo sem problema.

-- ---------- Leituras por dia (conta todo mundo, com ou sem conta) ----------
create table if not exists public.leituras_dia (
  serie_id text not null references public.series(id) on delete cascade on update cascade,
  dia      date not null default current_date,
  n        int  not null default 0,
  primary key (serie_id, dia)
);
alter table public.leituras_dia enable row level security;
revoke all on public.leituras_dia from anon, authenticated;

-- O leitor chama isso ao abrir um capítulo (o site só chama 1x por capítulo por dia em cada navegador)
create or replace function public.contar_leitura(p_serie text)
returns void language sql volatile security definer set search_path = public as $$
  insert into public.leituras_dia (serie_id, dia, n)
  select p_serie, current_date, 1 where exists (select 1 from public.series where id = p_serie)
  on conflict (serie_id, dia) do update set n = leituras_dia.n + 1;
$$;

-- Ranking dos últimos p_dias: leituras + leitores com conta
create or replace function public.populares(p_dias int default 30, p_limite int default 10)
returns table (serie_id text, leituras bigint)
language sql stable security definer set search_path = public as $$
  select serie_id, sum(n)::bigint as leituras from (
    select serie_id, n from public.leituras_dia where dia > current_date - least(greatest(p_dias, 1), 365)
    union all
    select serie_id, count(distinct user_id) from public.historico
      where lido_em > now() - make_interval(days => least(greatest(p_dias, 1), 365)) group by serie_id
  ) x group by serie_id order by 2 desc, 1 limit least(greatest(p_limite, 1), 50);
$$;

grant execute on function public.contar_leitura(text), public.populares(int, int) to anon, authenticated;

-- ---------- Comentários numa página do capítulo ----------
alter table public.comentarios add column if not exists pagina int check (pagina >= 0 and pagina < 1000);
grant insert (serie_id, numero, texto, pagina) on public.comentarios to authenticated;
create index if not exists comentarios_pag on public.comentarios (serie_id, numero, pagina);

-- anti-flood mais curto (comentário em página costuma ser rapidinho): 1 a cada 8 segundos
drop policy if exists "leitor comenta" on public.comentarios;
create policy "leitor comenta" on public.comentarios
  for insert to authenticated with check (
    user_id = auth.uid()
    and not exists (select 1 from public.perfis p where p.user_id = auth.uid() and p.banido)
    and not exists (select 1 from public.comentarios c where c.user_id = auth.uid() and c.criado_em > now() - interval '8 seconds')
  );
