create table if not exists site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table site_settings enable row level security;

drop trigger if exists site_settings_set_updated_at on site_settings;
create or replace function set_site_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger site_settings_set_updated_at
before update on site_settings
for each row execute function set_site_settings_updated_at();

notify pgrst, 'reload schema';
