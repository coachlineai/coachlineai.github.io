begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null check(length(full_name) between 1 and 80),
 created_at timestamptz not null default now()
);
create table public.creator_pages (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check(slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
 draft jsonb not null default '{}'::jsonb check(jsonb_typeof(draft)='object' and octet_length(draft::text)<100000),
 version integer not null default 0,
 updated_at timestamptz not null default now()
);
create table public.page_members (
 page_id uuid not null references public.creator_pages(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 primary key(page_id,user_id)
);
create index page_members_user_idx on public.page_members(user_id);
create table public.published_pages (
 page_id uuid primary key references public.creator_pages(id) on delete cascade,
 slug text not null unique,
 content jsonb not null check(jsonb_typeof(content)='object' and octet_length(content::text)<100000),
 published_at timestamptz not null default now()
);
create table private.page_invitations (
 email text not null,
 page_id uuid not null references public.creator_pages(id) on delete cascade,
 primary key(email,page_id)
);
alter table public.profiles enable row level security;
alter table public.creator_pages enable row level security;
alter table public.page_members enable row level security;
alter table public.published_pages enable row level security;
alter table private.page_invitations enable row level security;
-- A live session check ensures revoked sessions cannot continue saving or publishing.
create function private.active_session() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from auth.sessions where id=(auth.jwt()->>'session_id')::uuid and user_id=auth.uid());
$$;
revoke all on function private.active_session() from public,anon;
grant execute on function private.active_session() to authenticated;
create policy profile_read on public.profiles for select to authenticated using(id=(select auth.uid()) and (select private.active_session()));
create policy profile_update on public.profiles for update to authenticated using(id=(select auth.uid()) and (select private.active_session())) with check(id=(select auth.uid()) and (select private.active_session()));
create policy member_read on public.page_members for select to authenticated using(user_id=(select auth.uid()) and (select private.active_session()));
create policy draft_read on public.creator_pages for select to authenticated using((select private.active_session()) and id in (select page_id from public.page_members where user_id=(select auth.uid())));
create policy draft_update on public.creator_pages for update to authenticated using((select private.active_session()) and id in (select page_id from public.page_members where user_id=(select auth.uid()))) with check((select private.active_session()) and id in (select page_id from public.page_members where user_id=(select auth.uid())));
create policy published_read on public.published_pages for select to anon,authenticated using(true);
create policy published_insert on public.published_pages for insert to authenticated with check((select private.active_session()) and page_id in(select page_id from public.page_members where user_id=(select auth.uid())));
create policy published_update on public.published_pages for update to authenticated using((select private.active_session()) and page_id in(select page_id from public.page_members where user_id=(select auth.uid()))) with check((select private.active_session()) and page_id in(select page_id from public.page_members where user_id=(select auth.uid())));
revoke all on public.profiles,public.creator_pages,public.page_members,public.published_pages from anon,authenticated;
grant select on public.published_pages to anon,authenticated;
grant select on public.profiles,public.creator_pages,public.page_members to authenticated;
grant update(full_name) on public.profiles to authenticated;
grant update(draft,version,updated_at) on public.creator_pages to authenticated;
grant insert,update on public.published_pages to authenticated;
-- Provision from a verified identity only. The invitation list is never user-editable.
create function private.provision_creator() returns trigger language plpgsql security definer set search_path='' as $$
declare pid uuid; nm text;
begin
 if new.email_confirmed_at is null then return new; end if;
 nm=left(coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),'Creator'),80);
 insert into public.profiles(id,full_name) values(new.id,nm) on conflict(id) do nothing;
 insert into public.page_members(page_id,user_id) select page_id,new.id from private.page_invitations where lower(email)=lower(new.email) on conflict do nothing;
 if not exists(select 1 from public.page_members where user_id=new.id) then
  insert into public.creator_pages(slug,draft) values('coach-'||replace(new.id::text,'-',''), jsonb_build_object('name',nm,'handle','','bio','','image','assets/coach.webp','position',0,'buttonLabel','Message my AI coach','phone','','socials','[]'::jsonb)) returning id into pid;
  insert into public.page_members(page_id,user_id) values(pid,new.id);
 end if;
 return new;
end; $$;
revoke all on function private.provision_creator() from public,anon,authenticated;
create trigger provision_creator after insert or update of email_confirmed_at,email on auth.users for each row execute function private.provision_creator();
create function public.save_page(p_id uuid,p_version integer,p_content jsonb) returns public.creator_pages language plpgsql security invoker set search_path='' as $$
declare result public.creator_pages;
begin
 update public.creator_pages set draft=p_content,version=version+1,updated_at=now() where id=p_id and version=p_version returning * into result;
 if result.id is null then raise exception 'Page changed or access denied. Reload before saving.'; end if;
 return result;
end; $$;
create function public.publish_page(p_id uuid,p_version integer,p_content jsonb) returns public.published_pages language plpgsql security invoker set search_path='' as $$
declare pg public.creator_pages; result public.published_pages;
begin
 select * into pg from public.creator_pages where id=p_id and version=p_version for update;
 if pg.id is null then raise exception 'Page changed or access denied. Save and retry.'; end if;
 insert into public.published_pages(page_id,slug,content) values(pg.id,pg.slug,p_content) on conflict(page_id) do update set content=excluded.content,slug=excluded.slug,published_at=now() returning * into result;
 return result;
end; $$;
revoke all on function public.save_page(uuid,integer,jsonb),public.publish_page(uuid,integer,jsonb) from public,anon;
grant execute on function public.save_page(uuid,integer,jsonb),public.publish_page(uuid,integer,jsonb) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('page-drafts','page-drafts',false,5242880,array['image/jpeg','image/png','image/webp']),
 ('page-public','page-public',true,5242880,array['image/jpeg','image/png','image/webp']);
create policy image_insert on storage.objects for insert to authenticated with check(bucket_id in('page-drafts','page-public') and (select private.active_session()) and (storage.foldername(name))[1] in(select page_id::text from public.page_members where user_id=(select auth.uid())));
create policy image_read on storage.objects for select to authenticated using(bucket_id in('page-drafts','page-public') and (select private.active_session()) and (storage.foldername(name))[1] in(select page_id::text from public.page_members where user_id=(select auth.uid())));
commit;
