create table private.pilot_lifetime_offers(client_id uuid primary key references public.coach_client_intake(client_key) on delete cascade);
alter table private.pilot_lifetime_offers enable row level security;
revoke all on private.pilot_lifetime_offers from public,anon,authenticated;
create function public.pilot_lifetime_quote(client uuid,reserve boolean) returns int language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(7026140);
 if exists(select from private.pilot_lifetime_offers where client_id=client) then return 9999; end if;
 if (select count(*) from private.pilot_lifetime_offers)>=5 then return 12000; end if;
 if reserve then insert into private.pilot_lifetime_offers values(client); end if;
 return 9999;
end $$;
revoke all on function public.pilot_lifetime_quote(uuid,boolean) from public,anon,authenticated;
grant execute on function public.pilot_lifetime_quote(uuid,boolean) to service_role;
create or replace function public.creator_client_roster()
returns table(id uuid,name text,digits text,joined_at timestamptz,mission text,goal text,
 payment text,plan text,amount integer,photo text)
language sql stable security definer set search_path='' as $$
 select i.client_key, i.first_name,right(i.phone,4),i.completed_at,i.coaching_motivation,i.coaching_goal,
 case when t.client_id is not null then 'Sandbox payment' when o.valid then 'Paid' when o.state='ended' or o.state='active' then 'Ended' else 'Awaiting payment' end,
 coalesce(t.plan,o.plan),coalesce(t.amount,o.amount_cents),case when i.photo_saved_at is not null then 'Received'
 when i.photo_skipped_at is not null then 'Skipped' when i.photo_requested_at is not null then 'Requested' else 'Not requested' end
 from public.coach_client_intake i
 left join private.pilot_checkouts t on t.client_id=i.client_key
 left join lateral (select b.*, (b.state='active' and (b.plan='once' or b.paid_through>now())) is true as valid
 from public.coaching_orders b where b.creator_id=i.creator_id and b.client_phone=i.phone
 order by valid desc,b.created_at desc limit 1) o on true
 where i.creator_id=(select auth.uid()) and i.completed_at is not null order by i.completed_at desc,i.client_key;
$$;
