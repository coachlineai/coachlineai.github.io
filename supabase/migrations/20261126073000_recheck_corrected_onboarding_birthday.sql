create or replace function public.check_coach_intake_age(ticket uuid, dob date)
returns text language plpgsql security definer set search_path='' as $$
declare
  client public.coach_client_intake;
  cutoff date := (current_date - interval '13 years')::date;
begin
  select * into client from public.coach_client_intake
    where invite=ticket and issued_at>=now()-interval '48 hours' for update;
  if not found or dob is null or dob not between date '1900-01-01' and current_date then
    return 'invalid';
  end if;
  if dob>cutoff then
    update public.coach_client_intake set eligible_on=(dob+interval '13 years')::date
      where invite=ticket and birth_date is null;
    return 'underage';
  end if;
  if client.birth_date>cutoff then return 'underage'; end if;
  -- A date entered on the picker is provisional until the profile is submitted.
  if client.birth_date is null and client.eligible_on is not null then
    update public.coach_client_intake set eligible_on=null where invite=ticket;
  end if;
  return 'eligible';
end $$;
