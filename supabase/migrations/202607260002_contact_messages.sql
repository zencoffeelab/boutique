create table contact_messages (
  id uuid primary key default gen_random_uuid(),
  locale locale_code not null,
  name text not null check (char_length(name) between 2 and 120),
  email citext not null,
  phone text,
  subject text not null check (subject in ('order', 'coffee', 'professional', 'other')),
  message text not null check (char_length(message) between 10 and 5000),
  status text not null default 'new' check (status in ('new', 'in_progress', 'answered', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contact_messages_status_created_idx on contact_messages (status, created_at desc);

alter table contact_messages enable row level security;
revoke all on contact_messages from anon, authenticated;
