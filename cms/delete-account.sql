-- Scope page cleanup to pages for which the caller is the last member.
create function private.my_exclusive_pages() returns setof uuid
language sql stable security definer set search_path='' as $$
  select mine.page_id from public.page_members mine
  where mine.user_id=auth.uid() and not exists (
    select 1 from public.page_members other_member
    where other_member.page_id=mine.page_id and other_member.user_id<>mine.user_id
  )
$$;
revoke all on function private.my_exclusive_pages() from public,anon;
grant execute on function private.my_exclusive_pages() to authenticated;

create policy delete_exclusive_page_upload on storage.objects for delete to authenticated
using (bucket_id in ('page-drafts','page-public') and private.active_session()
  and split_part(name,'/',1) in (select p::text from private.my_exclusive_pages() p));

create policy require_active_playbook_uploader on storage.objects as restrictive for insert to authenticated
with check(bucket_id <> 'playbook-media' or private.active_session());

create function public.delete_my_account(confirmation text)
returns table(bucket text, path text) language plpgsql security definer set search_path='' as $$
declare caller uuid := auth.uid(); account_email text;
begin
  if confirmation is distinct from 'DELETE MY ACCOUNT' or not private.active_session() then
    raise exception 'Account deletion requires an active session and the exact confirmation phrase.';
  end if;
  select email into strict account_email from auth.users where id=caller for update;
  -- Membership and object inserts must not race the final empty check.
  lock table public.page_members in share row exclusive mode;
  lock table storage.objects in share mode;
  return query select o.bucket_id,o.name from storage.objects o
    where (o.bucket_id='playbook-media' and split_part(o.name,'/',1)=caller::text)
       or (o.bucket_id in ('page-drafts','page-public') and split_part(o.name,'/',1)
           in (select p::text from private.my_exclusive_pages() p))
    order by o.bucket_id,o.name limit 100;
  if found then return; end if;
  delete from private.page_invitations where lower(email)=lower(account_email);
  delete from public.creator_pages where id in (select private.my_exclusive_pages());
  delete from auth.users where id=caller;
end $$;
revoke all on function public.delete_my_account(text) from public,anon;
grant execute on function public.delete_my_account(text) to authenticated;
notify pgrst,'reload schema';
