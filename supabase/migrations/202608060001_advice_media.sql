insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('advice-media', 'advice-media', true, 8000000, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "public advice media" on storage.objects for select using (bucket_id = 'advice-media');
