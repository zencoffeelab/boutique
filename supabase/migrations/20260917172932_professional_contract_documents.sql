alter table public.professional_contracts
  add column if not exists storage_path text;

insert into storage.buckets (id, name, public)
values ('professional-contracts', 'professional-contracts', false)
on conflict (id) do nothing;
