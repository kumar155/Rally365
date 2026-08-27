create or replace function public.add_attendance_fine_with_pin(
  p_group_id uuid,
  p_player_id uuid,
  p_pin text,
  p_attendance_date date,
  p_status text,
  p_late_minutes integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attendance_id uuid;
  v_late_rate numeric;
  v_missed_rate numeric;
  v_fine_amount numeric;
begin
  if not coalesce(public.verify_admin_pin(p_group_id, p_pin), false) then
    raise exception using errcode = '42501', message = 'Invalid admin PIN';
  end if;

  if p_attendance_date is null then
    raise exception using errcode = '22023', message = 'Attendance date is required';
  end if;

  if p_status not in ('PRESENT', 'MISSED') then
    raise exception using errcode = '22023', message = 'Invalid attendance status';
  end if;

  if p_late_minutes < 0
    or p_late_minutes > 1440
    or (p_status = 'PRESENT' and p_late_minutes = 0)
    or (p_status = 'MISSED' and p_late_minutes <> 0)
  then
    raise exception using errcode = '22023', message = 'Invalid late minutes';
  end if;

  if not exists (
    select 1
    from public.players
    where id = p_player_id and group_id = p_group_id
  ) then
    raise exception using errcode = '22023', message = 'Player is not in this group';
  end if;

  select late_per_minute, missed_day_fine
  into v_late_rate, v_missed_rate
  from public.group_rates
  where group_id = p_group_id;

  if not found or v_late_rate < 0 or v_missed_rate < 0 then
    raise exception using errcode = '22023', message = 'Invalid group fine rates';
  end if;

  v_fine_amount := case
    when p_status = 'PRESENT' then p_late_minutes * v_late_rate
    else v_missed_rate
  end;

  insert into public.attendance (
    group_id,
    player_id,
    attendance_date,
    status,
    late_minutes,
    fine_amount
  )
  values (
    p_group_id,
    p_player_id,
    p_attendance_date,
    p_status,
    p_late_minutes,
    v_fine_amount
  )
  returning id into v_attendance_id;

  return v_attendance_id;
end;
$$;

create or replace function public.add_expense_with_pin(
  p_group_id uuid,
  p_pin text,
  p_expense_date date,
  p_category text,
  p_amount numeric,
  p_description text,
  p_player_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense_id uuid;
  v_player_count integer;
  v_base_share numeric;
begin
  if not coalesce(public.verify_admin_pin(p_group_id, p_pin), false) then
    raise exception using errcode = '42501', message = 'Invalid admin PIN';
  end if;

  if p_expense_date is null then
    raise exception using errcode = '22023', message = 'Expense date is required';
  end if;

  if p_category not in ('SHUTTLES', 'BREAKFAST', 'COFFEE', 'OTHER') then
    raise exception using errcode = '22023', message = 'Invalid expense category';
  end if;

  if p_amount is null
    or p_amount <= 0
    or p_amount > 1000000
    or p_amount <> round(p_amount, 2)
  then
    raise exception using errcode = '22023', message = 'Invalid expense amount';
  end if;

  if p_description is not null and length(p_description) > 500 then
    raise exception using errcode = '22023', message = 'Expense description is too long';
  end if;

  v_player_count := cardinality(p_player_ids);

  if v_player_count is null or v_player_count < 1 or v_player_count > 64 then
    raise exception using errcode = '22023', message = 'Invalid expense split';
  end if;

  if (
    select count(distinct player_id)
    from unnest(p_player_ids) as selected_players(player_id)
  ) <> v_player_count then
    raise exception using errcode = '22023', message = 'Expense split contains duplicate players';
  end if;

  if exists (
    select 1
    from unnest(p_player_ids) as selected_players(player_id)
    left join public.players
      on players.id = selected_players.player_id
      and players.group_id = p_group_id
    where players.id is null
  ) then
    raise exception using errcode = '22023', message = 'Expense split contains a player outside this group';
  end if;

  insert into public.expenses (
    group_id,
    expense_date,
    category,
    amount,
    description
  )
  values (
    p_group_id,
    p_expense_date,
    p_category,
    p_amount,
    nullif(trim(p_description), '')
  )
  returning id into v_expense_id;

  v_base_share := trunc(p_amount / v_player_count, 2);

  insert into public.expense_splits (expense_id, player_id, share_amount)
  select
    v_expense_id,
    selected_players.player_id,
    case
      when selected_players.position = v_player_count
        then p_amount - (v_base_share * (v_player_count - 1))
      else v_base_share
    end
  from unnest(p_player_ids) with ordinality
    as selected_players(player_id, position);

  return v_expense_id;
end;
$$;

revoke execute on function public.add_attendance_fine_with_pin(uuid, uuid, text, date, text, integer) from public;
revoke execute on function public.add_expense_with_pin(uuid, text, date, text, numeric, text, uuid[]) from public;

grant execute on function public.add_attendance_fine_with_pin(uuid, uuid, text, date, text, integer) to anon, authenticated;
grant execute on function public.add_expense_with_pin(uuid, text, date, text, numeric, text, uuid[]) to anon, authenticated;

revoke insert, update, delete on public.attendance from anon, authenticated;
revoke insert, update, delete on public.expenses from anon, authenticated;
revoke insert, update, delete on public.expense_splits from anon, authenticated;
