alter table public.coach_client_intake
 add column client_key uuid not null default gen_random_uuid() unique,
 add column photo_claimed_at timestamptz,
 add column photo_requested_at timestamptz,
 add column photo_saved_at timestamptz,
 add column photo_skipped_at timestamptz;
alter table public.coaching_orders add column payment_intent_id text;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('client-progress','client-progress',false,8388608,array['image/jpeg','image/png','image/webp','image/heic']);
create policy "Creator reads own client progress photos" on storage.objects for select to authenticated
 using(bucket_id='client-progress' and (storage.foldername(name))[1]=(select auth.uid())::text);

create function public.claim_before_photo_request(owner_id uuid, sender text)
returns boolean language sql set search_path='' as $$
 with claimed as (update public.coach_client_intake set photo_claimed_at=now()
 where creator_id=owner_id and phone=sender and completed_at is not null
 and birth_date<=current_date-interval '18 years' and photo_requested_at is null
 and photo_saved_at is null and photo_skipped_at is null
 and (photo_claimed_at is null or photo_claimed_at<now()-interval '5 minutes')
 and public.coach_has_paid_access(owner_id,sender) returning 1)
 select exists(select 1 from claimed);
$$;
revoke all on function public.claim_before_photo_request(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_before_photo_request(uuid,text) to service_role;

create function public.creator_client_roster()
returns table(id uuid,name text,digits text,joined_at timestamptz,mission text,goal text,
 payment text,plan text,amount integer,photo text)
language sql stable security definer set search_path='' as $$
 select i.client_key, i.first_name,right(i.phone,4),i.completed_at,i.coaching_motivation,i.coaching_goal,
 case when o.valid then 'Paid' when o.state='ended' or o.state='active' then 'Ended' else 'Awaiting payment' end,
 o.plan,o.amount_cents,case when i.photo_saved_at is not null then 'Received'
 when i.photo_skipped_at is not null then 'Skipped' when i.photo_requested_at is not null then 'Requested' else 'Not requested' end
 from public.coach_client_intake i
 left join lateral (select b.*, (b.state='active' and (b.plan='once' or b.paid_through>now())) is true as valid
 from public.coaching_orders b where b.creator_id=i.creator_id and b.client_phone=i.phone
 order by valid desc,b.created_at desc limit 1) o on true
 where i.creator_id=(select auth.uid()) and i.completed_at is not null order by i.completed_at desc,i.client_key;
$$;
create function public.creator_client_summary(client uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name',i.first_name,'joined',i.completed_at,'mission',i.coaching_motivation,
 'goal',i.coaching_goal,'age',extract(year from age(i.birth_date)),'sex',i.sex,'workouts',i.workouts,
 'height',i.height_cm,'weight',i.weight_kg,'target',i.target_weight_kg,'pace',i.weekly_pace_lb,
 'barrier',i.coaching_barrier,'styles',i.workout_styles,'length',i.session_length,'allergies',i.food_allergies,
 'otherAllergy',i.other_food_allergy,'trainer',i.has_trainer,'referral',i.referral_source,
 'calorieApps',i.tried_calorie_apps,'fitnessApps',i.tried_fitness_apps)
 from public.coach_client_intake i where i.creator_id=(select auth.uid()) and i.client_key=client and i.completed_at is not null;
$$;
revoke all on function public.creator_client_roster(),public.creator_client_summary(uuid) from public,anon;
grant execute on function public.creator_client_roster(),public.creator_client_summary(uuid) to authenticated;
