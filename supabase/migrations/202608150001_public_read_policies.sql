-- Public pages use the anon Supabase key. Keep public reads limited to content
-- that is explicitly published/active; all writes remain server-only.
create policy "public read published products" on public.products
  for select to anon, authenticated using (status in ('published', 'archived'));
create policy "public read product translations" on public.product_translations
  for select to anon, authenticated using (exists (select 1 from public.products p where p.id = product_id and p.status in ('published', 'archived')));
create policy "public read product media" on public.product_media
  for select to anon, authenticated using (exists (select 1 from public.products p where p.id = product_id and p.status in ('published', 'archived')));
create policy "public read product editorial blocks" on public.product_editorial_blocks
  for select to anon, authenticated using (exists (select 1 from public.products p where p.id = product_id and p.status in ('published', 'archived')));
create policy "public read product variants" on public.product_variants
  for select to anon, authenticated using (exists (select 1 from public.products p where p.id = product_id and p.status in ('published', 'archived')));
create policy "public read active variant offers" on public.variant_offers
  for select to anon, authenticated using (active and exists (select 1 from public.product_variants v join public.products p on p.id = v.product_id where v.id = variant_id and p.status in ('published', 'archived')));

create policy "public read published articles" on public.advice_articles
  for select to anon, authenticated using (status = 'published');
create policy "public read article translations" on public.advice_translations
  for select to anon, authenticated using (exists (select 1 from public.advice_articles a where a.id = article_id and a.status = 'published'));

create policy "public read published pages" on public.content_pages
  for select to anon, authenticated using (status = 'published');
create policy "public read published page translations" on public.content_page_translations
  for select to anon, authenticated using (exists (select 1 from public.content_pages p where p.id = page_id and p.status = 'published'));
create policy "public read active faq" on public.faq_items
  for select to anon, authenticated using (active = true);
