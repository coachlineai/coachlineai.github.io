create or replace function public.client_message_owner(sender text,destination text,greeting text) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid; n int; ambiguous constant uuid := '00000000-0000-0000-0000-000000000000';
begin
 perform pg_advisory_xact_lock(hashtextextended(sender,0));
 select count(*),(array_agg(r.creator_id))[1] into n,target from private.client_contact_requests r join public.published_pages p using(page_id)
 where r.phone=sender and r.assigned_line=destination and r.status in ('pending','verified')
 and lower(trim(translate(greeting,'’',''''))) in (lower('what''s up, '||split_part(trim(p.content->>'name'),' ',1)||'?'),lower('what''s up, '||trim(p.content->>'name')||'?'),lower('what''s up, '||trim(p.content->>'name')||' (@'||p.slug||')?'));
 if n=1 then
 update private.client_contact_requests set bound_at=case when creator_id=target then now() else null end where phone=sender and assigned_line=destination;
 return target; end if;
 if n>1 then return ambiguous; end if;
 if not exists(select from private.client_contact_requests where phone=sender and assigned_line=destination) then return null; end if;
 if lower(trim(greeting)) like 'what% up, %' then return ambiguous; end if;
 select creator_id into target from private.client_contact_requests where phone=sender and assigned_line=destination and bound_at is not null limit 1;
 return coalesce(target,ambiguous);
end $$;

create function public.client_registration_greeting(browser_ref uuid) returns text language sql stable security definer set search_path='' as $$
 with chosen as (select r.phone,r.creator_id,p.content->>'name' as name,p.slug from private.client_registration_visits v join private.client_contact_requests r using(request_id) join public.published_pages p using(page_id) where v.ref=browser_ref),
 names as (select distinct p.content->>'name' as name,p.slug from private.client_contact_requests r join public.published_pages p using(page_id) join chosen c on c.phone=r.phone)
 select 'What’s up, '|| case when (select count(*) from names where lower(name)=lower(c.name))>1 then trim(c.name)||' (@'||c.slug||')'
 when (select count(*) from names where lower(split_part(trim(name),' ',1))=lower(split_part(trim(c.name),' ',1)))>1 then trim(c.name)
 else split_part(trim(c.name),' ',1) end ||'?' from chosen c;
$$;
revoke all on function public.client_registration_greeting(uuid) from public;
grant execute on function public.client_registration_greeting(uuid) to anon,authenticated;
