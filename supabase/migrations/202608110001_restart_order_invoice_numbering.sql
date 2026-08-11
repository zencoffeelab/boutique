create table commerce_document_year_counters (
  period text primary key check (period ~ '^[0-9]{4}$'),
  last_value integer not null check (last_value > 0),
  updated_at timestamptz not null default now()
);

alter table commerce_document_year_counters enable row level security;
revoke all on commerce_document_year_counters from public, anon, authenticated;

create or replace function finalize_paid_order(p_order_id uuid, p_payment_intent_id text, p_provider_event_id text, p_paid_at timestamptz) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype;
  v_res stock_reservations%rowtype;
  v_issued_at timestamptz;
  v_period text;
  v_document_number integer;
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
  v_period := to_char(v_issued_at at time zone 'Europe/Paris', 'YYYY');
  insert into commerce_document_year_counters (period, last_value, updated_at)
  values (v_period, 1, v_issued_at)
  on conflict (period) do update
    set last_value = commerce_document_year_counters.last_value + 1,
        updated_at = excluded.updated_at
  returning last_value into v_document_number;

  v_order_number := 'ZCL-' || v_period || '-' || lpad(v_document_number::text, 6, '0');
  v_invoice := 'ZCL-F-' || v_period || '-' || lpad(v_document_number::text, 6, '0');

  update orders set order_number = v_order_number, status = 'paid', paid_at = p_paid_at, updated_at = v_issued_at where id = p_order_id returning * into v_order;
  update payments set provider_payment_intent_id = p_payment_intent_id, status = 'paid', paid_at = p_paid_at, updated_at = v_issued_at where order_id = p_order_id;
  insert into invoices (order_id, invoice_number, issued_at, total_cents, immutable_snapshot) values (p_order_id, v_invoice, v_issued_at, v_order.total_cents, to_jsonb(v_order));
  return jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number, 'email', v_order.email, 'locale', v_order.locale, 'invoice_number', v_invoice);
end $$;

revoke execute on function finalize_paid_order from public, anon, authenticated;
