create table private.client_contact_requests(
 request_id uuid primary key default gen_random_uuid(), creator_id uuid not null references auth.users on delete cascade,
 page_id uuid not null references public.creator_pages on delete cascade, phone text not null check(phone ~ '^[+][1-9][0-9]{7,14}$'),
 consent_at timestamptz not null default now(),status text not null default 'queued' check(status in ('queued','pending','verified')),
 assigned_line text, bound_at timestamptz, issue_number bigint unique, issue_closed boolean not null default false,
 ticket uuid, next_attempt timestamptz not null default now(), provider_error text, unique(page_id,phone));
alter table private.client_contact_requests enable row level security;
revoke all on private.client_contact_requests from public,anon,authenticated;
create table private.client_registration_visits(ref uuid primary key,request_id uuid not null references private.client_contact_requests on delete cascade);
alter table private.client_registration_visits enable row level security;
revoke all on private.client_registration_visits from public,anon,authenticated;
create function public.request_client_messaging(page_slug text,mobile text,consent boolean,old_enough boolean,browser_ref uuid) returns void
language plpgsql security definer set search_path='' as $$
declare page public.published_pages; owner_id uuid;
begin
 if browser_ref is null or mobile is null or not (consent is true and old_enough is true and mobile ~ '^[+][1-9][0-9]{7,14}$') then raise exception 'Check your number and choices'; end if;
 select * into strict page from public.published_pages where slug=page_slug;
 select coalesce((select creator_id from private.page_coaching_owners where page_id=page.page_id),
 (select user_id from public.page_members where page_id=page.page_id order by user_id limit 1)) into owner_id;
 if owner_id is null then raise exception 'This page is not accepting clients yet'; end if;
 perform pg_advisory_xact_lock(7026140);
 if not exists(select from private.client_contact_requests where phone=mobile) and (select count(distinct phone) from private.client_contact_requests)>=8 then raise exception 'The eight pilot spots are reserved'; end if;
 insert into private.client_contact_requests(creator_id,page_id,phone) values(owner_id,page.page_id,mobile) on conflict(page_id,phone) do nothing;
 insert into private.client_registration_visits(ref,request_id)
 select browser_ref,request_id from private.client_contact_requests where page_id=page.page_id and phone=mobile on conflict do nothing;
end $$;
revoke all on function public.request_client_messaging(text,text,boolean,boolean,uuid) from public;
grant execute on function public.request_client_messaging(text,text,boolean,boolean,uuid) to anon,authenticated;
create function private.dispatch_client_contacts() returns void language plpgsql security definer set search_path='' as $$
declare job record;
begin
 for job in with due as (select request_id from private.client_contact_requests where status<>'verified' and next_attempt<=now() order by next_attempt limit 8 for update skip locked)
 update private.client_contact_requests r set ticket=gen_random_uuid(),next_attempt=now()+interval '10 minutes' from due where due.request_id=r.request_id returning r.ticket
 loop perform net.http_post(url:='https://kvpngwwaemdjwchslcov.supabase.co/functions/v1/register-creator-contact',body:=jsonb_build_object('ticket',job.ticket),timeout_milliseconds:=20000); end loop;
end $$;
revoke all on function private.dispatch_client_contacts() from public,anon,authenticated;
create or replace function public.creator_contact_for_worker(work_ticket uuid) returns table(phone text,status text)
language sql stable security definer set search_path='' as $$
 select phone,status from private.creator_contact_requests where ticket=work_ticket and next_attempt>now() and status<>'verified'
 union all select phone,status from private.client_contact_requests where ticket=work_ticket and next_attempt>now() and status<>'verified';
$$;
create or replace function public.finish_creator_contact(work_ticket uuid,new_status text,line text,error_code text) returns void language plpgsql security definer set search_path='' as $$
begin
 update private.creator_contact_requests r set status=coalesce(new_status,r.status),assigned_line=coalesce(line,r.assigned_line),provider_error=error_code,ticket=null,next_attempt=now()+case when error_code is null then interval '5 minutes' else interval '1 hour' end where ticket=work_ticket;
 update private.client_contact_requests r set status=coalesce(new_status,r.status),assigned_line=coalesce(line,r.assigned_line),provider_error=error_code,ticket=null,next_attempt=now()+case when error_code is null then interval '5 minutes' else interval '1 hour' end where ticket=work_ticket;
end $$;
select cron.schedule('coachline-client-contacts','* * * * *','select private.dispatch_client_contacts()');

-- A browser can only find the shared destination, never an intake token or client data.
create function public.client_registration_line(browser_ref uuid) returns text language sql stable security definer set search_path='' as $$
 select r.assigned_line from private.client_contact_requests r join private.client_registration_visits v using(request_id)
 where v.ref=browser_ref and r.status in ('pending','verified');
$$;
revoke all on function public.client_registration_line(uuid) from public;
grant execute on function public.client_registration_line(uuid) to anon,authenticated;

create function public.client_message_owner(sender text,destination text,greeting text) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid; n int;
begin
 perform pg_advisory_xact_lock(hashtextextended(sender,0));
 select count(*),(array_agg(r.creator_id))[1] into n,target from private.client_contact_requests r join public.published_pages p using(page_id)
 where r.phone=sender and r.assigned_line=destination and r.status in ('pending','verified')
 and lower(trim(translate(greeting,'’',''''))) = lower('what''s up, '||split_part(trim(p.content->>'name'),' ',1)||'?');
 if n=1 then
 update private.client_contact_requests set bound_at=case when creator_id=target then now() else null end where phone=sender and assigned_line=destination;
 return target; end if;
 select creator_id into target from private.client_contact_requests where phone=sender and assigned_line=destination and bound_at is not null limit 1;
 return target;
end $$;
revoke all on function public.client_message_owner(text,text,text) from public,anon,authenticated;
grant execute on function public.client_message_owner(text,text,text) to service_role;

create table private.pilot_checkouts(
 client_id uuid primary key references public.coach_client_intake(client_key) on delete cascade,
 stripe_session text not null unique check(stripe_session ~ '^(cs_test_[a-zA-Z0-9]+|sim_[a-f0-9-]{36})$'), plan text not null check(plan in ('once','year','week')), amount integer not null check(amount>0),
 confirmed_at timestamptz not null default now());
alter table private.pilot_checkouts enable row level security;
revoke all on private.pilot_checkouts from public,anon,authenticated;
create function public.confirm_test_checkout(client uuid,session_ref text,selected text,cents int) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(7026140);
 if exists(select from private.pilot_checkouts where client_id=client) then return; end if;
 if not exists(select from public.coach_client_intake c join private.client_contact_requests r on r.creator_id=c.creator_id and r.phone=c.phone where c.client_key=client and c.completed_at is not null and not c.coaching_paused and r.status='verified' and r.bound_at is not null) then raise exception 'Finish messaging verification first'; end if;
 insert into private.pilot_checkouts(client_id,stripe_session,plan,amount) values(client,session_ref,selected,cents) on conflict(client_id) do nothing;
 perform public.record_coaching_consent(client,'sandbox-'||session_ref,true);
 insert into public.coaching_jobs(client_id,job_key,kind,input) values(client,'starter','starter','{}') on conflict do nothing;
end $$;
revoke all on function public.confirm_test_checkout(uuid,text,text,int) from public,anon,authenticated;
grant execute on function public.confirm_test_checkout(uuid,text,text,int) to service_role;
create or replace function public.coach_has_paid_access(owner_id uuid,sender text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select from public.coaching_orders where creator_id=owner_id and client_phone=sender and state='active' and (plan='once' or paid_through>now()))
 or exists(select from private.pilot_checkouts t join public.coach_client_intake c on c.client_key=t.client_id where c.creator_id=owner_id and c.phone=sender);
$$;
create function public.pilot_client_ready(owner_id uuid,sender text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select from private.client_contact_requests where creator_id=owner_id and phone=sender and status='verified' and bound_at is not null);
$$;
revoke all on function public.pilot_client_ready(uuid,text) from public,anon,authenticated;
grant execute on function public.pilot_client_ready(uuid,text) to service_role;
create or replace function public.pilot_dashboard_counts() returns jsonb
language sql stable security definer set search_path='' as $$
  with eligible as (
    select c.client_key,c.creator_id,c.phone
    from public.coach_client_intake c
    where c.completed_at is not null and (
      exists(select 1 from public.coaching_orders o where o.creator_id=c.creator_id and o.client_phone=c.phone and o.state='active')
      or exists(select from private.pilot_checkouts t where t.client_id=c.client_key)
    )
  )
  select jsonb_build_object(
    'filled',count(distinct phone),'test_cents',coalesce((select sum(t.amount) from private.pilot_checkouts t join public.coach_client_intake c on c.client_key=t.client_id where c.creator_id=auth.uid()),0),
    'mine',count(distinct phone) filter(where creator_id=auth.uid()),
    'active',count(distinct phone) filter(where creator_id=auth.uid() and exists(
      select 1 from public.client_activity a where a.client_id=eligible.client_key
      and a.kind in ('client','pilot_client','burn','progress','workout_done','checkin_note','meal_log','burn_file')
      and a.created_at>=now()-interval '7 days')))
  from eligible where exists(select 1 from public.profiles where id=auth.uid());
$$;
revoke all on function public.pilot_dashboard_counts() from public,anon;
grant execute on function public.pilot_dashboard_counts() to authenticated;

create function public.pilot_contact_line(owner_id uuid,sender text) returns text language sql stable security definer set search_path='' as $$
 select assigned_line from private.client_contact_requests where creator_id=owner_id and phone=sender and bound_at is not null;
$$;
create function public.creator_sandbox_payments() returns table(day date,plan text,cents int,first_name text)
language sql stable security definer set search_path='' as $$
 select t.confirmed_at::date,t.plan,t.amount,c.first_name from private.pilot_checkouts t join public.coach_client_intake c on c.client_key=t.client_id where c.creator_id=auth.uid() order by t.confirmed_at desc;
$$;
revoke all on function public.creator_sandbox_payments() from public,anon;
grant execute on function public.creator_sandbox_payments() to authenticated;
revoke all on function public.pilot_contact_line(uuid,text) from public,anon,authenticated;
grant execute on function public.pilot_contact_line(uuid,text) to service_role;
