alter table public.tournament_matches
  add column if not exists group_id uuid references public.tournament_groups(id) on delete set null;

create index if not exists idx_tournament_matches_group
  on public.tournament_matches(group_id);

update public.tournament_matches m
set group_id = (
  select a.group_id
  from public.tournament_group_duos a
  where a.duo_id = m.team_a_duo_id
    and exists (
      select 1
      from public.tournament_group_duos b
      where b.group_id = a.group_id
        and b.duo_id = m.team_b_duo_id
    )
  limit 1
)
where m.group_id is null
  and m.team_a_duo_id is not null
  and m.team_b_duo_id is not null;
