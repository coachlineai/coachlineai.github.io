create table private.pilot_messaging_backup as
select b.original_page_id,s.published_style,s.phone_line,s.webhook_secret
from private.pilot_page_backup b join private.page_coaching_owners o on o.page_id=b.original_page_id
join public.coach_preview_sessions s on s.creator_id=o.creator_id where s.phone_line is not null;
alter table private.pilot_messaging_backup add primary key(original_page_id);
alter table private.pilot_messaging_backup enable row level security;
revoke all on private.pilot_messaging_backup from public,anon,authenticated;

create function public.recover_reserved_creator_page() returns text
language plpgsql security definer set search_path='' as $$
declare page uuid; me uuid := auth.uid(); config private.pilot_messaging_backup;
begin
  select b.original_page_id into page from private.pilot_page_backup b join auth.users u
    on u.id=me and b.owner_email_digest=sha256(convert_to(lower(trim(u.email)),'UTF8'))
    where b.slug='matthias' for update of b;
  if page is null or exists(select from public.page_members where page_id=page) then return null; end if;
  if not exists(select from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a where a->>'method'='otp') then return 'verify_email'; end if;
  select * into strict config from private.pilot_messaging_backup where original_page_id=page;
  insert into public.page_members(page_id,user_id) values(page,me);
  insert into private.page_coaching_owners(page_id,creator_id) values(page,me)
    on conflict(page_id) do update set creator_id=excluded.creator_id;
  insert into public.coach_preview_sessions(creator_id,published_style,phone_line,webhook_secret)
    values(me,config.published_style,config.phone_line,config.webhook_secret)
    on conflict(creator_id) do update set published_style=excluded.published_style,phone_line=excluded.phone_line,webhook_secret=excluded.webhook_secret;
  update public.creator_pages set updated_at=now() where id=page;
  return 'restored';
end $$;
revoke all on function public.recover_reserved_creator_page() from public,anon;
grant execute on function public.recover_reserved_creator_page() to authenticated;
