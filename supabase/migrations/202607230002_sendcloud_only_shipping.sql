alter table shipments
  alter column shippo_rate_id drop not null,
  add column sendcloud_shipping_option_code text;

comment on column shipments.shippo_rate_id is
  'Legacy Shippo rate identifier. Null for all new Sendcloud shipments.';
