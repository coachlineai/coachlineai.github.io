create function public.pilot_dashboard_counts() returns jsonb
language sql stable security definer set search_path='' as $$
  with eligible as (
    select c.client_key,c.creator_id,c.phone
    from public.coach_client_intake c
    where c.completed_at is not null and (
      exists(select 1 from public.coaching_orders o where o.creator_id=c.creator_id and o.client_phone=c.phone and o.state='active')
      or exists(select 1 from public.client_activity a where a.client_id=c.client_key and a.kind='pilot_welcome')
    )
  )
  select jsonb_build_object(
    'filled',count(distinct phone),
    'mine',count(distinct phone) filter(where creator_id=auth.uid()),
    'active',count(distinct phone) filter(where creator_id=auth.uid() and exists(
      select 1 from public.client_activity a where a.client_id=eligible.client_key
      and a.kind in ('client','pilot_client','burn','progress','workout_done','checkin_note','meal_log','burn_file')
      and a.created_at>=now()-interval '7 days')))
  from eligible where exists(select 1 from public.profiles where id=auth.uid());
$$;
revoke all on function public.pilot_dashboard_counts() from public,anon;
grant execute on function public.pilot_dashboard_counts() to authenticated;
