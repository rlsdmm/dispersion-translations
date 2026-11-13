-- Meta do mês: quanto já entrou de apoio no mês atual (horário de Brasília)
-- Só o total e a quantidade; os valores de cada pessoa continuam escondidos.
-- Rodar no SQL Editor do Supabase. Pode rodar de novo sem problema.
create or replace function public.arrecadado_mes()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'total', coalesce(sum(valor), 0),
    'apoios', count(*),
    'mes', to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM'))
  from public.apoios
  where (criado_em at time zone 'America/Sao_Paulo') >= date_trunc('month', now() at time zone 'America/Sao_Paulo');
$$;
grant execute on function public.arrecadado_mes() to anon, authenticated;
