alter table public.profiles
  add column if not exists professional_account_type text not null default 'classic'
  check (professional_account_type in ('classic', 'contractual'));

comment on column public.profiles.professional_account_type is
  'Niveau de compte professionnel : classique par défaut, ou contractuel pour l’espace professionnel étendu.';
