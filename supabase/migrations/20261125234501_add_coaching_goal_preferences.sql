alter table public.coach_client_intake
  add column has_trainer boolean,
  add column coaching_goal text,
  add column target_weight_kg numeric,
  add column weekly_pace_lb numeric,
  add column coaching_barrier text;

create function public.finish_coach_intake(
 ticket uuid, client_name text, client_sex text, weekly text, dob date,
 referral text, calorie_apps boolean, fitness_apps boolean, height numeric, weight numeric,
 has_trainer boolean, goal text, target_kg numeric, weekly_lb numeric, barrier text
) returns boolean language plpgsql security definer set search_path='' as $$
declare client public.coach_client_intake;
begin
 if has_trainer is null or goal is null or barrier is null or barrier not in
   ('Lack of consistency','Unhealthy eating habits','Lack of support','Busy schedule','Lack of meal inspiration')
   then return false; end if;
 if dob > (current_date-interval '18 years')::date then
  if goal not in ('Build strength','Build endurance','Build a routine') then return false; end if;
 elsif goal not in ('Lose weight','Maintain','Gain weight') then return false;
 end if;
 if goal in ('Lose weight','Gain weight') then
  if target_kg is null or target_kg not between 15 and 500 or weekly_lb is null
   or weekly_lb not between 0.1 and 2 or weekly_lb<>round(weekly_lb,1)
   or (goal='Lose weight' and (target_kg>=weight or target_kg<round(18.5*(height/100)^2,5)))
   or (goal='Gain weight' and (target_kg<=weight or weekly_lb>1)) then return false; end if;
 elsif target_kg is not null or weekly_lb is not null then return false;
 end if;
 select * into client from public.coach_client_intake where invite=ticket and issued_at >= now()-interval '48 hours' for update;
 if not found then return false; end if;
 if client.birth_date is not null and (client.birth_date<>dob or client.weight_kg<>weight or client.height_cm<>height) then return false; end if;
 if not public.finish_coach_intake(ticket,client_name,client_sex,weekly,dob,referral,calorie_apps,fitness_apps,height,weight) then return false; end if;
 update public.coach_client_intake set has_trainer=finish_coach_intake.has_trainer,coaching_goal=goal,
  target_weight_kg=target_kg,weekly_pace_lb=weekly_lb,coaching_barrier=barrier
 where invite=ticket and coaching_goal is null;
 return true;
end $$;
revoke all on function public.finish_coach_intake(uuid,text,text,text,date,text,boolean,boolean,numeric,numeric,boolean,text,numeric,numeric,text) from public;
grant execute on function public.finish_coach_intake(uuid,text,text,text,date,text,boolean,boolean,numeric,numeric,boolean,text,numeric,numeric,text) to anon,authenticated;

CREATE OR REPLACE FUNCTION public.coach_intake_gate(owner_id uuid, sender text, handle text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare client public.coach_client_intake; first_contact boolean;
begin
 insert into public.coach_client_intake(creator_id,phone) values(owner_id,sender) on conflict do nothing;
 first_contact := found;
 select * into strict client from public.coach_client_intake where creator_id=owner_id and phone=sender for update;
 if client.completed_at is not null and client.birth_date is not null then
  return jsonb_build_object('ready',true,'name',client.first_name,'workouts',client.workouts,'sex',client.sex,'age',extract(year from age(current_date,client.birth_date)), 'heightCm',client.height_cm,'weightKg',client.weight_kg,
   'goal',client.coaching_goal,'trainer',client.has_trainer,'targetKg',client.target_weight_kg,
   'paceLbPerWeek',client.weekly_pace_lb,'barrier',client.coaching_barrier);
 end if;
 if client.last_handle=handle then return jsonb_build_object('duplicate',true); end if;
 if client.issued_at < now()-interval '48 hours' then client.invite:=gen_random_uuid(); client.issued_at:=now(); end if;
 update public.coach_client_intake set last_handle=handle,invite=client.invite,issued_at=client.issued_at where creator_id=owner_id and phone=sender;
 return jsonb_build_object('invite',client.invite,'first',first_contact);
end $function$;
