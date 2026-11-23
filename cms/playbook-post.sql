alter table public.playbook_items rename to post;
grant delete on public.post to authenticated;
-- Previously loaded dashboard versions can still read and save the same rows.
create view public.playbook_items with (security_invoker=true) as select * from public.post;
revoke all on public.playbook_items from public, anon, authenticated;
grant select, insert, update on public.playbook_items to authenticated;
notify pgrst, 'reload schema';
