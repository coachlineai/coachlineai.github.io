alter table public.coach_client_intake
  add column workout_styles text[], add column session_length text,
  add column food_allergies text[], add column other_food_allergy text,
  add column coaching_motivation text;

create function public.finish_coach_intake(
 ticket uuid, client_name text, client_sex text, weekly text, dob date,
 referral text, calorie_apps boolean, fitness_apps boolean, height numeric, weight numeric,
 has_trainer boolean, goal text, target_kg numeric, weekly_lb numeric, barrier text,
 styles text[], session_length text, allergies text[], other_food text, motivation text
) returns boolean language plpgsql security definer set search_path='' as $$
declare client public.coach_client_intake;
begin
 if styles is null or cardinality(styles) not between 1 and 6 or array_ndims(styles)<>1
   or array_position(styles,null) is not null or not styles <@ array['Free weights','Bodyweight (no weights)','Running','Gym machines','Walking','Help me choose']
   or ('Help me choose'=any(styles) and cardinality(styles)>1)
   or session_length is null or session_length not in ('15 minutes or less','20–30 minutes','30–45 minutes','45–60 minutes','An hour or more','It varies')
   or motivation is null or motivation not in ('Eat and live healthier','Boost my energy and mood','Stay motivated and consistent','Feel better about my body')
   or allergies is null or cardinality(allergies) not between 1 and 12 or array_ndims(allergies)<>1
   or array_position(allergies,null) is not null or not allergies <@ array['No known food allergies','Milk','Egg','Fish','Crustacean shellfish','Tree nuts','Peanuts','Wheat','Soy','Sesame','Other food allergy','I’m not sure']
   or (allergies && array['No known food allergies','I’m not sure'] and cardinality(allergies)>1)
   or (('Other food allergy'=any(allergies)) <> (nullif(btrim(other_food),'') is not null))
   or length(other_food)>160 then return false; end if;
 select * into client from public.coach_client_intake where invite=ticket and issued_at>=now()-interval '48 hours' for update;
 if not found then return false; end if;
 if client.completed_at is not null then
  return coalesce(client.workout_styles=styles and client.session_length=finish_coach_intake.session_length
   and client.food_allergies=allergies and client.other_food_allergy is not distinct from nullif(btrim(other_food),'')
   and client.coaching_motivation=motivation,false);
 end if;
 if not public.finish_coach_intake(ticket,client_name,client_sex,weekly,dob,referral,calorie_apps,fitness_apps,height,weight,has_trainer,goal,target_kg,weekly_lb,barrier) then return false; end if;
 update public.coach_client_intake set workout_styles=styles, session_length=finish_coach_intake.session_length,
 food_allergies=allergies, other_food_allergy=nullif(btrim(other_food),''), coaching_motivation=motivation where invite=ticket;
 return true;
end $$;
revoke all on function public.finish_coach_intake(uuid,text,text,text,date,text,boolean,boolean,numeric,numeric,boolean,text,numeric,numeric,text,text[],text,text[],text,text) from public;
grant execute on function public.finish_coach_intake(uuid,text,text,text,date,text,boolean,boolean,numeric,numeric,boolean,text,numeric,numeric,text,text[],text,text[],text,text) to anon,authenticated;

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
   'paceLbPerWeek',client.weekly_pace_lb,'barrier',client.coaching_barrier,
   'workoutStyles',client.workout_styles,'sessionLength',client.session_length,'foodAllergies',client.food_allergies,
   'otherFoodAllergy',client.other_food_allergy,'motivation',client.coaching_motivation);
 end if;
 if client.last_handle=handle then return jsonb_build_object('duplicate',true); end if;
 if client.issued_at < now()-interval '48 hours' then client.invite:=gen_random_uuid(); client.issued_at:=now(); end if;
 update public.coach_client_intake set last_handle=handle,invite=client.invite,issued_at=client.issued_at where creator_id=owner_id and phone=sender;
 return jsonb_build_object('invite',client.invite,'first',first_contact);
end $function$
;
