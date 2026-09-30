create or replace function public.reject_locked_tournament_config_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.is_locked is distinct from old.is_locked or new.admin_pin_hash is distinct from old.admin_pin_hash)
     and coalesce(current_setting('rally365.admin_lock_change', true), '') <> '1' then
    raise exception 'Tournament lock credentials can only be changed with the admin PIN.';
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
    new.courts is distinct from old.courts
  ) then
    raise exception 'Tournament is locked. Configuration cannot be changed.';
  end if;

  return new;
end;
$$;
