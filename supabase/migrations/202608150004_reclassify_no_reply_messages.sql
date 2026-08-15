update admin_mail_messages message
set label_id = (select id from admin_mail_labels where name = 'Système')
where message.label_id = (select id from admin_mail_labels where name = 'Erreur')
  and message.sender_address ~* '(no-?reply|no.?reply)'
  and coalesce(message.subject, '') !~* '(delivery status|undeliverable|bounce|failed|failure|error|erreur|échec)'
  and coalesce(message.text_body, '') !~* '(delivery status|undeliverable|bounce|failed|failure|error|erreur|exception|stack trace|http 5[0-9][0-9])';
