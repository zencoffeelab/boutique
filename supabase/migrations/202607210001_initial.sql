create extension if not exists pgcrypto;
create extension if not exists citext;

create type locale_code as enum ('fr-FR', 'en-GB');
create type audience_type as enum ('retail', 'professional');
create type product_status as enum ('draft', 'published', 'archived');
create type professional_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type order_status as enum ('pending_payment', 'paid', 'preparing', 'ready_to_ship', 'shipped', 'delivered', 'canceled', 'partially_refunded', 'refunded');
create type reservation_status as enum ('active', 'finalized', 'released', 'expired');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  professional_status professional_status,
  first_name text, last_name text, phone text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create or replace function handle_new_auth_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, first_name, last_name) values (new.id, new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name') on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_auth_user();
create table addresses (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references profiles(id) on delete cascade,
  label text, company text, first_name text not null, last_name text not null, line1 text not null, line2 text,
  postal_code text not null, city text not null, country_code char(2) not null, phone text,
  created_at timestamptz not null default now()
);
create table professional_applications (
  id uuid primary key default gen_random_uuid(), company_name text not null, first_name text not null, last_name text not null,
  email citext not null unique, phone text not null, business_type text not null, monthly_volume text not null,
  locale locale_code not null, status professional_status not null default 'pending', decision_note text,
  decided_by uuid references profiles(id), decided_at timestamptz, invited_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(), slug text not null unique, status product_status not null default 'draft',
  altitude_meters integer not null default 0 check (altitude_meters >= 0), featured boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table product_translations (
  product_id uuid not null references products(id) on delete cascade, locale locale_code not null,
  name text not null, short_description text not null, body text not null, producer text not null, region text not null,
  variety text not null, process text not null, tasting_notes text[] not null default '{}', seo_title text not null, seo_description text not null,
  primary key (product_id, locale)
);
create table product_media (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references products(id) on delete cascade,
  storage_path text, public_url text not null, alt_fr text not null, alt_en text not null,
  width integer not null check (width > 0), height integer not null check (height > 0), position integer not null default 0
);
create table product_variants (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references products(id) on delete cascade,
  sku text not null unique, label text not null, weight_grams integer not null check (weight_grams > 0),
  internal_cost_cents integer not null check (internal_cost_cents >= 0), stock_on_hand integer not null default 0 check (stock_on_hand >= 0),
  stock_reserved integer not null default 0 check (stock_reserved >= 0 and stock_reserved <= stock_on_hand),
  low_stock_threshold integer not null default 0 check (low_stock_threshold >= 0), hs_code text not null default '090121',
  customs_origin_country char(2) not null default 'FR', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table variant_offers (
  id uuid primary key default gen_random_uuid(), variant_id uuid not null references product_variants(id) on delete cascade,
  audience audience_type not null, price_cents integer not null check (price_cents >= 0), minimum_quantity integer not null default 1 check (minimum_quantity > 0),
  active boolean not null default true, unique (variant_id, audience)
);
create table packaging_presets (
  id uuid primary key default gen_random_uuid(), name text not null, max_net_weight_grams integer not null check (max_net_weight_grams > 0),
  tare_weight_grams integer not null check (tare_weight_grams >= 0), length_cm numeric(8,2) not null,
  width_cm numeric(8,2) not null, height_cm numeric(8,2) not null, active boolean not null default true
);

create table content_pages (
  id uuid primary key default gen_random_uuid(), page_key text not null unique, status product_status not null default 'draft', updated_at timestamptz not null default now()
);
create table content_page_translations (
  page_id uuid not null references content_pages(id) on delete cascade, locale locale_code not null,
  title text not null, seo_title text not null, seo_description text not null, blocks jsonb not null default '[]',
  primary key (page_id, locale)
);
create table advice_articles (
  id uuid primary key default gen_random_uuid(), slug text not null unique, status product_status not null default 'draft', published_at timestamptz, created_at timestamptz not null default now()
);
create table advice_translations (
  article_id uuid not null references advice_articles(id) on delete cascade, locale locale_code not null,
  title text not null, excerpt text not null, blocks jsonb not null default '[]', seo_title text not null, seo_description text not null,
  primary key (article_id, locale)
);
create table faq_items (
  id uuid primary key default gen_random_uuid(), position integer not null default 0, active boolean not null default true,
  question_fr text not null, answer_fr text not null, question_en text not null, answer_en text not null
);

create table shipping_quotes (
  id uuid primary key, cart_id uuid not null, locale locale_code not null, audience audience_type not null,
  address jsonb not null, lines jsonb not null, parcels jsonb not null, rates jsonb not null,
  subtotal_cents integer not null check (subtotal_cents >= 0), expires_at timestamptz not null, created_at timestamptz not null default now()
);
create index shipping_quotes_cart_created_idx on shipping_quotes (cart_id, created_at desc);

create sequence order_number_seq start 1001;
create sequence invoice_number_seq start 1001;
create sequence credit_note_number_seq start 1001;
create table orders (
  id uuid primary key default gen_random_uuid(), order_number text not null unique, profile_id uuid references profiles(id),
  email citext not null, locale locale_code not null, audience audience_type not null, status order_status not null default 'pending_payment',
  shipping_address jsonb not null, billing_address jsonb, shipping_quote_id uuid references shipping_quotes(id), shipping_rate_id text not null,
  shipping_carrier text not null, shipping_service text not null, subtotal_cents integer not null check (subtotal_cents >= 0),
  shipping_charged_cents integer not null check (shipping_charged_cents >= 0), total_cents integer not null check (total_cents >= 0),
  cost_of_goods_cents integer not null default 0, actual_shipping_cost_cents integer not null default 0,
  stripe_fee_cents integer not null default 0, notes text, paid_at timestamptz, canceled_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table order_lines (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null, variant_id uuid not null, product_slug text not null, product_name text not null,
  sku text, variant_label text not null, quantity integer not null check (quantity > 0), unit_weight_grams integer not null,
  unit_price_cents integer not null, unit_cost_cents integer not null, line_total_cents integer not null, created_at timestamptz not null default now()
);
create table stock_reservations (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id) on delete cascade,
  variant_id uuid not null references product_variants(id), quantity integer not null check (quantity > 0),
  status reservation_status not null default 'active', expires_at timestamptz not null, created_at timestamptz not null default now(), unique (order_id, variant_id)
);
create index active_reservation_expiry_idx on stock_reservations (expires_at) where status = 'active';
create table stock_movements (
  id uuid primary key default gen_random_uuid(), variant_id uuid not null references product_variants(id), order_id uuid references orders(id),
  quantity_delta integer not null, reason text not null, actor_id uuid references profiles(id), created_at timestamptz not null default now()
);
create table payments (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id), provider text not null,
  provider_checkout_id text unique, provider_payment_intent_id text unique, status text not null, amount_cents integer not null,
  refunded_cents integer not null default 0, paid_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table invoices (
  id uuid primary key default gen_random_uuid(), order_id uuid not null unique references orders(id), invoice_number text not null unique,
  storage_path text, issued_at timestamptz not null, total_cents integer not null, immutable_snapshot jsonb not null
);
create table credit_notes (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id), credit_note_number text not null unique default ('ZCL-A-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('credit_note_number_seq')::text, 6, '0')),
  provider_refund_id text unique, amount_cents integer not null check (amount_cents > 0), reason text not null, storage_path text, issued_at timestamptz not null default now(), immutable_snapshot jsonb not null
);
create table shipments (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id), parcel_index integer not null,
  shippo_rate_id text not null, shippo_transaction_id text unique, carrier text, service text, label_url text, commercial_invoice_url text,
  tracking_number text, tracking_url text, status text not null default 'PRE_TRANSIT', status_date timestamptz,
  actual_cost_cents integer not null default 0, created_at timestamptz not null default now(), unique (order_id, parcel_index)
);
create table tracking_events (
  id uuid primary key default gen_random_uuid(), shipment_id uuid not null references shipments(id) on delete cascade,
  carrier text not null, tracking_number text not null, status text not null, status_date timestamptz not null, payload jsonb not null,
  unique (carrier, tracking_number, status, status_date)
);
create table notification_outbox (
  id uuid primary key default gen_random_uuid(), kind text not null, recipient citext not null, locale locale_code not null,
  subject text not null, html text not null, payload jsonb not null default '{}', attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(), sent_at timestamptz, provider_id text, last_error text, created_at timestamptz not null default now()
);
create table webhook_events (
  id uuid primary key default gen_random_uuid(), provider text not null, provider_event_id text not null,
  event_type text not null, payload jsonb not null, processed_at timestamptz, processing_error text, created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);
create table audit_log (
  id uuid primary key default gen_random_uuid(), actor_id uuid references profiles(id), action text not null,
  entity_type text not null, entity_id text not null, before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);

create or replace function create_checkout_order(
  p_cart_id uuid, p_quote_id uuid, p_audience audience_type, p_locale locale_code,
  p_address jsonb, p_lines jsonb, p_shipping_rate jsonb, p_reservation_minutes integer default 30, p_profile_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid := gen_random_uuid(); v_order_number text := 'ZCL-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('order_number_seq')::text, 6, '0');
  v_line jsonb; v_variant product_variants%rowtype; v_subtotal integer := 0; v_cost integer := 0; v_quantity integer;
begin
  if p_reservation_minutes < 1 or p_reservation_minutes > 60 then raise exception 'Invalid reservation duration'; end if;
  if not exists (select 1 from shipping_quotes where id = p_quote_id and cart_id = p_cart_id and expires_at > now()) then raise exception 'Shipping quote expired'; end if;
  insert into orders (id, order_number, profile_id, email, locale, audience, shipping_address, shipping_quote_id, shipping_rate_id, shipping_carrier, shipping_service, subtotal_cents, shipping_charged_cents, total_cents, cost_of_goods_cents)
  values (v_order_id, v_order_number, p_profile_id, p_address->>'email', p_locale, p_audience, p_address, p_quote_id, p_shipping_rate->>'id', p_shipping_rate->>'carrier', p_shipping_rate->>'service', 0, (p_shipping_rate->>'amountCents')::integer, (p_shipping_rate->>'amountCents')::integer, 0);
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_quantity := (v_line->>'quantity')::integer;
    select * into v_variant from product_variants where id = (v_line->>'variantId')::uuid for update;
    if not found or v_quantity <= 0 or v_variant.stock_on_hand - v_variant.stock_reserved < v_quantity then raise exception 'Insufficient stock for variant %', v_line->>'variantId'; end if;
    update product_variants set stock_reserved = stock_reserved + v_quantity, updated_at = now() where id = v_variant.id;
    insert into stock_reservations (order_id, variant_id, quantity, expires_at) values (v_order_id, v_variant.id, v_quantity, now() + make_interval(mins => p_reservation_minutes));
    insert into order_lines (order_id, product_id, variant_id, product_slug, product_name, sku, variant_label, quantity, unit_weight_grams, unit_price_cents, unit_cost_cents, line_total_cents)
    values (v_order_id, (v_line->>'productId')::uuid, v_variant.id, v_line->>'productSlug', v_line->>'productName', v_variant.sku, v_line->>'variantLabel', v_quantity, v_variant.weight_grams, (v_line->>'unitPriceCents')::integer, v_variant.internal_cost_cents, (v_line->>'unitPriceCents')::integer * v_quantity);
    v_subtotal := v_subtotal + (v_line->>'unitPriceCents')::integer * v_quantity; v_cost := v_cost + v_variant.internal_cost_cents * v_quantity;
  end loop;
  update orders set subtotal_cents = v_subtotal, total_cents = v_subtotal + shipping_charged_cents, cost_of_goods_cents = v_cost where id = v_order_id;
  return jsonb_build_object('id', v_order_id, 'order_number', v_order_number);
end $$;

create or replace function release_order_reservation(p_order_id uuid, p_reason text) returns boolean language plpgsql security definer set search_path = public as $$
declare v_res record;
begin
  for v_res in select * from stock_reservations where order_id = p_order_id and status = 'active' for update loop
    update product_variants set stock_reserved = greatest(0, stock_reserved - v_res.quantity), updated_at = now() where id = v_res.variant_id;
    update stock_reservations set status = case when expires_at <= now() then 'expired'::reservation_status else 'released'::reservation_status end where id = v_res.id;
  end loop;
  update orders set status = 'canceled', canceled_at = now(), updated_at = now(), notes = concat_ws(E'\n', notes, p_reason) where id = p_order_id and status = 'pending_payment';
  return true;
end $$;

create or replace function finalize_paid_order(p_order_id uuid, p_payment_intent_id text, p_provider_event_id text, p_paid_at timestamptz) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order orders%rowtype; v_res record; v_invoice text;
begin
  select * into v_order from orders where id = p_order_id for update; if not found then raise exception 'Order not found'; end if;
  if v_order.status <> 'pending_payment' then return jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number, 'email', v_order.email, 'locale', v_order.locale, 'duplicate', true); end if;
  for v_res in select * from stock_reservations where order_id = p_order_id and status = 'active' for update loop
    update product_variants set stock_on_hand = stock_on_hand - v_res.quantity, stock_reserved = stock_reserved - v_res.quantity, updated_at = now() where id = v_res.variant_id and stock_on_hand >= v_res.quantity and stock_reserved >= v_res.quantity;
    if not found then raise exception 'Reserved stock invariant failed'; end if;
    update stock_reservations set status = 'finalized' where id = v_res.id;
    insert into stock_movements (variant_id, order_id, quantity_delta, reason) values (v_res.variant_id, p_order_id, -v_res.quantity, 'sale');
  end loop;
  update orders set status = 'paid', paid_at = p_paid_at, updated_at = now() where id = p_order_id;
  update payments set provider_payment_intent_id = p_payment_intent_id, status = 'paid', paid_at = p_paid_at, updated_at = now() where order_id = p_order_id;
  v_invoice := 'ZCL-F-' || to_char(p_paid_at, 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 6, '0');
  insert into invoices (order_id, invoice_number, issued_at, total_cents, immutable_snapshot) values (p_order_id, v_invoice, p_paid_at, v_order.total_cents, to_jsonb(v_order));
  return jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number, 'email', v_order.email, 'locale', v_order.locale, 'invoice_number', v_invoice);
end $$;

create or replace function release_expired_reservations() returns integer language plpgsql security definer set search_path = public as $$
declare v_order uuid; v_count integer := 0;
begin for v_order in select distinct order_id from stock_reservations where status = 'active' and expires_at <= now() loop perform release_order_reservation(v_order, 'reservation_expired'); v_count := v_count + 1; end loop; return v_count; end $$;

create or replace function apply_stripe_refund(p_payment_intent_id text, p_amount_refunded_cents integer, p_provider_event_id text) returns boolean language plpgsql security definer set search_path = public as $$
declare v_payment payments%rowtype;
begin select * into v_payment from payments where provider_payment_intent_id = p_payment_intent_id for update; if not found then return false; end if;
  update payments set refunded_cents = p_amount_refunded_cents, status = case when p_amount_refunded_cents >= amount_cents then 'refunded' else 'partially_refunded' end, updated_at = now() where id = v_payment.id;
  update orders set status = case when p_amount_refunded_cents >= total_cents then 'refunded'::order_status else 'partially_refunded'::order_status end, updated_at = now() where id = v_payment.order_id; return true; end $$;

create or replace function apply_tracking_update(p_carrier text, p_tracking_number text, p_status text, p_status_date timestamptz, p_payload jsonb) returns boolean language plpgsql security definer set search_path = public as $$
declare v_shipment shipments%rowtype;
begin select * into v_shipment from shipments where tracking_number = p_tracking_number and carrier = p_carrier for update; if not found then return false; end if;
  insert into tracking_events (shipment_id, carrier, tracking_number, status, status_date, payload) values (v_shipment.id, p_carrier, p_tracking_number, p_status, p_status_date, p_payload) on conflict do nothing;
  update shipments set status = p_status, status_date = p_status_date where id = v_shipment.id;
  if upper(p_status) = 'DELIVERED' then update orders set status = 'delivered', updated_at = now() where id = v_shipment.order_id; elsif upper(p_status) = 'TRANSIT' then update orders set status = 'shipped', updated_at = now() where id = v_shipment.order_id and status in ('paid','preparing','ready_to_ship','shipped'); end if; return true; end $$;

create or replace function commerce_dashboard_stats() returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'revenue_cents', coalesce(sum(total_cents) filter (where status not in ('pending_payment','canceled')), 0),
    'orders', count(*),
    'contribution_cents', coalesce(sum(subtotal_cents + shipping_charged_cents - cost_of_goods_cents - actual_shipping_cost_cents - stripe_fee_cents) filter (where status not in ('pending_payment','canceled')), 0)
  ) from orders
$$;

alter table profiles enable row level security; alter table addresses enable row level security; alter table orders enable row level security; alter table invoices enable row level security; alter table shipments enable row level security;
create policy "profile owner read" on profiles for select using (auth.uid() = id);
create policy "address owner" on addresses for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "order owner read" on orders for select using (profile_id = auth.uid());
create policy "invoice owner read" on invoices for select using (exists (select 1 from orders where orders.id = invoices.order_id and orders.profile_id = auth.uid()));
create policy "shipment owner read" on shipments for select using (exists (select 1 from orders where orders.id = shipments.order_id and orders.profile_id = auth.uid()));

revoke all on all tables in schema public from anon;
revoke all on products, product_translations, product_media, product_variants, variant_offers, professional_applications, shipping_quotes, order_lines, stock_reservations, stock_movements, payments, notification_outbox, webhook_events, audit_log from authenticated;
grant select on profiles to authenticated; grant select, insert, update, delete on addresses to authenticated; grant select on orders, invoices, shipments to authenticated;
revoke execute on function create_checkout_order from public, anon, authenticated;
revoke execute on function release_order_reservation from public, anon, authenticated;
revoke execute on function finalize_paid_order from public, anon, authenticated;
revoke execute on function release_expired_reservations from public, anon, authenticated;
revoke execute on function apply_stripe_refund from public, anon, authenticated;
revoke execute on function apply_tracking_update from public, anon, authenticated;
revoke execute on function commerce_dashboard_stats from public, anon, authenticated;

insert into packaging_presets (name, max_net_weight_grams, tare_weight_grams, length_cm, width_cm, height_cm) values
  ('Carton S', 1000, 180, 24, 18, 10), ('Carton M', 5000, 420, 38, 28, 22), ('Carton L', 20000, 900, 58, 38, 38);
insert into storage.buckets (id, name, public) values ('product-media', 'product-media', true), ('invoices', 'invoices', false) on conflict (id) do nothing;
create policy "public product media" on storage.objects for select using (bucket_id = 'product-media');
