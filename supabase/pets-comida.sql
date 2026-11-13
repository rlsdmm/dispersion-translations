-- Pets: comidinha e humor
-- Rodar no SQL Editor do Supabase (depois do pets.sql). Pode rodar de novo sem problema.
--
-- Barriga (saciedade) e felicidade vão de 0 a 100 e baixam com o tempo:
--   barriga   -2 por hora (esvazia em ~2 dias)
--   felicidade -1 por hora (some em ~4 dias)
-- O pet nunca morre: no máximo fica com fome / tristinho.
-- Petiscos: +1 por capítulo terminado depois que o pet nasceu, +1 de presente por dia.
-- Comer: +30 de barriga e +10 de felicidade (a comida favorita dá +45 e +25).
-- Carinho: +6 de felicidade, até 5 vezes por dia.

alter table public.pets add column if not exists saciedade int not null default 70 check (saciedade between 0 and 100);
alter table public.pets add column if not exists felicidade int not null default 80 check (felicidade between 0 and 100);
alter table public.pets add column if not exists atualizado_em timestamptz;
alter table public.pets add column if not exists petiscos_gastos int not null default 0;
alter table public.pets add column if not exists presentes int not null default 0;
alter table public.pets add column if not exists presente_dia date;
alter table public.pets add column if not exists carinho_dia date;
alter table public.pets add column if not exists carinhos int not null default 0;

-- valores de agora (aplicando o tempo que passou)
create or replace function public.pet_agora(p public.pets, out barriga int, out alegria int)
language sql stable as $$
  select greatest(0, p.saciedade - floor(extract(epoch from now() - coalesce(p.atualizado_em, p.nasceu_em, now())) / 3600 * 2)::int),
         greatest(0, p.felicidade - floor(extract(epoch from now() - coalesce(p.atualizado_em, p.nasceu_em, now())) / 3600)::int);
$$;

create or replace function public.pet_favorita(p public.pets)
returns text language sql immutable as $$
  select (array['onigiri', 'dango', 'pudim', 'morango'])[1 + coalesce(p.cor, 0) % 4];
$$;

-- estado completo (substitui a versão do pets.sql)
create or replace function public.meu_pet()
returns json language plpgsql volatile security definer set search_path = public as $$
declare p public.pets; hoje date := (now() at time zone 'America/Sao_Paulo')::date; caps int; dias int; ganhos int := 0; a record;
begin
  if auth.uid() is null then return null; end if;
  insert into public.pets (user_id) values (auth.uid()) on conflict do nothing;
  select * into p from public.pets where user_id = auth.uid();
  select count(*) into caps from public.historico h
    join public.capitulos c on c.serie_id = h.serie_id and c.numero = h.numero
    where h.user_id = auth.uid() and h.concluido and h.lido_em >= p.ovo_em;
  select count(*) into dias from public.pet_aquecidas where user_id = auth.uid();
  if p.nasceu_em is not null then
    select count(*) into ganhos from public.historico h
      join public.capitulos c on c.serie_id = h.serie_id and c.numero = h.numero
      where h.user_id = auth.uid() and h.concluido and h.lido_em >= p.nasceu_em;
  end if;
  select * into a from public.pet_agora(p);
  return json_build_object(
    'ovo_em', p.ovo_em, 'especie', p.especie, 'raridade', p.raridade, 'cor', p.cor, 'brilhante', p.brilhante,
    'nome', p.nome, 'nasceu_em', p.nasceu_em,
    'calor', least(100, 10 * caps + 15 * dias), 'caps', caps, 'dias', dias,
    'aqueceu_hoje', exists (select 1 from public.pet_aquecidas where user_id = auth.uid() and dia = hoje),
    'saciedade', a.barriga, 'felicidade', a.alegria,
    'petiscos', greatest(0, ganhos + p.presentes - p.petiscos_gastos),
    'presente_hoje', p.presente_dia is not distinct from hoje,
    'carinhos_hoje', case when p.carinho_dia is not distinct from hoje then p.carinhos else 0 end);
end $$;

-- aquecer_ovo continua igual, só passa a marcar a hora em que nasceu como ponto de partida da fome
create or replace function public.aquecer_ovo()
returns json language plpgsql volatile security definer set search_path = public as $$
declare p public.pets; est json; r float8; rar text; esp text; nasceu boolean := false;
begin
  est := public.meu_pet();
  if est is null then raise exception 'não logado'; end if;
  select * into p from public.pets where user_id = auth.uid();
  if p.nasceu_em is not null then return est; end if;
  insert into public.pet_aquecidas (user_id, dia)
    values (auth.uid(), (now() at time zone 'America/Sao_Paulo')::date) on conflict do nothing;
  est := public.meu_pet();
  if (est->>'calor')::int >= 100 then
    r := random();
    rar := case when r < 0.03 then 'lendario' when r < 0.15 then 'raro' when r < 0.40 then 'incomum' else 'comum' end;
    esp := case rar
      when 'comum'    then (array['bolinho', 'pipoca', 'mochi'])[1 + floor(random() * 3)::int]
      when 'incomum'  then (array['nuvem', 'brotinho'])[1 + floor(random() * 2)::int]
      when 'raro'     then (array['estrelinha', 'nanquim'])[1 + floor(random() * 2)::int]
      else 'draguinho' end;
    update public.pets set especie = esp, raridade = rar, cor = floor(random() * 360)::int,
      brilhante = random() < 0.02, nasceu_em = now(), atualizado_em = now(), saciedade = 70, felicidade = 80
    where user_id = auth.uid() and nasceu_em is null;
    nasceu := true;
    est := public.meu_pet();
  end if;
  return (est::jsonb || jsonb_build_object('nasceu_agora', nasceu))::json;
end $$;

-- dar comida
create or replace function public.alimentar_pet(p_comida text)
returns json language plpgsql volatile security definer set search_path = public as $$
declare p public.pets; est json; a record; fav boolean;
begin
  if p_comida not in ('onigiri', 'dango', 'pudim', 'morango') then raise exception 'comida desconhecida'; end if;
  est := public.meu_pet();
  if est is null then raise exception 'não logado'; end if;
  select * into p from public.pets where user_id = auth.uid() for update;
  if p.nasceu_em is null then raise exception 'o pet ainda não nasceu'; end if;
  if (est->>'petiscos')::int < 1 then raise exception 'sem petiscos'; end if;
  select * into a from public.pet_agora(p);
  if a.barriga >= 95 then raise exception 'está cheio'; end if;
  fav := public.pet_favorita(p) = p_comida;
  update public.pets set
    saciedade = least(100, a.barriga + case when fav then 45 else 30 end),
    felicidade = least(100, a.alegria + case when fav then 25 else 10 end),
    atualizado_em = now(), petiscos_gastos = petiscos_gastos + 1
  where user_id = auth.uid();
  return (public.meu_pet()::jsonb || jsonb_build_object('favorita', fav))::json;
end $$;

-- petisco de presente (1 por dia)
create or replace function public.presente_pet()
returns json language plpgsql volatile security definer set search_path = public as $$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if auth.uid() is null then raise exception 'não logado'; end if;
  update public.pets set presentes = presentes + 1, presente_dia = hoje
  where user_id = auth.uid() and nasceu_em is not null and presente_dia is distinct from hoje;
  return public.meu_pet();
end $$;

-- carinho (+6 de felicidade, até 5 por dia; depois disso só a animação)
create or replace function public.carinho_pet()
returns json language plpgsql volatile security definer set search_path = public as $$
declare p public.pets; a record; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if auth.uid() is null then raise exception 'não logado'; end if;
  select * into p from public.pets where user_id = auth.uid() for update;
  if p.nasceu_em is null then return public.meu_pet(); end if;
  if p.carinho_dia is distinct from hoje then p.carinhos := 0; end if;
  if p.carinhos < 5 then
    select * into a from public.pet_agora(p);
    update public.pets set saciedade = a.barriga, felicidade = least(100, a.alegria + 6), atualizado_em = now(),
      carinho_dia = hoje, carinhos = p.carinhos + 1
    where user_id = auth.uid();
  end if;
  return public.meu_pet();
end $$;

grant execute on function public.meu_pet(), public.aquecer_ovo(), public.alimentar_pet(text), public.presente_pet(), public.carinho_pet() to authenticated;
revoke execute on function public.meu_pet(), public.aquecer_ovo(), public.alimentar_pet(text), public.presente_pet(), public.carinho_pet() from anon, public;
