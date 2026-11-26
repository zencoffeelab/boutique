-- The catalogue screen submits every visible coffee at once. Keep the update
-- inside PostgreSQL so a single request updates all stocks and prices.
create or replace function admin_update_catalogue_quickly(
  p_actor_id uuid,
  p_products jsonb,
  p_variants jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_update jsonb;
  v_variant_update jsonb;
  v_product products%rowtype;
  v_variant product_variants%rowtype;
  v_stock_on_hand_grams integer;
  v_low_stock_threshold_grams integer;
  v_internal_cost_cents integer;
begin
  if jsonb_typeof(p_products) <> 'array' or jsonb_typeof(p_variants) <> 'array' then
    raise exception 'Les mises à jour du catalogue sont invalides.';
  end if;

  for v_product_update in select value from jsonb_array_elements(p_products) loop
    select * into v_product
    from products
    where id = (v_product_update->>'productId')::uuid
    for update;
    if not found then
      raise exception 'Produit introuvable.';
    end if;

    v_stock_on_hand_grams := (v_product_update->>'stockOnHandGrams')::integer;
    v_low_stock_threshold_grams := (v_product_update->>'lowStockThresholdGrams')::integer;
    if v_stock_on_hand_grams < 0 or v_low_stock_threshold_grams < 0 then
      raise exception 'Le stock et son seuil doivent être positifs.';
    end if;
    if v_stock_on_hand_grams < v_product.stock_reserved_grams then
      raise exception 'Le stock total ne peut pas être inférieur au stock réservé.';
    end if;

    update products
    set stock_on_hand_grams = v_stock_on_hand_grams,
        low_stock_threshold_grams = v_low_stock_threshold_grams,
        updated_at = now()
    where id = v_product.id;
  end loop;

  for v_variant_update in select value from jsonb_array_elements(p_variants) loop
    select * into v_variant
    from product_variants
    where id = (v_variant_update->>'variantId')::uuid
    for update;
    if not found then
      raise exception 'Variante introuvable.';
    end if;

    v_internal_cost_cents := (v_variant_update->>'internalCostCents')::integer;
    if v_internal_cost_cents < 0 then
      raise exception 'Le prix doit être positif.';
    end if;

    update product_variants
    set internal_cost_cents = v_internal_cost_cents,
        updated_at = now()
    where id = v_variant.id;

    insert into variant_offers (variant_id, audience, price_cents, minimum_quantity, active)
    values (v_variant.id, 'retail'::audience_type, v_internal_cost_cents, 1, true)
    on conflict (variant_id, audience) do update
    set price_cents = excluded.price_cents,
        minimum_quantity = excluded.minimum_quantity,
        active = excluded.active;

    update variant_offers
    set price_cents = v_internal_cost_cents
    where variant_id = v_variant.id
      and audience = 'professional'::audience_type;
  end loop;

  insert into audit_log (actor_id, action, entity_type, entity_id, after_data)
  values (
    p_actor_id,
    'product.catalogue_quick_updated',
    'products',
    coalesce(p_products->0->>'productId', p_variants->0->>'variantId'),
    jsonb_build_object('products', p_products, 'variants', p_variants)
  );
end;
$$;

revoke all on function admin_update_catalogue_quickly(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function admin_update_catalogue_quickly(uuid, jsonb, jsonb) to service_role;
notify pgrst, 'reload schema';
