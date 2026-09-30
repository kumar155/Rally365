alter table public.tournaments
  add column if not exists is_locked boolean not null default false;

create or replace function public.reject_locked_tournament_player_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.tournaments t
    where t.id = coalesce(new.tournament_id, old.tournament_id)
      and t.is_locked
  ) then
    raise exception 'Tournament is locked. Players cannot be added or removed.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists tournament_players_lock_guard on public.tournament_players;
create trigger tournament_players_lock_guard
before insert or update or delete on public.tournament_players
for each row execute function public.reject_locked_tournament_player_change();

create or replace function public.reject_locked_tournament_draw_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.tournaments t
    where t.id = coalesce(new.tournament_id, old.tournament_id)
      and t.is_locked
  ) then
    if tg_op = 'UPDATE'
       and new.tournament_id is not distinct from old.tournament_id
       and new.round_id is not distinct from old.round_id
       and new.match_number is not distinct from old.match_number
       and new.court is not distinct from old.court
       and new.scheduled_at is not distinct from old.scheduled_at
       and new.team_a_duo_id is not distinct from old.team_a_duo_id
       and new.team_b_duo_id is not distinct from old.team_b_duo_id
       and new.best_of is not distinct from old.best_of
       and new.group_id is not distinct from old.group_id
    then
      return new;
    end if;
    raise exception 'Tournament is locked. Draw structure cannot be changed.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists tournament_groups_lock_guard on public.tournament_groups;
create trigger tournament_groups_lock_guard
before insert or update or delete on public.tournament_groups
for each row execute function public.reject_locked_tournament_draw_change();

drop trigger if exists tournament_group_duos_lock_guard on public.tournament_group_duos;
create trigger tournament_group_duos_lock_guard
before insert or update or delete on public.tournament_group_duos
for each row execute function public.reject_locked_tournament_draw_change();

drop trigger if exists tournament_rounds_lock_guard on public.tournament_rounds;
create trigger tournament_rounds_lock_guard
before insert or update or delete on public.tournament_rounds
for each row execute function public.reject_locked_tournament_draw_change();

drop trigger if exists tournament_matches_lock_guard on public.tournament_matches;
create trigger tournament_matches_lock_guard
before insert or update or delete on public.tournament_matches
for each row execute function public.reject_locked_tournament_draw_change();

create or replace function public.reject_locked_tournament_config_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.is_locked and (
    new.name is distinct from old.name or
    new.venue is distinct from old.venue or
    new.start_date is distinct from old.start_date or
    new.format is distinct from old.format or
    new.partner_mode is distinct from old.partner_mode or
    new.rounds is distinct from old.rounds or
    new.group_count is distinct from old.group_count or
    new.qualifiers_per_group is distinct from old.qualifiers_per_group or
    new.games_per_match is distinct from old.games_per_match or
    new.entry_fee is distinct from old.entry_fee or
    new.description is distinct from old.description or
    new.courts is distinct from old.courts
  ) then
    raise exception 'Tournament is locked. Configuration cannot be changed.';
  end if;
  return new;
end;
$$;

drop trigger if exists tournaments_lock_guard on public.tournaments;
create trigger tournaments_lock_guard
before update on public.tournaments
for each row execute function public.reject_locked_tournament_config_change();
