-- Ranking de leitores: quem mais comentou nos últimos p_dias (pódio da página inicial)
-- Rodar no SQL Editor do Supabase. Pode rodar de novo sem problema.
create or replace function public.top_comentaristas(p_dias int default 30, p_limite int default 5)
returns table (user_id uuid, apelido text, comentarios bigint, vip boolean, equipe boolean)
language sql stable security definer set search_path = public as $$
  select c.user_id, p.apelido, count(*)::bigint,
         coalesce(p.vip_ate > now(), false),
         exists (select 1 from public.membros m where m.user_id = c.user_id)
  from public.comentarios c join public.perfis p on p.user_id = c.user_id
  where c.criado_em > now() - make_interval(days => least(greatest(p_dias, 1), 365)) and not p.banido
  group by c.user_id, p.apelido, p.vip_ate
  order by 3 desc, max(c.criado_em) desc
  limit least(greatest(p_limite, 1), 20);
$$;
grant execute on function public.top_comentaristas(int, int) to anon, authenticated;
