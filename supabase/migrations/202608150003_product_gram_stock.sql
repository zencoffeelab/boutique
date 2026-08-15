alter table products
  add column if not exists stock_on_hand_grams integer not null default 0 check (stock_on_hand_grams >= 0),
  add column if not exists stock_reserved_grams integer not null default 0 check (stock_reserved_grams >= 0),
  add column if not exists low_stock_threshold_grams integer not null default 0 check (low_stock_threshold_grams >= 0);

alter table stock_reservations add column if not exists weight_grams integer;

update products p
set stock_on_hand_grams = coalesce((select sum(v.stock_on_hand * v.weight_grams) from product_variants v where v.product_id = p.id), 0),
    stock_reserved_grams = coalesce((select sum(v.stock_reserved * v.weight_grams) from product_variants v where v.product_id = p.id), 0),
    low_stock_threshold_grams = coalesce((select sum(v.low_stock_threshold * v.weight_grams) from product_variants v where v.product_id = p.id), 0)
where stock_on_hand_grams = 0 and stock_reserved_grams = 0 and low_stock_threshold_grams = 0;

update stock_reservations r
set weight_grams = v.weight_grams
from product_variants v
where r.variant_id = v.id and r.weight_grams is null;

alter table stock_reservations alter column weight_grams set not null;
alter table stock_reservations add constraint stock_reservations_weight_positive check (weight_grams > 0);
alter table products add constraint products_reserved_grams_within_stock check (stock_reserved_grams <= stock_on_hand_grams);

create or replace function create_checkout_order(
  p_cart_id uuid, p_quote_id uuid, p_audience audience_type, p_locale locale_code,
  p_address jsonb, p_lines jsonb, p_shipping_rate jsonb, p_reservation_minutes integer default 30, p_profile_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid := gen_random_uuid(); v_order_number text := 'ZCL-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('order_number_seq')::text, 6, '0');
  v_line jsonb; v_variant product_variants%rowtype; v_stock products%rowtype; v_subtotal integer := 0; v_cost integer := 0; v_quantity integer; v_product_id uuid; v_weight integer;
begin
  if p_reservation_minutes < 1 or p_reservation_minutes > 60 then raise exception 'Invalid reservation duration'; end if;
  if not exists (select 1 from shipping_quotes where id = p_quote_id and cart_id = p_cart_id and expires_at > now()) then raise exception 'Shipping quote expired'; end if;
  insert into orders (id, order_number, profile_id, email, locale, audience, shipping_address, shipping_quote_id, shipping_rate_id, shipping_carrier, shipping_service, subtotal_cents, shipping_charged_cents, total_cents, cost_of_goods_cents)
  values (v_order_id, v_order_number, p_profile_id, p_address->>'email', p_locale, p_audience, p_address, p_quote_id, p_shipping_rate->>'id', p_shipping_rate->>'carrier', p_shipping_rate->>'service', 0, (p_shipping_rate->>'amountCents')::integer, (p_shipping_rate->>'amountCents')::integer, 0);
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_quantity := (v_line->>'quantity')::integer;
    select * into v_variant from product_variants where id = (v_line->>'variantId')::uuid for update;
    select * into v_stock from products where id = v_variant.product_id for update;
    v_weight := v_variant.weight_grams;
    if not found or v_quantity <= 0 or v_quantity * v_weight > v_stock.stock_on_hand_grams - v_stock.stock_reserved_grams then raise exception 'Insufficient stock for variant %', v_line->>'variantId'; end if;
    update products set stock_reserved_grams = stock_reserved_grams + v_quantity * v_weight, updated_at = now() where id = v_stock.id;
    insert into stock_reservations (order_id, variant_id, quantity, weight_grams, expires_at) values (v_order_id, v_variant.id, v_quantity, v_weight, now() + make_interval(mins => p_reservation_minutes));
    insert into order_lines (order_id, product_id, variant_id, product_slug, product_name, sku, variant_label, quantity, unit_weight_grams, unit_price_cents, unit_cost_cents, line_total_cents)
    values (v_order_id, v_variant.product_id, v_variant.id, v_line->>'productSlug', v_line->>'productName', v_variant.sku, v_line->>'variantLabel', v_quantity, v_weight, (v_line->>'unitPriceCents')::integer, v_variant.internal_cost_cents, (v_line->>'unitPriceCents')::integer * v_quantity);
    v_subtotal := v_subtotal + (v_line->>'unitPriceCents')::integer * v_quantity; v_cost := v_cost + v_variant.internal_cost_cents * v_quantity;
  end loop;
  update orders set subtotal_cents = v_subtotal, total_cents = v_subtotal + shipping_charged_cents, cost_of_goods_cents = v_cost where id = v_order_id;
  return jsonb_build_object('id', v_order_id, 'order_number', v_order_number);
end $$;

create or replace function release_order_reservation(p_order_id uuid, p_reason text) returns boolean language plpgsql security definer set search_path = public as $$
declare v_res record;
begin
  for v_res in select r.*, v.product_id from stock_reservations r join product_variants v on v.id = r.variant_id where r.order_id = p_order_id and r.status = 'active' for update of r loop
    update products set stock_reserved_grams = greatest(0, stock_reserved_grams - v_res.quantity * v_res.weight_grams), updated_at = now() where id = v_res.product_id;
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
  for v_res in select r.*, v.product_id from stock_reservations r join product_variants v on v.id = r.variant_id where r.order_id = p_order_id and r.status = 'active' for update of r loop
    update products set stock_on_hand_grams = stock_on_hand_grams - v_res.quantity * v_res.weight_grams, stock_reserved_grams = stock_reserved_grams - v_res.quantity * v_res.weight_grams, updated_at = now() where id = v_res.product_id and stock_on_hand_grams >= v_res.quantity * v_res.weight_grams and stock_reserved_grams >= v_res.quantity * v_res.weight_grams;
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

create or replace function restore_order_stock_on_terminal_status() returns trigger language plpgsql security definer set search_path = public as $$
declare v_res record;
begin
  if new.status not in ('canceled', 'refunded') or old.status in ('canceled', 'refunded') then return new; end if;
  for v_res in select r.*, v.product_id from stock_reservations r join product_variants v on v.id = r.variant_id where r.order_id = new.id and r.status in ('active', 'finalized') for update of r loop
    if v_res.status = 'active' then
      update products set stock_reserved_grams = greatest(0, stock_reserved_grams - v_res.quantity * v_res.weight_grams), updated_at = now() where id = v_res.product_id;
      update stock_reservations set status = 'released' where id = v_res.id;
    elsif not exists (select 1 from stock_movements where order_id = new.id and variant_id = v_res.variant_id and reason = 'order_stock_restored') then
      update products set stock_on_hand_grams = stock_on_hand_grams + v_res.quantity * v_res.weight_grams, updated_at = now() where id = v_res.product_id;
      insert into stock_movements (variant_id, order_id, quantity_delta, reason) values (v_res.variant_id, new.id, v_res.quantity, 'order_stock_restored');
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists restore_order_stock_on_terminal_status_trigger on orders;
create trigger restore_order_stock_on_terminal_status_trigger after update of status on orders for each row when (new.status in ('canceled', 'refunded') and old.status not in ('canceled', 'refunded')) execute function restore_order_stock_on_terminal_status();

revoke execute on function create_checkout_order from public, anon, authenticated;
revoke execute on function release_order_reservation from public, anon, authenticated;
revoke execute on function finalize_paid_order from public, anon, authenticated;
revoke execute on function restore_order_stock_on_terminal_status() from public, anon, authenticated;
