alter table professional_applications
  add column if not exists vat_number text;

alter table professional_applications
  add column if not exists company_registration_number text;

alter table professional_applications
  alter column phone drop not null;
