alter table admin_mail_attachments
  add column if not exists content_id text,
  add column if not exists disposition text check (disposition in ('attachment', 'inline'));

create index if not exists admin_mail_attachments_content_id_idx
  on admin_mail_attachments (message_id, content_id)
  where content_id is not null;
