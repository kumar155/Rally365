create extension if not exists pgcrypto;

create table if not exists public.tournament_player_directory (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (display_name)
);

alter table public.tournament_players
  add column if not exists directory_player_id uuid;

insert into public.tournament_player_directory (display_name, avatar_url)
select distinct tp.display_name, tp.avatar_url
from public.tournament_players tp
where tp.display_name is not null
on conflict (display_name) do update
set avatar_url = coalesce(public.tournament_player_directory.avatar_url, excluded.avatar_url),
    updated_at = now();

update public.tournament_players tp
set directory_player_id = d.id
from public.tournament_player_directory d
where tp.directory_player_id is null
  and d.display_name = tp.display_name;

alter table public.tournament_players
  alter column directory_player_id set not null;

create index if not exists idx_tournament_player_directory_name
  on public.tournament_player_directory(display_name);
create index if not exists idx_tournament_players_directory
  on public.tournament_players(directory_player_id);
create unique index if not exists uq_tournament_players_tournament_directory
  on public.tournament_players(tournament_id, directory_player_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tournament_players_directory_player_id_fkey'
      and conrelid = 'public.tournament_players'::regclass
  ) then
    alter table public.tournament_players
      add constraint tournament_players_directory_player_id_fkey
      foreign key (directory_player_id)
      references public.tournament_player_directory(id)
      on delete restrict;
  end if;
end $$;

-- Remove tournament-only rows accidentally inserted into the core players table
-- by the previous tournament player flow. Only unreferenced rows from the
-- observed import window are removed.
delete from public.players p
where p.created_at >= '2026-09-27 02:49:47+00'
  and exists (
    select 1 from public.tournament_player_directory d
    where d.display_name = p.name
  )
  and not exists (select 1 from public.match_players mp where mp.player_id = p.id)
  and not exists (select 1 from public.attendance a where a.player_id = p.id)
  and not exists (select 1 from public.fines f where f.player_id = p.id)
  and not exists (select 1 from public.expense_splits es where es.player_id = p.id)
  and not exists (select 1 from public.payments pay where pay.player_id = p.id)
  and not exists (
    select 1 from public.duo_schedule_matches dm
    where dm.team_a_player_1 = p.id
       or dm.team_a_player_2 = p.id
       or dm.team_b_player_1 = p.id
       or dm.team_b_player_2 = p.id
  );
