create table admin_mail_labels (
  id uuid primary key default gen_random_uuid(),
  name citext not null unique check (char_length(trim(name::text)) between 1 and 40),
  color text not null default '#56634f' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table admin_mail_messages
  add column label_id uuid references admin_mail_labels(id) on delete set null;

create index admin_mail_messages_label_idx
  on admin_mail_messages (label_id, direction, created_at desc);

alter table admin_mail_labels enable row level security;
revoke all on admin_mail_labels from anon, authenticated;
grant select, insert, update, delete on admin_mail_labels to service_role;
