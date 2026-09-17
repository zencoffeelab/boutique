create table public.professional_contracts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  next_delivery_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.professional_contract_lines (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.professional_contracts(id) on delete cascade,
  product_name text not null,
  quantity_grams integer not null check (quantity_grams > 0),
  created_at timestamptz not null default now()
);

create index professional_contracts_next_delivery_idx on public.professional_contracts (profile_id, next_delivery_date) where status = 'active';
create index professional_contract_lines_contract_idx on public.professional_contract_lines (contract_id);

alter table public.professional_contracts enable row level security;
alter table public.professional_contract_lines enable row level security;
create policy "professional contract owner read" on public.professional_contracts for select to authenticated using ((select auth.uid()) = profile_id);
create policy "professional contract line owner read" on public.professional_contract_lines for select to authenticated using (exists (select 1 from public.professional_contracts contract where contract.id = contract_id and contract.profile_id = (select auth.uid())));
grant select on public.professional_contracts, public.professional_contract_lines to authenticated;
