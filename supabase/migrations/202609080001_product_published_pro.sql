-- Keep professional-only products out of the public catalogue while allowing
-- server-authorized professional and administrator sessions to load them.
alter type public.product_status add value if not exists 'published_pro';
