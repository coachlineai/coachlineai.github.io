alter table public.coach_client_intake
  add column birth_date date,
  add column eligible_on date,
  add column referral_source text,
  add column tried_calorie_apps boolean,
  add column tried_fitness_apps boolean,
  add column height_cm numeric,
  add column weight_kg numeric;

-- Old setup links use the same ticket, but completion now requires the expanded intake.
drop function public.finish_coach_intake(uuid,text,text,text);

create function public.finish_coach_intake(
 ticket uuid, client_name text, client_sex text, weekly text, dob date,
 referral text, calorie_apps boolean, fitness_apps boolean, height numeric, weight numeric
) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if client_name is null or length(trim(client_name)) not between 1 and 60 or client_name ~ '[[:cntrl:]]'
    or client_sex is null or client_sex not in ('Male','Female','Other','Prefer not to say')
    or weekly is null or weekly not in ('0–2','3–5','6+')
    or dob is null or not isfinite(dob) or dob < date '1900-01-01' or dob > (current_date - interval '13 years')::date
    or referral is null or referral not in ('TikTok','X','Google','YouTube','Instagram','Friend or family','Other')
    or calorie_apps is null or fitness_apps is null
    or height is null or height not between 60 and 275
    or weight is null or weight not between 15 and 500 then return false;
 end if;
 update public.coach_client_intake
 set first_name=trim(client_name), sex=client_sex, workouts=weekly, birth_date=dob,
     referral_source=referral, tried_calorie_apps=calorie_apps, tried_fitness_apps=fitness_apps,
     height_cm=height, weight_kg=weight, completed_at=now()
 where invite=ticket and (eligible_on is null or eligible_on<=current_date) and birth_date is null and issued_at>=now()-interval '48 hours';
 return found or exists(select 1 from public.coach_client_intake where invite=ticket
    and completed_at is not null and birth_date is not null and issued_at>=now()-interval '48 hours');
end $$;
revoke all on function public.finish_coach_intake(uuid,text,text,text,date,text,boolean,boolean,numeric,numeric) from public;
grant execute on function public.finish_coach_intake(uuid,text,text,text,date,text,boolean,boolean,numeric,numeric) to anon, authenticated;

create or replace function public.coach_intake_gate(owner_id uuid, sender text, handle text)
returns jsonb language plpgsql set search_path='' as $$
declare client public.coach_client_intake; first_contact boolean;
begin
 insert into public.coach_client_intake(creator_id,phone) values(owner_id,sender) on conflict do nothing;
 first_contact := found;
 select * into strict client from public.coach_client_intake where creator_id=owner_id and phone=sender for update;
 if client.completed_at is not null and client.birth_date is not null then
  return jsonb_build_object('ready',true,'name',client.first_name,'workouts',client.workouts,'sex',client.sex,'age',extract(year from age(current_date,client.birth_date)), 'heightCm',client.height_cm,'weightKg',client.weight_kg);
 end if;
 if client.last_handle=handle then return jsonb_build_object('duplicate',true); end if;
 if client.issued_at < now()-interval '48 hours' then client.invite:=gen_random_uuid(); client.issued_at:=now(); end if;
 update public.coach_client_intake set last_handle=handle,invite=client.invite,issued_at=client.issued_at where creator_id=owner_id and phone=sender;
 return jsonb_build_object('invite',client.invite,'first',first_contact);
end $$;

create function public.check_coach_intake_age(ticket uuid,dob date)
returns text language plpgsql security definer set search_path='' as $$
declare client public.coach_client_intake;
begin
 select * into client from public.coach_client_intake where invite=ticket and issued_at>=now()-interval '48 hours' for update;
 if not found or dob is null or dob not between date '1900-01-01' and current_date then return 'invalid'; end if;
 if client.eligible_on>current_date then return 'underage'; end if;
 if dob>(current_date-interval '13 years')::date then
  update public.coach_client_intake set eligible_on=(dob+interval '13 years')::date
  where invite=ticket and birth_date is null;
  return 'underage';
 end if;
 return 'eligible';
end $$;
revoke all on function public.check_coach_intake_age(uuid,date) from public;
grant execute on function public.check_coach_intake_age(uuid,date) to anon, authenticated;
