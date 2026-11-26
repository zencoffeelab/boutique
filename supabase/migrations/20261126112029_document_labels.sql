alter table public.invoices
  add column document_label text not null default 'test'
  check (document_label in ('test', 'client', 'client_pro'));

alter table public.professional_quotes
  add column document_label text not null default 'test'
  check (document_label in ('test', 'client', 'client_pro'));
