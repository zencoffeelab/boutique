create or replace function restore_order_stock_on_terminal_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation stock_reservations%rowtype;
begin
  if new.status not in ('canceled', 'refunded')
    or old.status in ('canceled', 'refunded') then
    return new;
  end if;

  for v_reservation in
    select *
    from stock_reservations
    where order_id = new.id
      and status in ('active', 'finalized')
    for update
  loop
    if v_reservation.status = 'active' then
      update product_variants
      set stock_reserved = greatest(0, stock_reserved - v_reservation.quantity),
          updated_at = now()
      where id = v_reservation.variant_id;

      update stock_reservations
      set status = 'released'
      where id = v_reservation.id;
    elsif not exists (
      select 1
      from stock_movements
      where order_id = new.id
        and variant_id = v_reservation.variant_id
        and reason = 'order_stock_restored'
    ) then
      update product_variants
      set stock_on_hand = stock_on_hand + v_reservation.quantity,
          updated_at = now()
      where id = v_reservation.variant_id;

      insert into stock_movements (variant_id, order_id, quantity_delta, reason)
      values (v_reservation.variant_id, new.id, v_reservation.quantity, 'order_stock_restored');
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists restore_order_stock_on_terminal_status_trigger on orders;
create trigger restore_order_stock_on_terminal_status_trigger
after update of status on orders
for each row
when (new.status in ('canceled', 'refunded') and old.status not in ('canceled', 'refunded'))
execute function restore_order_stock_on_terminal_status();

revoke execute on function restore_order_stock_on_terminal_status() from public, anon, authenticated;
