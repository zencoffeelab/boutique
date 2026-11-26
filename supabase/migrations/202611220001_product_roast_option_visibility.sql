alter table products
  add column if not exists show_filter_roast_option boolean not null default true,
  add column if not exists show_espresso_roast_option boolean not null default true;

-- Preserve the existing presentation of the roasting test product, which has
-- never offered a roast selection on its public page.
update products
set
  show_filter_roast_option = false,
  show_espresso_roast_option = false
where slug = 'test-de-torrefaction';
