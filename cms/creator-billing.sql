create table public.coach_pricing (
 creator_id uuid primary key references auth.users on delete cascade,
 weekly_cents integer not null check (weekly_cents between 50 and 100000)
);
alter table public.coach_pricing enable row level security;
revoke all on public.coach_pricing from public,anon,authenticated;
grant select,insert,update on public.coach_pricing to authenticated;
create policy own_price on public.coach_pricing to authenticated
using (creator_id=auth.uid() and private.active_session())
with check (creator_id=auth.uid() and private.active_session());

create table public.creator_stripe_accounts (
 creator_id uuid references auth.users on delete cascade,
 live boolean not null,
 account_id text not null unique,
 primary key(creator_id,live)
);
alter table public.creator_stripe_accounts enable row level security;
revoke all on public.creator_stripe_accounts from public,anon,authenticated;
grant select,insert on public.creator_stripe_accounts to service_role;
grant select on public.coach_pricing to service_role;
notify pgrst,'reload schema';
