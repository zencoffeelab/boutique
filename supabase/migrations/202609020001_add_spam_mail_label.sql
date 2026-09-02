insert into admin_mail_labels (name, color)
values ('Spam', '#b42318')
on conflict (name) do nothing;
