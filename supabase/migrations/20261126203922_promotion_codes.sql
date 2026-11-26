create table if not exists promotion_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,40}$'),
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value integer not null check (discount_value > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table promotion_codes enable row level security;
revoke all on promotion_codes from anon, authenticated;
alter table orders add column if not exists promotion_code text;
alter table orders add column if not exists promotion_discount_cents integer not null default 0 check (promotion_discount_cents >= 0);
