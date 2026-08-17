alter table public.advice_articles
  add column if not exists pinned boolean not null default false;

create index if not exists advice_articles_pinned_published_idx
  on public.advice_articles (pinned desc, published_at desc);
