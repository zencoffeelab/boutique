create or replace function commerce_dashboard_stats() returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'revenue_cents', coalesce(sum(total_cents) filter (where status not in ('pending_payment', 'canceled', 'partially_refunded', 'refunded')), 0),
    'orders', count(*) filter (where status not in ('pending_payment', 'canceled', 'partially_refunded', 'refunded')),
    'contribution_cents', coalesce(sum(subtotal_cents + shipping_charged_cents - cost_of_goods_cents - actual_shipping_cost_cents - stripe_fee_cents) filter (where status not in ('pending_payment', 'canceled', 'partially_refunded', 'refunded')), 0)
  ) from orders
$$;
