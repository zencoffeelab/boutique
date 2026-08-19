alter table products
  add column if not exists ribbon_new boolean not null default false,
  add column if not exists ribbon_back_soon boolean not null default false;
