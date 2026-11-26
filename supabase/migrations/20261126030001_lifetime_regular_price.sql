alter table public.coach_pricing drop constraint coach_pricing_fixed_one_time;
alter table public.coach_pricing alter column one_time_cents set default 12000;
update public.coach_pricing set one_time_cents=12000 where one_time_cents=23000;
alter table public.coach_pricing add constraint coach_pricing_fixed_one_time check (one_time_cents=12000);
