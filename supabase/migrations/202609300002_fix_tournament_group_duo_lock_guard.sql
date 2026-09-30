-- tournament_group_duos does not have tournament_id, so it cannot use
-- reject_locked_tournament_draw_change(), which reads NEW/OLD.tournament_id.
-- Resolve the tournament through tournament_groups instead.

create or replace function public.reject_locked_tournament_group_duo_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  blocked boolean := false;
begin
  if tg_op in ('INSERT','UPDATE') then
    select exists (
      select 1
      from public.tournament_groups g
      join public.tournaments t on t.id = g.tournament_id
      where g.id = new.group_id
        and t.is_locked
    ) into blocked;
  end if;

  if tg_op in ('UPDATE','DELETE') and not blocked then
    select exists (
      select 1
      from public.tournament_groups g
      join public.tournaments t on t.id = g.tournament_id
      where g.id = old.group_id
        and t.is_locked
    ) into blocked;
  end if;

  if blocked then
    raise exception 'Tournament is locked. Draw structure cannot be changed.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists tournament_group_duos_lock_guard on public.tournament_group_duos;
create trigger tournament_group_duos_lock_guard
before insert or update or delete on public.tournament_group_duos
for each row execute function public.reject_locked_tournament_group_duo_change();
