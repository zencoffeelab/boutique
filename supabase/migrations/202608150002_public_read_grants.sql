-- RLS policies only filter rows; PostgREST also needs explicit table grants.
grant select on products, product_translations, product_media, product_editorial_blocks,
  product_variants, variant_offers, advice_articles, advice_translations,
  content_pages, content_page_translations, faq_items to anon, authenticated;
