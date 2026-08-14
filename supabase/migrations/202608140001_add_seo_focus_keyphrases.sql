alter table public.product_translations
  add column if not exists focus_keyphrase text not null default '';

alter table public.content_page_translations
  add column if not exists focus_keyphrase text not null default '';

alter table public.advice_translations
  add column if not exists focus_keyphrase text not null default '';
