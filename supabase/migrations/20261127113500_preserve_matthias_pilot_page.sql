create table private.pilot_page_backup as
select c.id as original_page_id,c.slug,c.draft,c.version,p.content as published_content,p.published_at,now() as saved_at
from public.creator_pages c join public.published_pages p on p.page_id=c.id and p.slug=c.slug
where c.slug='matthias';
alter table private.pilot_page_backup add primary key(slug);
alter table private.pilot_page_backup enable row level security;
revoke all on private.pilot_page_backup from public,anon,authenticated;
