-- =============================================================================
-- Fio do Bigode Barbearia — Storage (fotos do site: galeria, equipe, logo)
--
-- STATUS: PREPARADO, NÃO APLICADO (ver 0001). Só faz algo se o Supabase Storage existir.
--
-- Bucket "site" (público para LEITURA — são fotos do site institucional).
-- Caminho obrigatório: <business_id>/<arquivo>. Só owner/admin da barbearia escreve na pasta dela.
-- Arquivos PRIVADOS (se um dia existirem) devem ir em outro bucket privado com URL assinada.
-- =============================================================================
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'Storage não encontrado: política de bucket ignorada.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('site', 'site', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
  on conflict (id) do update
    set public = true, file_size_limit = 5242880,
        allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

  drop policy if exists site_admin_insert on storage.objects;
  drop policy if exists site_admin_update on storage.objects;
  drop policy if exists site_admin_delete on storage.objects;

  create policy site_admin_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'site'
      and (select app.is_admin(((storage.foldername(name))[1])::uuid)));
  create policy site_admin_update on storage.objects for update to authenticated
    using (bucket_id = 'site' and (select app.is_admin(((storage.foldername(name))[1])::uuid)))
    with check (bucket_id = 'site' and (select app.is_admin(((storage.foldername(name))[1])::uuid)));
  create policy site_admin_delete on storage.objects for delete to authenticated
    using (bucket_id = 'site' and (select app.is_admin(((storage.foldername(name))[1])::uuid)));
end $$;
