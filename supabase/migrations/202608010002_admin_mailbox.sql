create table admin_mail_messages (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_name text,
  sender_address citext not null,
  recipients jsonb not null default '[]'::jsonb check (jsonb_typeof(recipients) = 'array'),
  cc_addresses jsonb not null default '[]'::jsonb check (jsonb_typeof(cc_addresses) = 'array'),
  reply_to_address citext,
  subject text not null default '(Sans objet)' check (char_length(subject) <= 998),
  text_body text,
  html_body text,
  message_id_header text unique,
  in_reply_to_header text,
  references_header text,
  parent_id uuid references admin_mail_messages(id) on delete set null,
  is_read boolean not null default false,
  read_at timestamptz,
  read_by uuid references profiles(id) on delete set null,
  provider_id text unique,
  raw_size integer not null default 0 check (raw_size >= 0),
  received_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table admin_mail_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references admin_mail_messages(id) on delete cascade,
  filename text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes integer not null default 0 check (size_bytes >= 0),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index admin_mail_messages_direction_created_idx on admin_mail_messages (direction, created_at desc);
create index admin_mail_messages_unread_idx on admin_mail_messages (created_at desc) where direction = 'inbound' and is_read = false;
create index admin_mail_attachments_message_idx on admin_mail_attachments (message_id);

alter table admin_mail_messages enable row level security;
alter table admin_mail_attachments enable row level security;
revoke all on admin_mail_messages, admin_mail_attachments from anon, authenticated;
grant select, insert, update, delete on admin_mail_messages, admin_mail_attachments to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('admin-mail-attachments', 'admin-mail-attachments', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
