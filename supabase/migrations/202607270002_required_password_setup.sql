alter table profiles
  add column if not exists password_setup_required boolean not null default false;

comment on column profiles.password_setup_required is
  'Blocks an invited member from browsing while their first password has not been chosen.';
