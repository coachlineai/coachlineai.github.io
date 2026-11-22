create table public.playbook_items (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users on delete cascade,
 title text not null check (length(trim(title)) between 1 and 100),
 kind text not null check (kind in ('Photo','Video','Link')),
 topic text not null check (topic in ('Workout','Nutrition','Check-in','Promotion')),
 caption text not null default '' check (length(caption)<=1500),
 asset text not null,
 scheduled_at timestamptz,
 created_at timestamptz not null default now(),
 check (case when kind='Link' then asset ~ '^https://[^[:space:]]+$'
 else split_part(asset,'/',1)=owner_id::text end)
);
create index on public.playbook_items(owner_id, scheduled_at);
alter table public.playbook_items enable row level security;
revoke all on public.playbook_items from public, anon, authenticated;
grant select, insert, update on public.playbook_items to authenticated;
create policy "Creator manages own playbook" on public.playbook_items for all to authenticated
using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('playbook-media','playbook-media',false,26214400,array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime']);
create policy "Upload own playbook media" on storage.objects for insert to authenticated
with check(bucket_id='playbook-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Read own playbook media" on storage.objects for select to authenticated
using(bucket_id='playbook-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Clean up own playbook uploads" on storage.objects for delete to authenticated
using(bucket_id='playbook-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
