create table product_editorial_blocks (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  position smallint not null check (position in (1, 2)),
  storage_path text not null,
  public_url text not null,
  alt_fr text not null,
  alt_en text not null,
  title_fr text not null,
  title_en text not null,
  body_fr text not null,
  body_en text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, position)
);

create index product_editorial_blocks_product_id_idx on product_editorial_blocks(product_id);

revoke all on product_editorial_blocks from anon, authenticated;
grant select, insert, update, delete on product_editorial_blocks to service_role;
