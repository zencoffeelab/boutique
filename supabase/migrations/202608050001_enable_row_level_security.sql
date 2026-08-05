-- All application data is accessed through explicit policies or the server-only
-- service role. Enable RLS on every public table so newly granted database
-- privileges cannot accidentally expose a table to browser clients.
alter table profiles enable row level security;
alter table addresses enable row level security;
alter table professional_applications enable row level security;
alter table products enable row level security;
alter table product_translations enable row level security;
alter table product_media enable row level security;
alter table product_variants enable row level security;
alter table variant_offers enable row level security;
alter table packaging_presets enable row level security;
alter table content_pages enable row level security;
alter table content_page_translations enable row level security;
alter table advice_articles enable row level security;
alter table advice_translations enable row level security;
alter table faq_items enable row level security;
alter table shipping_quotes enable row level security;
alter table orders enable row level security;
alter table order_lines enable row level security;
alter table stock_reservations enable row level security;
alter table stock_movements enable row level security;
alter table payments enable row level security;
alter table invoices enable row level security;
alter table credit_notes enable row level security;
alter table shipments enable row level security;
alter table tracking_events enable row level security;
alter table notification_outbox enable row level security;
alter table webhook_events enable row level security;
alter table audit_log enable row level security;
alter table product_editorial_blocks enable row level security;
alter table contact_messages enable row level security;
alter table professional_quotes enable row level security;
alter table professional_quote_lines enable row level security;
alter table admin_mail_messages enable row level security;
alter table admin_mail_attachments enable row level security;
alter table admin_mail_labels enable row level security;
