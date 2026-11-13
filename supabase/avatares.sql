-- Foto de perfil (avatar) enviada pelo leitor
-- Rodar no SQL Editor do Supabase. Pode rodar de novo sem problema.
--
-- As fotos ficam no Storage do Supabase, bucket "avatares", na pasta de cada pessoa (<id>/...).
-- O site corta e diminui a imagem pra 256x256 antes de enviar (fica com ~20 KB).
-- O link salvo no perfil só pode apontar pra pasta da própria pessoa nesse bucket.

alter table public.perfis add column if not exists avatar_url text;
alter table public.perfis drop constraint if exists perfis_avatar_url_check;
alter table public.perfis add constraint perfis_avatar_url_check check (
  avatar_url is null
  or avatar_url like 'https://mslgqtpvieewxqebajzv.supabase.co/storage/v1/object/public/avatares/' || user_id::text || '/%'
);
grant update (avatar_url) on public.perfis to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 300000, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = 300000, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatares leitura publica" on storage.objects;
create policy "avatares leitura publica" on storage.objects
  for select using (bucket_id = 'avatares');
drop policy if exists "avatares envia o proprio" on storage.objects;
create policy "avatares envia o proprio" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatares troca o proprio" on storage.objects;
create policy "avatares troca o proprio" on storage.objects
  for update to authenticated using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatares apaga o proprio" on storage.objects;
create policy "avatares apaga o proprio" on storage.objects
  for delete to authenticated using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

-- moderação: a equipe tira a foto de alguém
create or replace function public.remover_avatar(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_membro() then raise exception 'sem permissão'; end if;
  update public.perfis set avatar_url = null where user_id = p_user;
end $$;
revoke execute on function public.remover_avatar(uuid) from anon, public;
grant execute on function public.remover_avatar(uuid) to authenticated;

-- bloquear alguém agora também tira a foto
create or replace function public.banir(p_user uuid, p_banido boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_membro() then raise exception 'sem permissão'; end if;
  if exists (select 1 from public.membros where user_id = p_user) then raise exception 'não dá pra bloquear membro'; end if;
  update public.perfis set banido = p_banido, avatar_url = case when p_banido then null else avatar_url end where user_id = p_user;
  if p_banido then delete from public.comentarios where user_id = p_user; end if;
end $$;
