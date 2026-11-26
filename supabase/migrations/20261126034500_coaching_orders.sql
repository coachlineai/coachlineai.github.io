create table public.coaching_orders (
  session_id text primary key,
  creator_id uuid not null references auth.users(id),
  plan text not null check (plan in ('once','week','year')),
  client_phone text,
  subscription_id text unique,
  amount_cents integer not null check (amount_cents > 0),
  state text not null default 'pending' check (state in ('pending','active','ended')),
  paid_through timestamptz,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.coaching_orders enable row level security;
revoke all on public.coaching_orders from public,anon,authenticated;
grant select,insert,update on public.coaching_orders to service_role;
create index coaching_orders_client on public.coaching_orders(creator_id,client_phone);

-- Only the billing functions can register or read the Stripe signing key.
create function public.coachline_webhook_key()
returns text language sql security definer set search_path='' as $$
  select decrypted_secret from vault.decrypted_secrets where name='coachline_checkout_webhook_v1';
$$;
create function public.save_coachline_webhook_key(signing_key text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if signing_key !~ '^whsec_[A-Za-z0-9]+$' then raise exception 'Invalid signing key'; end if;
  perform pg_advisory_xact_lock(46162375);
  if public.coachline_webhook_key() is null then
    perform vault.create_secret(signing_key,'coachline_checkout_webhook_v1');
  end if;
end $$;
revoke all on function public.coachline_webhook_key(), public.save_coachline_webhook_key(text) from public,anon,authenticated;
grant execute on function public.coachline_webhook_key(), public.save_coachline_webhook_key(text) to service_role;
