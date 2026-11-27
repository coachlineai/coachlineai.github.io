create schema if not exists private;
create table private.creator_contact_requests (
  request_id uuid primary key default gen_random_uuid(),
  creator_id uuid not null unique references auth.users(id) on delete cascade,
  phone text not null check (phone ~ '^[+][1-9][0-9]{7,14}$'),
  consent_at timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued','pending','verified')),
  assigned_line text check (assigned_line ~ '^[+][1-9][0-9]{7,14}$'),
  issue_number bigint unique,
  issue_closed boolean not null default false,
  next_attempt timestamptz not null default now(),
  ticket uuid,
  provider_error text
);
alter table private.creator_contact_requests enable row level security;
revoke all on private.creator_contact_requests from public, anon, authenticated;

-- Capture the signup once. Later edits to account metadata cannot retarget a request.
create function private.capture_creator_contact() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.raw_user_meta_data->>'creator_contact_consent' = 'v1' then
    insert into private.creator_contact_requests(creator_id,phone)
    values (new.id,new.raw_user_meta_data->>'creator_contact_phone');
  end if;
  return new;
end $$;
revoke all on function private.capture_creator_contact() from public, anon, authenticated;
create trigger capture_creator_contact after insert on auth.users
for each row execute function private.capture_creator_contact();

create function public.my_creator_contact_status() returns table(status text, assigned_line text)
language sql stable security definer set search_path = '' as $$
  select r.status, r.assigned_line from private.creator_contact_requests r where r.creator_id = (select auth.uid());
$$;
revoke all on function public.my_creator_contact_status() from public, anon;
grant execute on function public.my_creator_contact_status() to authenticated;

-- A short-lived ticket authorizes work on precisely one confirmed signup.
create function private.dispatch_creator_contacts() returns void
language plpgsql security definer set search_path = '' as $$
declare job record;
begin
  for job in
    with due as (
      select r.request_id from private.creator_contact_requests r join auth.users u on u.id = r.creator_id
      where u.email_confirmed_at is not null and r.status <> 'verified' and r.next_attempt <= now()
      order by r.next_attempt limit 10 for update of r skip locked
    )
    update private.creator_contact_requests r set ticket = gen_random_uuid(), next_attempt = now() + interval '10 minutes'
    from due where due.request_id = r.request_id returning r.ticket
  loop
    perform net.http_post(
      url := 'https://kvpngwwaemdjwchslcov.supabase.co/functions/v1/register-creator-contact',
      body := jsonb_build_object('ticket',job.ticket), timeout_milliseconds := 20000);
  end loop;
end $$;
revoke all on function private.dispatch_creator_contacts() from public, anon, authenticated;
create function public.creator_contact_for_worker(work_ticket uuid)
returns table(phone text, status text)
language sql stable security definer set search_path = '' as $$
  select r.phone, r.status from private.creator_contact_requests r
  where r.ticket = work_ticket and r.next_attempt > now() and r.status <> 'verified';
$$;
create function public.finish_creator_contact(work_ticket uuid, new_status text, line text, error_code text)
returns void language sql security definer set search_path = '' as $$
  update private.creator_contact_requests r set
    status = coalesce(new_status,r.status), assigned_line = coalesce(line,r.assigned_line),
    provider_error = error_code, ticket = null,
    next_attempt = now() + case when error_code is null then interval '5 minutes' else interval '1 hour' end
  where r.ticket = work_ticket;
$$;
revoke all on function public.creator_contact_for_worker(uuid), public.finish_creator_contact(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.creator_contact_for_worker(uuid), public.finish_creator_contact(uuid,text,text,text) to service_role;
select cron.schedule('coachline-creator-contacts','* * * * *','select private.dispatch_creator_contacts()');
