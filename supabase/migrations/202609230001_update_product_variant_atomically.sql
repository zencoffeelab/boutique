create or replace function admin_update_product_variant(
  p_actor_id uuid,
  p_product_id uuid,
  p_variant_id uuid,
  p_sku text,
  p_label text,
  p_weight_grams integer,
  p_internal_cost_cents integer,
  p_stock_on_hand integer,
  p_low_stock_threshold integer,
  p_hs_code text,
  p_customs_origin_country char(2),
  p_professional_requested boolean,
  p_professional_minimum_quantity integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_variant product_variants%rowtype;
  v_product products%rowtype;
  v_next_stock_grams integer;
  v_next_threshold_grams integer;
begin
  select * into v_variant
  from product_variants
  where id = p_variant_id and product_id = p_product_id
  for update;
  if not found then
    raise exception 'Variante introuvable pour ce produit.';
  end if;

  select * into v_product from products where id = p_product_id for update;
  if not found then
    raise exception 'Produit introuvable.';
  end if;
  if p_stock_on_hand < v_variant.stock_reserved then
    raise exception 'Le stock total ne peut pas être inférieur aux % unité(s) actuellement réservée(s).', v_variant.stock_reserved;
  end if;

  v_next_stock_grams := v_product.stock_on_hand_grams
    - v_variant.stock_on_hand * v_variant.weight_grams
    + p_stock_on_hand * p_weight_grams;
  v_next_threshold_grams := v_product.low_stock_threshold_grams
    - v_variant.low_stock_threshold * v_variant.weight_grams
    + p_low_stock_threshold * p_weight_grams;
  if v_next_stock_grams < v_product.stock_reserved_grams then
    raise exception 'Le stock total ne peut pas être inférieur au stock réservé.';
  end if;

  update product_variants
  set sku = p_sku,
      label = p_label,
      weight_grams = p_weight_grams,
      internal_cost_cents = p_internal_cost_cents,
      stock_on_hand = p_stock_on_hand,
      low_stock_threshold = p_low_stock_threshold,
      hs_code = p_hs_code,
      customs_origin_country = p_customs_origin_country,
      updated_at = now()
  where id = v_variant.id;

  update products
  set stock_on_hand_grams = v_next_stock_grams,
      low_stock_threshold_grams = v_next_threshold_grams,
      updated_at = now()
  where id = v_product.id;

  insert into variant_offers (variant_id, audience, price_cents, minimum_quantity, active)
  values (v_variant.id, 'retail'::audience_type, p_internal_cost_cents, 1, true)
  on conflict (variant_id, audience) do update
  set price_cents = excluded.price_cents,
      minimum_quantity = excluded.minimum_quantity,
      active = excluded.active;

  if p_professional_requested then
    insert into variant_offers (variant_id, audience, price_cents, minimum_quantity, active)
    values (v_variant.id, 'professional'::audience_type, p_internal_cost_cents, p_professional_minimum_quantity, true)
    on conflict (variant_id, audience) do update
    set price_cents = excluded.price_cents,
        minimum_quantity = excluded.minimum_quantity,
        active = excluded.active;
  else
    update variant_offers
    set active = false
    where variant_id = v_variant.id and audience = 'professional'::audience_type;
  end if;

  if p_stock_on_hand <> v_variant.stock_on_hand then
    insert into stock_movements (variant_id, quantity_delta, reason, actor_id)
    values (v_variant.id, p_stock_on_hand - v_variant.stock_on_hand, 'Ajustement manuel depuis la fiche produit', p_actor_id);
  end if;

  insert into audit_log (actor_id, action, entity_type, entity_id, before_data, after_data)
  values (
    p_actor_id,
    'variant.updated',
    'product_variant',
    v_variant.id::text,
    jsonb_build_object('variant', to_jsonb(v_variant)),
    jsonb_build_object('sku', p_sku, 'label', p_label, 'weightGrams', p_weight_grams, 'stockOnHand', p_stock_on_hand)
  );
end;
$$;

revoke all on function admin_update_product_variant(uuid, uuid, uuid, text, text, integer, integer, integer, integer, text, char(2), boolean, integer) from public, anon, authenticated;
grant execute on function admin_update_product_variant(uuid, uuid, uuid, text, text, integer, integer, integer, integer, text, char(2), boolean, integer) to service_role;
notify pgrst, 'reload schema';
