-- Professional reductions are applied after the public tariff. Historical
-- professional offer rows must therefore not retain a different base price.
update public.variant_offers as professional
set price_cents = retail.price_cents
from public.variant_offers as retail
where professional.variant_id = retail.variant_id
  and professional.audience = 'professional'
  and retail.audience = 'retail'
  and professional.price_cents is distinct from retail.price_cents;
