alter table public.playbook_items
  add column coach_guidance text not null default ''
  check (length(coach_guidance) <= 1500);
