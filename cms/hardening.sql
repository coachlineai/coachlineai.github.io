create or replace function private.provision_creator() returns trigger language plpgsql security definer set search_path='' as $$
declare pid uuid; nm text;
begin
 if new.email_confirmed_at is null then return new; end if;
 nm=left(coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),'Creator'),80);
 insert into public.profiles(id,full_name) values(new.id,nm) on conflict(id) do nothing;
 insert into public.page_members(page_id,user_id) select page_id,new.id from private.page_invitations where lower(email)=lower(new.email) on conflict do nothing;
 if not exists(select 1 from public.page_members where user_id=new.id) then
  insert into public.creator_pages(slug,draft) values('coach-'||replace(new.id::text,'-',''), jsonb_build_object('name',nm,'handle','','bio','','image','assets/creator-placeholder.webp','position',0,'buttonLabel','Message my AI coach','phone','','socials','[]'::jsonb)) returning id into pid;
  insert into public.page_members(page_id,user_id) values(pid,new.id);
 end if;
 return new;
end; $$;

create policy published_slug_guard on public.published_pages as restrictive for all to authenticated using(true) with check(exists(select 1 from public.creator_pages p where p.id=page_id and p.slug=published_pages.slug));
