drop index if exists orders_archived_listing_idx;

create index if not exists orders_archived_listing_idx
  on orders (created_at desc, id desc)
  where archived_at is not null;
