alter table public.coach_pricing
  add column annual_cents integer not null default 14600 check (annual_cents between 50 and 100000),
  add column one_time_cents integer not null default 23000 check (one_time_cents between 50 and 100000);
