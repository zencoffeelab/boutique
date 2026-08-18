alter table professional_applications
  add column if not exists country_code char(2);

update professional_applications
set country_code = 'FR'
where country_code is null;

alter table professional_applications
  alter column country_code set default 'FR',
  alter column country_code set not null;
