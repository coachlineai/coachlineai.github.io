alter table public.coach_pricing alter column annual_cents set default 38388;
update public.coach_pricing set annual_cents=38388 where annual_cents=38352;
