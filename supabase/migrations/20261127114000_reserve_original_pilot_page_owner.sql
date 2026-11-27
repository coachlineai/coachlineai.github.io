alter table private.pilot_page_backup add column owner_email_digest bytea;
update private.pilot_page_backup b set owner_email_digest=(select sha256(convert_to(lower(trim(u.email)),'UTF8')) from public.page_members m join auth.users u on u.id=m.user_id where m.page_id=b.original_page_id and u.email_confirmed_at is not null);
alter table private.pilot_page_backup alter column owner_email_digest set not null;
