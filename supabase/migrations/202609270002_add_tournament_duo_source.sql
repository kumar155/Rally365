alter table public.tournament_duos
  add column if not exists source text not null default 'RANDOM';

alter table public.tournament_duos
  drop constraint if exists tournament_duos_source_check;

alter table public.tournament_duos
  add constraint tournament_duos_source_check
  check (source in ('RANDOM','FIXED'));
