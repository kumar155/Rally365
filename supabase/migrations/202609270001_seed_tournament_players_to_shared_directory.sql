-- Keep the existing shared player directory in sync with tournament rosters.
-- New players are written to public.players first; this backfill makes older
-- tournament-only players reusable in future tournaments as well.
insert into public.players (group_id, name)
select g.id, names.name
from (
  select distinct trim(display_name) as name
  from public.tournament_players
  where trim(display_name) <> ''
) names
cross join lateral (
  select id from public.groups order by created_at limit 1
) g
where not exists (
  select 1
  from public.players p
  where lower(trim(p.name)) = lower(names.name)
);
