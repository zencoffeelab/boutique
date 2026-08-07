alter table orders add column if not exists admin_viewed_at timestamptz;

-- Les commandes existantes ne doivent pas apparaître comme de nouvelles alertes.
update orders set admin_viewed_at = now() where admin_viewed_at is null;

create index if not exists orders_unviewed_paid_idx
  on orders (created_at desc)
  where paid_at is not null and admin_viewed_at is null;
