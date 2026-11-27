create function private.ensure_client_coach() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.coach_preview_sessions(creator_id) values(new.creator_id) on conflict do nothing;
 return new;
end $$;
revoke all on function private.ensure_client_coach() from public,anon,authenticated;
create trigger ensure_client_coach after insert on private.client_contact_requests for each row execute function private.ensure_client_coach();
create function public.client_dashboard_image(ticket uuid, event_id bigint default null) returns text language sql stable security definer set search_path='' as $$
 select case when event_id is null and c.photo_saved_at is not null then c.creator_id||'/'||c.client_key||'/before'
 else (select asset from public.client_activity where client_id=c.client_key and id=event_id and kind='progress') end
 from public.coach_client_intake c where c.client_key=private.progress_client(ticket) and c.birth_date<=current_date-interval '18 years'
$$;
revoke all on function public.client_dashboard_image(uuid,bigint) from public,anon,authenticated;
grant execute on function public.client_dashboard_image(uuid,bigint) to service_role;
create function public.creator_reported_statuses() returns table(client_id uuid,status text,reported_at timestamptz)
language sql stable security definer set search_path='' as $$
 select distinct on (a.client_id) a.client_id,case a.kind when 'meal_log' then 'Meal logged' when 'workout_done' then 'Finished workout' else a.body end,a.created_at
 from public.client_activity a join public.coach_client_intake c on c.client_key=a.client_id
 where c.creator_id=auth.uid() and a.kind in ('meal_log','workout_done','client_status') order by a.client_id,a.id desc;
$$;
revoke all on function public.creator_reported_statuses() from public,anon;
grant execute on function public.creator_reported_statuses() to authenticated;
create or replace function public.read_client_progress(ticket uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name',c.first_name,'goal',c.coaching_goal,'phone',coalesce(public.pilot_contact_line(c.creator_id,c.phone),s.phone_line),'baseline',c.photo_saved_at is not null,
 'adult',c.birth_date <= (current_date-interval '18 years')::date,
 'profile',case when c.birth_date <= (c.completed_at-interval '18 years')::date then jsonb_build_object(
 'age',extract(year from age(c.completed_at::date,c.birth_date)), 'sex',c.sex,'heightCm',c.height_cm,'weightKg',c.weight_kg,'workouts',c.workouts,
 'losing',c.coaching_goal='Lose weight','pace',coalesce(c.weekly_pace_lb,0)) end,
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'body',a.body,'at',a.created_at,'day',a.workout_date,
 'kcal',a.kcal,'macros',a.meal_nutrients) order by a.created_at,a.id) from public.client_activity a
 where a.client_id=c.client_key and (a.kind not in ('burn','meal_log') or c.birth_date <= (current_date-interval '18 years')::date) and a.kind in ('meal','workout','meal_log','burn','workout_done','checkin_note','review','friday','progress','client_status')), '[]'::jsonb))
 from public.coach_client_intake c join public.coach_preview_sessions s using(creator_id) where c.client_key=private.progress_client(ticket)
$$;
