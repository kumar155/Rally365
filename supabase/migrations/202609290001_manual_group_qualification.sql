-- Manual qualification for Groups -> final tournaments.
alter table public.tournament_group_duos
  add column if not exists qualified boolean not null default false;

alter table public.tournament_groups
  add column if not exists qualification_confirmed boolean not null default false;

create index if not exists idx_tournament_group_duos_qualified
  on public.tournament_group_duos(group_id, qualified);
