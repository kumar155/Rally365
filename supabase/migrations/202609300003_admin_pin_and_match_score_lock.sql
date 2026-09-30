create extension if not exists pgcrypto with schema extensions;

alter table public.tournaments
  add column if not exists admin_pin_hash text;

create or replace function public.admin_lock_tournament(
  p_tournament_id uuid,
  p_pin text,
  p_action text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  existing_hash text;
  supplied_hash text;
begin
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception 'Admin PIN must be exactly 6 digits.';
  end if;

  if upper(p_action) not in ('LOCK', 'UNLOCK') then
    raise exception 'Invalid admin lock action.';
  end if;

  select admin_pin_hash
    into existing_hash
    from public.tournaments
   where id = p_tournament_id
   for update;

  if not found then
    raise exception 'Tournament not found.';
  end if;

  supplied_hash := encode(extensions.digest(p_pin, 'sha256'), 'hex');

  if existing_hash is null then
    -- The first lock establishes the tournament's 6-digit admin PIN.
    update public.tournaments
       set admin_pin_hash = supplied_hash,
           is_locked = true
     where id = p_tournament_id;
    return true;
  end if;

  if existing_hash <> supplied_hash then
    raise exception 'Invalid admin PIN.';
  end if;

  perform set_config('rally365.admin_lock_change', '1', true);

  update public.tournaments
     set is_locked = (upper(p_action) = 'LOCK')
   where id = p_tournament_id;

  return true;
end;
$$;

revoke all on function public.admin_lock_tournament(uuid, text, text) from public;
grant execute on function public.admin_lock_tournament(uuid, text, text) to anon, authenticated;

create or replace function public.reject_locked_tournament_config_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_locked is distinct from old.is_locked
     and coalesce(current_setting('rally365.admin_lock_change', true), '') <> '1' then
    raise exception 'Tournament lock state can only be changed with the admin PIN.';
  end if;

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
    new.courts is distinct from old.courts or
    new.admin_pin_hash is distinct from old.admin_pin_hash
  ) then
    raise exception 'Tournament is locked. Configuration cannot be changed.';
  end if;

  return new;
end;
$$;

create or replace function public.reject_completed_match_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tournament_locked boolean;
begin
  if tg_op = 'UPDATE' and old.status = 'COMPLETED' then
    if new.team_a_score is distinct from old.team_a_score
       or new.team_b_score is distinct from old.team_b_score
       or new.status is distinct from old.status
       or new.winner_duo_id is distinct from old.winner_duo_id
       or new.team_a_duo_id is distinct from old.team_a_duo_id
       or new.team_b_duo_id is distinct from old.team_b_duo_id then
      select is_locked into tournament_locked
        from public.tournaments
       where id = old.tournament_id;

      if coalesce(tournament_locked, false) = true then
        raise exception 'Tournament is locked. Completed match scores cannot be changed.';
      end if;

      if coalesce(current_setting('rally365.admin_match_change', true), '') <> '1' then
        raise exception 'Match score is locked. Admin PIN is required for corrections.';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' and old.status = 'COMPLETED' then
    if coalesce(current_setting('rally365.admin_match_change', true), '') <> '1' then
      raise exception 'Completed matches cannot be deleted without the admin PIN.';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists tournament_completed_match_lock_guard on public.tournament_matches;
create trigger tournament_completed_match_lock_guard
before update or delete on public.tournament_matches
for each row execute function public.reject_completed_match_change();

create or replace function public.admin_correct_match_score(
  p_match_id uuid,
  p_pin text,
  p_team_a_score integer,
  p_team_b_score integer,
  p_winner_duo_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tournament_id uuid;
  expected_hash text;
  supplied_hash text;
begin
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception 'Admin PIN must be exactly 6 digits.';
  end if;

  select m.tournament_id, t.admin_pin_hash
    into tournament_id, expected_hash
    from public.tournament_matches m
    join public.tournaments t on t.id = m.tournament_id
   where m.id = p_match_id;

  if tournament_id is null then
    raise exception 'Match not found.';
  end if;

  if expected_hash is null then
    raise exception 'Admin PIN is not configured for this tournament.';
  end if;

  supplied_hash := encode(extensions.digest(p_pin, 'sha256'), 'hex');
  if expected_hash <> supplied_hash then
    raise exception 'Invalid admin PIN.';
  end if;

  perform set_config('rally365.admin_match_change', '1', true);

  update public.tournament_matches
     set team_a_score = p_team_a_score,
         team_b_score = p_team_b_score,
         status = 'COMPLETED',
         winner_duo_id = p_winner_duo_id
   where id = p_match_id;

  return true;
end;
$$;

revoke all on function public.admin_correct_match_score(uuid, text, integer, integer, uuid) from public;
grant execute on function public.admin_correct_match_score(uuid, text, integer, integer, uuid) to anon, authenticated;
