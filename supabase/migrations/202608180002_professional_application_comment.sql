alter table professional_applications
  add column if not exists comment text not null default '';
