-- Pets: acessórios (rodar depois do pets.sql e do pets-comida.sql). Pode rodar de novo sem problema.
--
-- Cabeça:  laco (terminou 1 obra), coroa (10 obras), bruxa (VIP), fone (conquista Coruja),
--          flor (descobriu a comida favorita), gato (nível 2 = 100 XP)
-- Rosto/pescoço: oculos (nível 3 = 300 XP), escuros (VIP), cachecol (nível 4 = 700 XP), sininho (pet com 7 dias)
-- A conferência é feita aqui no banco; ninguém consegue vestir o que não liberou.

alter table public.pets add column if not exists acessorio_cabeca text;
alter table public.pets add column if not exists acessorio_rosto text;
alter table public.pets add column if not exists achou_favorita boolean not null default false;

create or replace function public.pet_liberados(p_user uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare x record; p public.pets; vip boolean; r text[] := '{}';
begin
  select * into x from public.xp_calc(array[p_user]);
  select * into p from public.pets where user_id = p_user;
  vip := exists (select 1 from public.perfis where user_id = p_user and vip_ate > now())
      or exists (select 1 from public.membros where user_id = p_user);
  if coalesce(x.obras, 0) >= 1 then r := r || 'laco'::text; end if;
  if coalesce(x.obras, 0) >= 10 then r := r || 'coroa'::text; end if;
  if vip then r := r || array['bruxa', 'escuros']; end if;
  if coalesce(x.coruja, false) then r := r || 'fone'::text; end if;
  if coalesce(p.achou_favorita, false) then r := r || 'flor'::text; end if;
  if coalesce(x.xp, 0) >= 100 then r := r || 'gato'::text; end if;
  if coalesce(x.xp, 0) >= 300 then r := r || 'oculos'::text; end if;
  if coalesce(x.xp, 0) >= 700 then r := r || 'cachecol'::text; end if;
  if p.nasceu_em is not null and p.nasceu_em <= now() - interval '7 days' then r := r || 'sininho'::text; end if;
  return r;
end $$;
revoke execute on function public.pet_liberados(uuid) from anon, authenticated, public;

-- estado completo (agora com acessórios); tira o que deixou de estar liberado (ex: VIP acabou)
create or replace function public.meu_pet()
returns json language plpgsql volatile security definer set search_path = public as $$
declare p public.pets; hoje date := (now() at time zone 'America/Sao_Paulo')::date; caps int; dias int; ganhos int := 0; a record; lib text[] := '{}';
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
    lib := public.pet_liberados(auth.uid());
    if (p.acessorio_cabeca is not null and not p.acessorio_cabeca = any (lib))
       or (p.acessorio_rosto is not null and not p.acessorio_rosto = any (lib)) then
      update public.pets set
        acessorio_cabeca = case when acessorio_cabeca = any (lib) then acessorio_cabeca end,
        acessorio_rosto  = case when acessorio_rosto  = any (lib) then acessorio_rosto end
      where user_id = auth.uid()
      returning * into p;
    end if;
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
    'carinhos_hoje', case when p.carinho_dia is not distinct from hoje then p.carinhos else 0 end,
    'acessorio_cabeca', p.acessorio_cabeca, 'acessorio_rosto', p.acessorio_rosto, 'liberados', lib);
end $$;

-- comer agora também marca quando a pessoa descobre a comida favorita (libera a florzinha)
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
    atualizado_em = now(), petiscos_gastos = petiscos_gastos + 1,
    achou_favorita = achou_favorita or fav
  where user_id = auth.uid();
  return (public.meu_pet()::jsonb || jsonb_build_object('favorita', fav))::json;
end $$;

-- vestir / tirar (p_item null = tirar)
create or replace function public.vestir_pet(p_slot text, p_item text)
returns json language plpgsql volatile security definer set search_path = public as $$
declare cabeca text[] := array['laco', 'coroa', 'bruxa', 'fone', 'flor', 'gato'];
        rosto  text[] := array['oculos', 'escuros', 'cachecol', 'sininho'];
begin
  if auth.uid() is null then raise exception 'não logado'; end if;
  if p_slot not in ('cabeca', 'rosto') then raise exception 'lugar inválido'; end if;
  if p_item is not null then
    if not p_item = any (case when p_slot = 'cabeca' then cabeca else rosto end) then raise exception 'acessório inválido'; end if;
    if not p_item = any (public.pet_liberados(auth.uid())) then raise exception 'acessório ainda bloqueado'; end if;
  end if;
  if p_slot = 'cabeca' then
    update public.pets set acessorio_cabeca = p_item where user_id = auth.uid() and nasceu_em is not null;
  else
    update public.pets set acessorio_rosto = p_item where user_id = auth.uid() and nasceu_em is not null;
  end if;
  return public.meu_pet();
end $$;

grant execute on function public.meu_pet(), public.alimentar_pet(text), public.vestir_pet(text, text) to authenticated;
revoke execute on function public.meu_pet(), public.alimentar_pet(text), public.vestir_pet(text, text) from anon, public;
