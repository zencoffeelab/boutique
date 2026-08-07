create table commerce_document_counters (
  period text primary key check (period ~ '^[0-9]{6}$'),
  last_value integer not null check (last_value > 0),
  updated_at timestamptz not null default now()
);

alter table commerce_document_counters enable row level security;
revoke all on commerce_document_counters from public, anon, authenticated;

create or replace function create_checkout_order(
  p_cart_id uuid, p_quote_id uuid, p_audience audience_type, p_locale locale_code,
  p_address jsonb, p_lines jsonb, p_shipping_rate jsonb, p_reservation_minutes integer default 30, p_profile_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_order_number text := 'ZCL-TMP-' || upper(replace(v_order_id::text, '-', ''));
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

create or replace function finalize_paid_order(p_order_id uuid, p_payment_intent_id text, p_provider_event_id text, p_paid_at timestamptz) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_res stock_reservations%rowtype;
  v_issued_at timestamptz;
  v_period text;
  v_document_number integer;
  v_document_suffix text;
  v_order_number text;
  v_invoice text;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status <> 'pending_payment' then
    return jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number, 'email', v_order.email, 'locale', v_order.locale, 'duplicate', true);
  end if;

  for v_res in select * from stock_reservations where order_id = p_order_id and status = 'active' for update loop
    update product_variants set stock_on_hand = stock_on_hand - v_res.quantity, stock_reserved = stock_reserved - v_res.quantity, updated_at = now() where id = v_res.variant_id and stock_on_hand >= v_res.quantity and stock_reserved >= v_res.quantity;
    if not found then raise exception 'Reserved stock invariant failed'; end if;
    update stock_reservations set status = 'finalized' where id = v_res.id;
    insert into stock_movements (variant_id, order_id, quantity_delta, reason) values (v_res.variant_id, p_order_id, -v_res.quantity, 'sale');
  end loop;

  v_issued_at := clock_timestamp();
  v_period := to_char(v_issued_at at time zone 'Europe/Paris', 'YYYYMM');
  insert into commerce_document_counters (period, last_value, updated_at)
  values (v_period, 1, v_issued_at)
  on conflict (period) do update
    set last_value = commerce_document_counters.last_value + 1,
        updated_at = excluded.updated_at
  returning last_value into v_document_number;

  v_document_suffix := v_period || '-' || lpad(v_document_number::text, 6, '0');
  v_order_number := 'ZCL-' || v_document_suffix;
  v_invoice := 'ZCL-F-' || v_document_suffix;

  update orders set order_number = v_order_number, status = 'paid', paid_at = p_paid_at, updated_at = v_issued_at where id = p_order_id returning * into v_order;
  update payments set provider_payment_intent_id = p_payment_intent_id, status = 'paid', paid_at = p_paid_at, updated_at = v_issued_at where order_id = p_order_id;
  insert into invoices (order_id, invoice_number, issued_at, total_cents, immutable_snapshot) values (p_order_id, v_invoice, v_issued_at, v_order.total_cents, to_jsonb(v_order));
  return jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number, 'email', v_order.email, 'locale', v_order.locale, 'invoice_number', v_invoice);
end $$;

revoke execute on function create_checkout_order from public, anon, authenticated;
revoke execute on function finalize_paid_order from public, anon, authenticated;
