insert into admin_mail_labels (name, color)
values
  ('Site · Client particulier', '#4f6f52'),
  ('Site · Client professionnel', '#2f5f7a'),
  ('Extérieur · Client particulier', '#8b6f47'),
  ('Extérieur · Client professionnel', '#72508a'),
  ('Système', '#56634f'),
  ('Erreur', '#a43831')
on conflict (name) do nothing;

update admin_mail_messages message
set label_id = (select id from admin_mail_labels where name = 'Erreur')
where message.label_id is null
  and (message.sender_address ~* '(mailer-daemon|postmaster|no-?reply|bounce)'
    or message.subject ~* '(delivery status|undeliverable|erreur|error|failed|failure)');

update admin_mail_messages message
set label_id = (select id from admin_mail_labels where name = 'Système')
where message.label_id is null
  and (message.sender_address ~* '(system|notification|cron|stripe|sendcloud|supabase|cloudflare)'
    or message.subject ~* '(notification|automatique|system|système)');

update admin_mail_messages message
set label_id = (
  select id from admin_mail_labels
  where name = case
    when exists (select 1 from jsonb_array_elements(message.recipients) recipient where recipient->>'address' ilike '%@zencoffeelab.com')
      then 'Site · Client professionnel'
    else 'Extérieur · Client professionnel'
  end
)
where message.label_id is null
  and message.subject || ' ' || coalesce(message.text_body, '') ~* '(professionnel|entreprise|société|siret|tva|devis|grossiste|revendeur|wholesale|company|business|vat|invoice)';

update admin_mail_messages message
set label_id = (
  select id from admin_mail_labels
  where name = case
    when exists (select 1 from jsonb_array_elements(message.recipients) recipient where recipient->>'address' ilike '%@zencoffeelab.com')
      then 'Site · Client particulier'
    else 'Extérieur · Client particulier'
  end
)
where message.label_id is null;
