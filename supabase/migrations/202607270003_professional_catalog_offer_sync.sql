create or replace function sync_product_professional_offers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.professional_enabled then
    insert into variant_offers (variant_id, audience, price_cents, minimum_quantity, active)
    select variant.id, 'professional'::audience_type, retail.price_cents, 1, true
    from product_variants as variant
    join variant_offers as retail
      on retail.variant_id = variant.id
      and retail.audience = 'retail'
      and retail.active = true
    where variant.product_id = new.id
    on conflict (variant_id, audience) do update
    set
      price_cents = case
        when variant_offers.price_cents > 0 then variant_offers.price_cents
        else excluded.price_cents
      end,
      minimum_quantity = greatest(variant_offers.minimum_quantity, 1),
      active = true;
  else
    update variant_offers as professional
    set active = false
    from product_variants as variant
    where professional.variant_id = variant.id
      and variant.product_id = new.id
      and professional.audience = 'professional'
      and professional.active = true;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_product_professional_offers_trigger on products;
create trigger sync_product_professional_offers_trigger
after insert or update of professional_enabled on products
for each row execute function sync_product_professional_offers();

insert into variant_offers (variant_id, audience, price_cents, minimum_quantity, active)
select variant.id, 'professional'::audience_type, retail.price_cents, 1, true
from products as product
join product_variants as variant on variant.product_id = product.id
join variant_offers as retail
  on retail.variant_id = variant.id
  and retail.audience = 'retail'
  and retail.active = true
where product.professional_enabled = true
on conflict (variant_id, audience) do update
set
  price_cents = case
    when variant_offers.price_cents > 0 then variant_offers.price_cents
    else excluded.price_cents
  end,
  minimum_quantity = greatest(variant_offers.minimum_quantity, 1),
  active = true;
