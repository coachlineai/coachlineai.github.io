create table private.client_progress_links (
  digest bytea primary key, client_id uuid not null references public.coach_client_intake(client_key) on delete cascade,
  expires_at timestamptz not null
);
create index client_progress_expiry on private.client_progress_links(expires_at);
alter table private.client_progress_links enable row level security;
revoke all on private.client_progress_links from public,anon,authenticated;
alter table public.client_activity add column meal_nutrients jsonb;

create function public.issue_client_progress_link(client uuid) returns text
language plpgsql security definer set search_path='' as $$
declare secret text:=gen_random_uuid()::text;
begin
 if not exists(select from public.coach_client_intake c where c.client_key=client and c.completed_at is not null
   and not c.coaching_paused and c.coaching_processing_consent_at is not null and public.coach_has_paid_access(c.creator_id,c.phone)) then return null; end if;
 delete from private.client_progress_links where expires_at<=now();
 insert into private.client_progress_links values(sha256(convert_to(secret,'UTF8')),client,now()+interval '24 hours');
 return secret;
end $$;
revoke all on function public.issue_client_progress_link(uuid) from public,anon,authenticated;
grant execute on function public.issue_client_progress_link(uuid) to service_role;

create function private.progress_client(ticket uuid) returns uuid language sql stable security definer set search_path='' as $$
 select c.client_key from private.client_progress_links l join public.coach_client_intake c on c.client_key=l.client_id
 where l.digest=sha256(convert_to(ticket::text,'UTF8')) and l.expires_at>now() and not c.coaching_paused
 and c.coaching_processing_consent_at is not null and public.coach_has_paid_access(c.creator_id,c.phone)
$$;
revoke all on function private.progress_client(uuid) from public,anon,authenticated;

create function public.read_client_progress(ticket uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name',c.first_name,'goal',c.coaching_goal,'phone',s.phone_line,
 'adult',c.birth_date <= (current_date-interval '18 years')::date,
 'profile',case when c.birth_date <= (c.completed_at-interval '18 years')::date then jsonb_build_object(
 'age',extract(year from age(c.completed_at::date,c.birth_date)), 'sex',c.sex,'heightCm',c.height_cm,'weightKg',c.weight_kg,'workouts',c.workouts,
 'losing',c.coaching_goal='Lose weight','pace',coalesce(c.weekly_pace_lb,0)) end,
 'events',coalesce((select jsonb_agg(jsonb_build_object('kind',a.kind,'body',a.body,'at',a.created_at,'day',a.workout_date,
 'kcal',a.kcal,'macros',a.meal_nutrients) order by a.created_at,a.id) from public.client_activity a
 where a.client_id=c.client_key and (a.kind not in ('burn','meal_log') or c.birth_date <= (current_date-interval '18 years')::date) and a.kind in ('meal','workout','meal_log','burn','workout_done','checkin_note','review','friday')), '[]'::jsonb))
 from public.coach_client_intake c join public.coach_preview_sessions s using(creator_id) where c.client_key=private.progress_client(ticket)
$$;
revoke all on function public.read_client_progress(uuid) from public;
grant execute on function public.read_client_progress(uuid) to anon,authenticated;

create function public.log_client_meal(ticket uuid, entry uuid, meal text, day date, calories integer, protein numeric, carbs numeric, fat numeric)
returns boolean language plpgsql security definer set search_path='' as $$
declare id uuid:=private.progress_client(ticket);
begin
 if id is null or not exists(select from public.coach_client_intake where client_key=id and birth_date<=(current_date-interval '18 years')::date)
 or entry is null or meal is null or length(trim(meal)) not between 1 and 120 or day is null or day not between current_date-interval '2 years' and current_date+1
 or calories is null or calories not between 0 and 20000 or protein is null or protein not between 0 and 2000
 or carbs is null or carbs not between 0 and 2000 or fat is null or fat not between 0 and 2000 then return false; end if;
 insert into public.client_activity(client_id,event_key,kind,body,workout_date,kcal,meal_nutrients)
 values(id,'meal-log:'||entry,'meal_log',trim(meal),day,calories,jsonb_build_object('protein',protein,'carbs',carbs,'fat',fat))
 on conflict(client_id,event_key) do nothing;
 return true;
end $$;
revoke all on function public.log_client_meal(uuid,uuid,text,date,integer,numeric,numeric,numeric) from public;
grant execute on function public.log_client_meal(uuid,uuid,text,date,integer,numeric,numeric,numeric) to anon,authenticated;
