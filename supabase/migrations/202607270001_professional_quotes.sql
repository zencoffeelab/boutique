create sequence if not exists professional_quote_number_seq start 1001;

alter table products
  add column if not exists professional_enabled boolean not null default false,
  add column if not exists professional_stock_kg numeric(10,2) not null default 0 check (professional_stock_kg >= 0),
  add column if not exists professional_stock_reserved_kg numeric(10,2) not null default 0 check (professional_stock_reserved_kg >= 0 and professional_stock_reserved_kg <= professional_stock_kg);

alter table profiles add column if not exists stripe_customer_id text unique;

update products as product
set
  professional_enabled = exists (
    select 1
    from product_variants as variant
    join variant_offers as offer on offer.variant_id = variant.id
    where variant.product_id = product.id
      and offer.audience = 'professional'
      and offer.active = true
  ),
  professional_stock_kg = coalesce((
    select round(sum(greatest(variant.stock_on_hand - variant.stock_reserved, 0) * variant.weight_grams)::numeric / 1000, 2)
    from product_variants as variant
    join variant_offers as offer on offer.variant_id = variant.id
    where variant.product_id = product.id
      and offer.audience = 'professional'
      and offer.active = true
  ), 0)
where professional_enabled = false;

create table professional_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null unique default ('ZCL-D-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('professional_quote_number_seq')::text, 6, '0')),
  profile_id uuid not null references profiles(id) on delete cascade,
  email citext not null,
  locale locale_code not null,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'bank_transfer_pending', 'paid', 'expired', 'canceled')),
  currency char(3) not null default 'EUR' check (currency = 'EUR'),
  total_weight_kg numeric(10,2) not null check (total_weight_kg >= 0),
  subtotal_before_discount_cents integer not null check (subtotal_before_discount_cents >= 0),
  discount_cents integer not null check (discount_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  storage_path text,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  valid_until timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table professional_quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references professional_quotes(id) on delete cascade,
  product_id uuid not null references products(id),
  variant_id uuid not null references product_variants(id),
  product_slug text not null,
  product_name text not null,
  variant_label text not null,
  kilograms integer not null check (kilograms > 0),
  base_price_cents_per_kg integer not null check (base_price_cents_per_kg > 0),
  discount_percent integer not null check (discount_percent in (0, 10, 20, 30)),
  discounted_price_cents_per_kg integer not null check (discounted_price_cents_per_kg > 0),
  line_subtotal_cents integer not null check (line_subtotal_cents > 0),
  line_discount_cents integer not null check (line_discount_cents >= 0),
  line_total_cents integer not null check (line_total_cents > 0),
  created_at timestamptz not null default now(),
  unique (quote_id, product_id)
);

create index professional_quotes_profile_created_idx on professional_quotes (profile_id, created_at desc);
create index professional_quotes_expiry_idx on professional_quotes (valid_until) where status in ('pending_payment', 'bank_transfer_pending');

create or replace function create_professional_quote(
  p_profile_id uuid,
  p_email citext,
  p_locale locale_code,
  p_lines jsonb,
  p_valid_days integer default 30
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote_id uuid := gen_random_uuid();
  v_quote_number text := 'ZCL-D-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('professional_quote_number_seq')::text, 6, '0');
  v_line jsonb;
  v_product products%rowtype;
  v_variant product_variants%rowtype;
  v_offer variant_offers%rowtype;
  v_translation product_translations%rowtype;
  v_kilograms integer;
  v_base_price integer;
  v_discount_percent integer;
  v_discounted_price integer;
  v_line_subtotal integer;
  v_line_total integer;
  v_total_weight numeric(10,2) := 0;
  v_subtotal integer := 0;
  v_discount integer := 0;
  v_total integer := 0;
begin
  if p_valid_days < 1 or p_valid_days > 90 then raise exception 'Invalid quote validity'; end if;
  if jsonb_array_length(p_lines) < 1 or jsonb_array_length(p_lines) > 50 then raise exception 'Invalid quote lines'; end if;
  if not exists (select 1 from profiles where id = p_profile_id and professional_status = 'approved') then raise exception 'Approved professional account required'; end if;

  insert into professional_quotes (
    id, quote_number, profile_id, email, locale, total_weight_kg,
    subtotal_before_discount_cents, discount_cents, total_cents, valid_until
  ) values (
    v_quote_id, v_quote_number, p_profile_id, p_email, p_locale, 0,
    0, 0, 0, now() + make_interval(days => p_valid_days)
  );

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_kilograms := (v_line->>'kilograms')::integer;
    if v_kilograms < 1 then raise exception 'Invalid quantity'; end if;

    select * into v_product from products where id = (v_line->>'productId')::uuid for update;
    if not found or v_product.status <> 'published' or not v_product.professional_enabled then raise exception 'Professional coffee unavailable'; end if;
    if v_product.professional_stock_kg - v_product.professional_stock_reserved_kg < v_kilograms then raise exception 'Insufficient professional stock for %', v_product.slug; end if;

    select * into v_variant from product_variants where id = (v_line->>'variantId')::uuid and product_id = v_product.id;
    if not found then raise exception 'Professional variant unavailable'; end if;
    select * into v_offer from variant_offers where variant_id = v_variant.id and audience = 'professional' and active = true;
    if not found or v_offer.price_cents <= 0 then raise exception 'Professional price unavailable'; end if;
    select * into v_translation from product_translations where product_id = v_product.id and locale = p_locale;
    if not found then raise exception 'Product translation unavailable'; end if;

    v_base_price := round(v_offer.price_cents::numeric * 1000 / v_variant.weight_grams);
    v_discount_percent := least(30, floor(v_kilograms::numeric / 10)::integer * 10);
    v_discounted_price := round(v_base_price::numeric * (100 - v_discount_percent) / 100);
    v_line_subtotal := v_base_price * v_kilograms;
    v_line_total := v_discounted_price * v_kilograms;

    update products set professional_stock_reserved_kg = professional_stock_reserved_kg + v_kilograms, updated_at = now() where id = v_product.id;
    insert into professional_quote_lines (
      quote_id, product_id, variant_id, product_slug, product_name, variant_label, kilograms,
      base_price_cents_per_kg, discount_percent, discounted_price_cents_per_kg,
      line_subtotal_cents, line_discount_cents, line_total_cents
    ) values (
      v_quote_id, v_product.id, v_variant.id, v_product.slug, v_translation.name, v_variant.label, v_kilograms,
      v_base_price, v_discount_percent, v_discounted_price,
      v_line_subtotal, v_line_subtotal - v_line_total, v_line_total
    );

    v_total_weight := v_total_weight + v_kilograms;
    v_subtotal := v_subtotal + v_line_subtotal;
    v_discount := v_discount + v_line_subtotal - v_line_total;
    v_total := v_total + v_line_total;
  end loop;

  update professional_quotes
  set total_weight_kg = v_total_weight, subtotal_before_discount_cents = v_subtotal,
      discount_cents = v_discount, total_cents = v_total, updated_at = now()
  where id = v_quote_id;

  return jsonb_build_object('id', v_quote_id, 'quote_number', v_quote_number, 'total_cents', v_total);
exception when others then
  raise;
end
$$;

create or replace function release_professional_quote(p_quote_id uuid, p_status text default 'canceled')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_line record;
begin
  if p_status not in ('expired', 'canceled') then raise exception 'Invalid release status'; end if;
  if not exists (select 1 from professional_quotes where id = p_quote_id and status in ('pending_payment', 'bank_transfer_pending') for update) then return false; end if;
  for v_line in select product_id, kilograms from professional_quote_lines where quote_id = p_quote_id loop
    update products set professional_stock_reserved_kg = greatest(0, professional_stock_reserved_kg - v_line.kilograms), updated_at = now() where id = v_line.product_id;
  end loop;
  update professional_quotes set status = p_status, updated_at = now() where id = p_quote_id;
  return true;
end
$$;

create or replace function finalize_paid_professional_quote(
  p_quote_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_paid_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_quote professional_quotes%rowtype; v_line record;
begin
  select * into v_quote from professional_quotes where id = p_quote_id for update;
  if not found then raise exception 'Professional quote not found'; end if;
  if v_quote.status = 'paid' then return to_jsonb(v_quote) || jsonb_build_object('duplicate', true); end if;
  if v_quote.status not in ('pending_payment', 'bank_transfer_pending') then raise exception 'Professional quote is no longer payable'; end if;
  for v_line in select product_id, kilograms from professional_quote_lines where quote_id = p_quote_id loop
    update products
    set professional_stock_kg = professional_stock_kg - v_line.kilograms,
        professional_stock_reserved_kg = professional_stock_reserved_kg - v_line.kilograms,
        updated_at = now()
    where id = v_line.product_id
      and professional_stock_kg >= v_line.kilograms
      and professional_stock_reserved_kg >= v_line.kilograms;
    if not found then raise exception 'Professional stock invariant failed'; end if;
  end loop;
  update professional_quotes
  set status = 'paid', stripe_checkout_session_id = p_checkout_session_id,
      stripe_payment_intent_id = nullif(p_payment_intent_id, ''), paid_at = p_paid_at, updated_at = now()
  where id = p_quote_id
  returning * into v_quote;
  return to_jsonb(v_quote);
end
$$;

create or replace function release_expired_professional_quotes() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_quote_id uuid; v_count integer := 0;
begin
  for v_quote_id in select id from professional_quotes where status in ('pending_payment', 'bank_transfer_pending') and valid_until <= now() loop
    if release_professional_quote(v_quote_id, 'expired') then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end
$$;

alter table professional_quotes enable row level security;
alter table professional_quote_lines enable row level security;
create policy "professional quote owner read" on professional_quotes for select using (profile_id = auth.uid());
create policy "professional quote line owner read" on professional_quote_lines for select using (
  exists (select 1 from professional_quotes where professional_quotes.id = professional_quote_lines.quote_id and professional_quotes.profile_id = auth.uid())
);
grant select on professional_quotes, professional_quote_lines to authenticated;

revoke execute on function create_professional_quote from public, anon, authenticated;
revoke execute on function release_professional_quote from public, anon, authenticated;
revoke execute on function finalize_paid_professional_quote from public, anon, authenticated;
revoke execute on function release_expired_professional_quotes from public, anon, authenticated;
grant execute on function create_professional_quote to service_role;
grant execute on function release_professional_quote to service_role;
grant execute on function finalize_paid_professional_quote to service_role;
grant execute on function release_expired_professional_quotes to service_role;

insert into storage.buckets (id, name, public) values ('professional-quotes', 'professional-quotes', false) on conflict (id) do nothing;
