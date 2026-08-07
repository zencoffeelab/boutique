create or replace function admin_update_product_variants(p_actor_id uuid, p_updates jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_update jsonb;
  v_variant product_variants%rowtype;
  v_stock_on_hand integer;
  v_low_stock_threshold integer;
  v_internal_cost_cents integer;
  v_pro_price_cents integer;
  v_stock_delta integer;
begin
  for v_update in select value from jsonb_array_elements(p_updates) loop
    select * into v_variant
    from product_variants
    where id = (v_update->>'variantId')::uuid
    for update;

    if not found then
      raise exception 'Variante introuvable.';
    end if;

    v_stock_on_hand := (v_update->>'stockOnHand')::integer;
    v_low_stock_threshold := (v_update->>'lowStockThreshold')::integer;
    v_internal_cost_cents := (v_update->>'internalCostCents')::integer;
    v_pro_price_cents := (v_update->>'proPriceCents')::integer;

    if v_stock_on_hand < v_variant.stock_reserved then
      raise exception 'Le stock total ne peut pas être inférieur aux % unité(s) actuellement réservée(s).', v_variant.stock_reserved;
    end if;

    update product_variants
    set stock_on_hand = v_stock_on_hand,
        low_stock_threshold = v_low_stock_threshold,
        internal_cost_cents = v_internal_cost_cents,
        updated_at = now()
    where id = v_variant.id;

    insert into variant_offers (variant_id, audience, price_cents, minimum_quantity, active)
    values (v_variant.id, 'professional'::audience_type, v_pro_price_cents, 1, false)
    on conflict (variant_id, audience) do update
      set price_cents = excluded.price_cents;

    v_stock_delta := v_stock_on_hand - v_variant.stock_on_hand;
    if v_stock_delta <> 0 then
      insert into stock_movements (variant_id, quantity_delta, reason, actor_id)
      values (v_variant.id, v_stock_delta, 'Ajustement global depuis le catalogue', p_actor_id);
    end if;

    insert into audit_log (actor_id, action, entity_type, entity_id, before_data, after_data)
    values (p_actor_id, 'variant.updated', 'product_variant', v_variant.id::text, to_jsonb(v_variant), v_update);
  end loop;
end;
$$;

revoke all on function admin_update_product_variants(uuid, jsonb) from public, anon, authenticated;
grant execute on function admin_update_product_variants(uuid, jsonb) to service_role;
notify pgrst, 'reload schema';
