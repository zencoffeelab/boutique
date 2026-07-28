alter table products
  add column if not exists hover_image_storage_path text,
  add column if not exists hover_image_public_url text;
