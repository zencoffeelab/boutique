-- Contact forms have their own audit table. Mirror historical records into
-- the administrator inbox so they can be read and answered from one place.
insert into admin_mail_messages (
  direction,
  sender_name,
  sender_address,
  recipients,
  cc_addresses,
  reply_to_address,
  subject,
  text_body,
  message_id_header,
  provider_id,
  is_read,
  raw_size,
  received_at,
  created_at,
  updated_at
)
select
  'inbound',
  contact.name,
  contact.email,
  jsonb_build_array(jsonb_build_object('name', 'Zen Coffee Lab', 'address', 'contact@zencoffeelab.com')),
  '[]'::jsonb,
  contact.email,
  case contact.subject
    when 'order' then 'Nouveau message · Une commande'
    when 'coffee' then 'Nouveau message · Un café'
    when 'professional' then 'Nouveau message · Un projet professionnel'
    else 'Nouveau message · Autre demande'
  end,
  contact.message,
  '<contact-message-' || contact.id::text || '@zencoffeelab.com>',
  'contact-message/' || contact.id::text,
  false,
  octet_length(contact.message),
  contact.created_at,
  contact.created_at,
  contact.updated_at
from contact_messages as contact
on conflict (message_id_header) do nothing;
