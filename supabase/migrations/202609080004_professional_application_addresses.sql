alter table professional_applications
  add column if not exists billing_address jsonb not null default '{}'::jsonb,
  add column if not exists delivery_address jsonb;
