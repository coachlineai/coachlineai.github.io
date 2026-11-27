-- Keep inbound authentication on the single gateway session. Page ownership
-- and the client's registration still determine which creator handles a text.
create or replace function private.page_ai_line(page uuid) returns text
language sql stable set search_path='' as $$
  select coalesce(
    (select s.phone_line from public.coach_preview_sessions s
     where s.creator_id=o.creator_id and s.phone_line ~ '^\+[1-9][0-9]{7,14}$'),
    (select gateway.phone_line from public.coach_preview_sessions gateway
     where gateway.phone_line='+16177106179' and gateway.webhook_secret is not null)
  )
  from private.page_coaching_owners o where o.page_id=page;
$$;

create or replace function private.refresh_public_line() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='page_coaching_owners' then
    update public.published_pages set content=content
    where page_id=coalesce(new.page_id,old.page_id);
  else
    -- A change to the gateway can affect every page that shares its line.
    update public.published_pages p set content=content
    where p.content->>'phone' is distinct from coalesce(private.page_ai_line(p.page_id),'');
  end if;
  return null;
end $$;

update public.published_pages p set content=content
where p.content->>'phone' is distinct from coalesce(private.page_ai_line(p.page_id),'');
