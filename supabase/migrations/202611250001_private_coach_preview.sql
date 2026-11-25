create table public.coach_preview_sessions (
  creator_id uuid primary key references auth.users(id) on delete cascade,
  history jsonb not null default '[]',
  started_at timestamptz,
  attempt uuid,
  usage_date date,
  attempts integer not null default 0
);
alter table public.coach_preview_sessions enable row level security;
revoke all on public.coach_preview_sessions from public, anon, authenticated;
grant select, update on public.coach_preview_sessions to service_role;
insert into public.coach_preview_sessions (creator_id)
select id from auth.users where lower(email)='meetaka813@gmail.com';

create function public.reserve_coach_preview(owner_id uuid, request_id uuid)
returns boolean language sql set search_path='' as $$
  with reserved as (
    update public.coach_preview_sessions set attempt=request_id, started_at=now(),
      attempts=case when usage_date=(now() at time zone 'utc')::date then attempts+1 else 1 end,
      usage_date=(now() at time zone 'utc')::date
    where creator_id=owner_id and (attempt is null or started_at < now()-interval '60 seconds')
      and (usage_date is distinct from (now() at time zone 'utc')::date or attempts<20)
    returning 1
  ) select exists(select 1 from reserved)
$$;
revoke all on function public.reserve_coach_preview(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_coach_preview(uuid,uuid) to service_role;
