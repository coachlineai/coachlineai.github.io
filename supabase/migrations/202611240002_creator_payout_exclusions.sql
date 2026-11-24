create table public.creator_payout_exclusions (
  creator_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.creator_payout_exclusions enable row level security;
revoke all on public.creator_payout_exclusions from public, anon, authenticated;
grant select on public.creator_payout_exclusions to service_role;
insert into public.creator_payout_exclusions (creator_id)
select id from auth.users where lower(email) = 'meetaka813@gmail.com';
