-- The annual field is the creator's reference price. Checkout charges 1/12, rounded to cents.
alter table public.coach_pricing
  alter column weekly_cents set default 799,
  alter column annual_cents set default 38352;
update public.coach_pricing set weekly_cents=799, annual_cents=38352
where weekly_cents=399 and annual_cents=14600 and one_time_cents=23000;
alter table public.coach_pricing
  add constraint coach_pricing_fixed_one_time check (one_time_cents=23000),
  add constraint coach_pricing_annual_reference_min check (annual_cents>=600);
