create or replace function rally_admin.edit_match_with_pin(p_group_id uuid, p_match_id uuid, p_pin text, p_team_a_score integer, p_team_b_score integer)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'rally_admin', 'extensions'
as $function$
declare
  v_hash text;
  v_old_a integer;
  v_old_b integer;
  v_exists boolean;
begin
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception 'Admin PIN must be exactly 6 digits';
  end if;

  if p_team_a_score < 0 or p_team_b_score < 0 or p_team_a_score = p_team_b_score then
    raise exception 'Final scores must be non-negative and different';
  end if;

  select admin_pin_hash into v_hash
  from rally_admin.group_settings
  where group_id = p_group_id;

  if v_hash is null or crypt(p_pin, v_hash) <> v_hash then
    raise exception 'Invalid admin PIN';
  end if;

  select exists(
    select 1 from public.matches
    where id = p_match_id and group_id = p_group_id and status <> 'VOIDED'
  ) into v_exists;

  if not v_exists then
    raise exception 'Match not found or already voided';
  end if;

  select team_a_score, team_b_score
    into v_old_a, v_old_b
  from public.matches
  where id = p_match_id and group_id = p_group_id
  for update;

  update public.matches
  set status = 'VALID',
      previous_team_a_score = v_old_a,
      previous_team_b_score = v_old_b,
      team_a_score = p_team_a_score,
      team_b_score = p_team_b_score,
      last_edited_at = now(),
      last_edited_by = 'Group Admin',
      edit_count = edit_count + 1
  where id = p_match_id and group_id = p_group_id;

  return jsonb_build_object(
    'success', true,
    'match_id', p_match_id,
    'previous_team_a_score', v_old_a,
    'previous_team_b_score', v_old_b,
    'team_a_score', p_team_a_score,
    'team_b_score', p_team_b_score
  );
end;
$function$;

create or replace function public.edit_match_with_pin(p_group_id uuid, p_match_id uuid, p_pin text, p_team_a_score integer, p_team_b_score integer)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'rally_admin', 'extensions'
as $function$
begin
  return rally_admin.edit_match_with_pin(
    p_group_id,
    p_match_id,
    p_pin,
    p_team_a_score,
    p_team_b_score
  );
end;
$function$;
