alter table shipments
  add column label_provider text not null default 'shippo' check (label_provider in ('shippo', 'sendcloud')),
  add column sendcloud_parcel_id text unique,
  add column sendcloud_shipment_id text unique,
  add column label_purchase_fallback_from text check (label_purchase_fallback_from in ('sendcloud'));
