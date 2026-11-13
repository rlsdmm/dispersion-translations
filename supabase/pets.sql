-- Pets: cada leitor ganha um ovo, cuida dele e nasce um bichinho aleatório
-- Rodar no SQL Editor do Supabase. Pode rodar de novo sem problema.
--
-- O ovo precisa de 100 de calor pra chocar:
--   +15 por dia em que a pessoa aquece o ovo (botão "Aquecer", 1x por dia)
--   +10 por capítulo terminado depois de ganhar o ovo
-- Quando chega em 100, o sorteio do bicho é feito aqui no banco (ninguém consegue escolher).

create table if not exists public.pets (
  user_id    uuid primary key references public.perfis(user_id) on delete cascade,
  ovo_em     timestamptz not null default now(),
  especie    text,
  raridade   text check (raridade in ('comum', 'incomum', 'raro', 'lendario')),
  cor        int check (cor between 0 and 359),
  brilhante  boolean not null default false,
  nome       text check (nome is null or char_length(trim(nome)) between 1 and 20),
  nasceu_em  timestamptz
);
alter table public.pets enable row level security;
revoke all on public.pets from anon, authenticated;
grant select on public.pets to anon, authenticated;
drop policy if exists "pets publicos" on public.pets;
create policy "pets publicos" on public.pets for select using (true);

create table if not exists public.pet_aquecidas (
  user_id uuid not null references public.perfis(user_id) on delete cascade,
  dia     date not null,
  primary key (user_id, dia)
);
alter table public.pet_aquecidas enable row level security;
revoke all on public.pet_aquecidas from anon, authenticated;

-- estado do ovo/pet da pessoa (cria o ovo na primeira vez)
create or replace function public.meu_pet()
returns json language plpgsql volatile security definer set search_path = public as $$
declare p public.pets; hoje date := (now() at time zone 'America/Sao_Paulo')::date; caps int; dias int;
begin
  if auth.uid() is null then return null; end if;
  insert into public.pets (user_id) values (auth.uid()) on conflict do nothing;
  select * into p from public.pets where user_id = auth.uid();
  select count(*) into caps from public.historico h
    join public.capitulos c on c.serie_id = h.serie_id and c.numero = h.numero
    where h.user_id = auth.uid() and h.concluido and h.lido_em >= p.ovo_em;
  select count(*) into dias from public.pet_aquecidas where user_id = auth.uid();
  return json_build_object(
    'ovo_em', p.ovo_em, 'especie', p.especie, 'raridade', p.raridade, 'cor', p.cor, 'brilhante', p.brilhante,
    'nome', p.nome, 'nasceu_em', p.nasceu_em,
    'calor', least(100, 10 * caps + 15 * dias), 'caps', caps, 'dias', dias,
    'aqueceu_hoje', exists (select 1 from public.pet_aquecidas where user_id = auth.uid() and dia = hoje));
end $$;

-- aquece o ovo (1x por dia) e, se chegou em 100, faz nascer
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
      brilhante = random() < 0.02, nasceu_em = now()
    where user_id = auth.uid() and nasceu_em is null;
    nasceu := true;
    est := public.meu_pet();
  end if;
  return (est::jsonb || jsonb_build_object('nasceu_agora', nasceu))::json;
end $$;

-- dá nome ao pet
create or replace function public.nomear_pet(p_nome text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'não logado'; end if;
  update public.pets set nome = nullif(trim(p_nome), '') where user_id = auth.uid() and nasceu_em is not null;
end $$;

grant execute on function public.meu_pet(), public.aquecer_ovo(), public.nomear_pet(text) to authenticated;
revoke execute on function public.meu_pet(), public.aquecer_ovo(), public.nomear_pet(text) from anon, public;
