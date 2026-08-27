alter table orders add column if not exists archived_at timestamptz;
alter table orders add column if not exists archived_snapshot jsonb;

create index if not exists orders_archived_at_idx on orders (archived_at, created_at desc);

create or replace function archive_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_snapshot jsonb;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status = 'pending_payment' then raise exception 'Only validated orders can be archived'; end if;
  if v_order.archived_at is not null then return true; end if;

  v_snapshot := jsonb_build_object(
    'order_number', v_order.order_number,
    'email', v_order.email,
    'locale', v_order.locale,
    'audience', v_order.audience,
    'shipping_address', v_order.shipping_address,
    'billing_address', v_order.billing_address,
    'shipping_carrier', v_order.shipping_carrier,
    'shipping_service', v_order.shipping_service,
    'subtotal_cents', v_order.subtotal_cents,
    'shipping_charged_cents', v_order.shipping_charged_cents,
    'total_cents', v_order.total_cents,
    'status', v_order.status,
    'paid_at', v_order.paid_at,
    'created_at', v_order.created_at,
    'lines', coalesce((select jsonb_agg(jsonb_build_object('product_name', product_name, 'variant_label', variant_label, 'quantity', quantity, 'unit_price_cents', unit_price_cents, 'line_total_cents', line_total_cents) order by created_at) from order_lines where order_id = p_order_id), '[]'::jsonb)
  );

  update orders set archived_at = now(), archived_snapshot = v_snapshot, updated_at = now() where id = p_order_id;
  delete from tracking_events where shipment_id in (select id from shipments where order_id = p_order_id);
  delete from shipments where order_id = p_order_id;
  delete from stock_reservations where order_id = p_order_id;
  return true;
end;
$$;

revoke execute on function archive_order(uuid) from public, anon, authenticated;
grant execute on function archive_order(uuid) to service_role;
