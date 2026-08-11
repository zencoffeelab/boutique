create or replace function release_order_reservation(p_order_id uuid, p_reason text) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_res record;
begin
  for v_res in select * from stock_reservations where order_id = p_order_id and status = 'active' for update loop
    update product_variants set stock_reserved = greatest(0, stock_reserved - v_res.quantity), updated_at = now() where id = v_res.variant_id;
    update stock_reservations set status = case when expires_at <= now() then 'expired'::reservation_status else 'released'::reservation_status end where id = v_res.id;
  end loop;
  return true;
end $$;

revoke execute on function release_order_reservation from public, anon, authenticated;

update orders
set status = 'pending_payment', canceled_at = null, updated_at = now()
where status = 'canceled'
  and paid_at is null
  and notes ilike '%reservation_expired%';
