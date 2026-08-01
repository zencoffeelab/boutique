alter table products
  add column display_order integer not null default 0;

with ranked_products as (
  select
    id,
    row_number() over (
      partition by case when status = 'archived' then 'archived' else 'current' end
      order by created_at desc, id
    ) as position
  from products
)
update products
set display_order = ranked_products.position
from ranked_products
where products.id = ranked_products.id;

create index products_display_order_idx
  on products (status, display_order, created_at desc);
