alter table admin_mail_messages
  add column scheduled_at timestamptz,
  add column scheduled_by uuid references profiles(id) on delete set null,
  add column scheduled_status text check (scheduled_status in ('scheduled', 'sending', 'sent', 'failed'));

create index admin_mail_messages_scheduled_send_idx
  on admin_mail_messages (scheduled_at asc)
  where direction = 'outbound' and scheduled_at is not null and sent_at is null and scheduled_status = 'scheduled';
