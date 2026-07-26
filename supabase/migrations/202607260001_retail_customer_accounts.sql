create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, first_name, last_name, phone)
  values (new.id, new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name', new.raw_user_meta_data->>'phone')
  on conflict (id) do nothing;
  return new;
end
$$;

create or replace function link_confirmed_customer_orders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null and new.email_confirmed_at is not null then
    update orders
    set profile_id = new.id, updated_at = now()
    where profile_id is null
      and lower(email::text) = lower(new.email);
  end if;
  return new;
end
$$;

drop trigger if exists on_auth_user_confirmed_link_orders on auth.users;
create trigger on_auth_user_confirmed_link_orders
after insert or update of email, email_confirmed_at on auth.users
for each row execute function link_confirmed_customer_orders();

update orders as customer_order
set profile_id = confirmed_user.id, updated_at = now()
from auth.users as confirmed_user
where customer_order.profile_id is null
  and confirmed_user.email is not null
  and confirmed_user.email_confirmed_at is not null
  and lower(customer_order.email::text) = lower(confirmed_user.email);
