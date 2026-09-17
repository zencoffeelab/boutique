alter table orders add column if not exists subtotal_before_discount_cents integer not null default 0 check (subtotal_before_discount_cents >= 0);
alter table orders add column if not exists professional_discount_cents integer not null default 0 check (professional_discount_cents >= 0);
alter table orders add column if not exists professional_discount_percent integer not null default 0 check (professional_discount_percent in (0, 10, 15, 20, 25, 30));

create or replace function create_checkout_order(
  p_cart_id uuid, p_quote_id uuid, p_audience audience_type, p_locale locale_code,
  p_address jsonb, p_lines jsonb, p_shipping_rate jsonb, p_reservation_minutes integer default 30, p_profile_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid := gen_random_uuid(); v_order_number text := 'ZCL-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('order_number_seq')::text, 6, '0');
  v_line jsonb; v_variant product_variants%rowtype; v_stock products%rowtype; v_subtotal integer := 0; v_cost integer := 0; v_quantity integer; v_weight integer; v_total_weight integer := 0; v_percent integer := 0; v_discount integer := 0;
begin
  if p_reservation_minutes < 1 or p_reservation_minutes > 60 then raise exception 'Invalid reservation duration'; end if;
  if not exists (select 1 from shipping_quotes where id = p_quote_id and cart_id = p_cart_id and expires_at > now()) then raise exception 'Shipping quote expired'; end if;
  insert into orders (id, order_number, profile_id, email, locale, audience, shipping_address, shipping_quote_id, shipping_rate_id, shipping_carrier, shipping_service, subtotal_cents, shipping_charged_cents, total_cents, cost_of_goods_cents)
  values (v_order_id, v_order_number, p_profile_id, p_address->>'email', p_locale, p_audience, p_address, p_quote_id, p_shipping_rate->>'id', p_shipping_rate->>'carrier', p_shipping_rate->>'service', 0, (p_shipping_rate->>'amountCents')::integer, (p_shipping_rate->>'amountCents')::integer, 0);
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_quantity := (v_line->>'quantity')::integer; select * into v_variant from product_variants where id = (v_line->>'variantId')::uuid for update; select * into v_stock from products where id = v_variant.product_id for update; v_weight := v_variant.weight_grams;
    if not found or v_quantity <= 0 or v_quantity * v_weight > v_stock.stock_on_hand_grams - v_stock.stock_reserved_grams then raise exception 'Insufficient stock'; end if;
    update products set stock_reserved_grams = stock_reserved_grams + v_quantity * v_weight, updated_at = now() where id = v_stock.id;
    insert into stock_reservations (order_id, variant_id, quantity, weight_grams, expires_at) values (v_order_id, v_variant.id, v_quantity, v_weight, now() + make_interval(mins => p_reservation_minutes));
    insert into order_lines (order_id, product_id, variant_id, product_slug, product_name, sku, variant_label, quantity, unit_weight_grams, unit_price_cents, unit_cost_cents, line_total_cents) values (v_order_id, v_variant.product_id, v_variant.id, v_line->>'productSlug', v_line->>'productName', v_variant.sku, v_line->>'variantLabel', v_quantity, v_weight, (v_line->>'unitPriceCents')::integer, v_variant.internal_cost_cents, (v_line->>'unitPriceCents')::integer * v_quantity);
    v_subtotal := v_subtotal + (v_line->>'unitPriceCents')::integer * v_quantity; v_cost := v_cost + v_variant.internal_cost_cents * v_quantity; v_total_weight := v_total_weight + v_quantity * v_weight;
  end loop;
  if p_audience = 'professional' then v_percent := case when v_total_weight >= 60000 then 30 when v_total_weight >= 30000 then 25 when v_total_weight >= 15000 then 20 when v_total_weight >= 5000 then 15 when v_total_weight >= 1000 then 10 else 0 end; end if;
  v_discount := round(v_subtotal * v_percent / 100.0);
  update orders set subtotal_before_discount_cents = v_subtotal, professional_discount_cents = v_discount, professional_discount_percent = v_percent, subtotal_cents = v_subtotal - v_discount, total_cents = v_subtotal - v_discount + shipping_charged_cents, cost_of_goods_cents = v_cost where id = v_order_id;
  return jsonb_build_object('id', v_order_id, 'order_number', v_order_number, 'professional_discount_cents', v_discount);
end $$;
