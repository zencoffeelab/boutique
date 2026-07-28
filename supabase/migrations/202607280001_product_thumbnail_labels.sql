alter table products
  add column if not exists thumbnail_label_storage_path text,
  add column if not exists thumbnail_label_public_url text,
  add column if not exists thumbnail_background_color text not null default '#d9ddd3';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_thumbnail_background_color_check'
  ) then
    alter table products
      add constraint products_thumbnail_background_color_check
      check (thumbnail_background_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end $$;
