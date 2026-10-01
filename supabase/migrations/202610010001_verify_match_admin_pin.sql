create or replace function public.verify_match_admin_pin(
  p_match_id uuid,
  p_pin text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  expected_hash text;
  supplied_hash text;
  tournament_locked boolean;
begin
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception 'Admin PIN must be exactly 6 digits.';
  end if;

  select t.admin_pin_hash, t.is_locked
    into expected_hash, tournament_locked
    from public.tournament_matches m
    join public.tournaments t on t.id = m.tournament_id
   where m.id = p_match_id;

  if expected_hash is null then
    raise exception 'Admin PIN is not configured for this tournament.';
  end if;

  if coalesce(tournament_locked, false) then
    raise exception 'Tournament is locked. Unlock the tournament before correcting a score.';
  end if;

  supplied_hash := encode(extensions.digest(p_pin, 'sha256'), 'hex');

  if expected_hash <> supplied_hash then
    raise exception 'Invalid admin PIN.';
  end if;

  return true;
end;
$$;

revoke all on function public.verify_match_admin_pin(uuid, text) from public;
grant execute on function public.verify_match_admin_pin(uuid, text) to anon, authenticated;
