alter table notification_outbox add column dedupe_key text;

create unique index notification_outbox_dedupe_key_idx
  on notification_outbox(dedupe_key)
  where dedupe_key is not null;
