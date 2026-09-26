create table if not exists public.tournament_groups (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  group_number integer not null check (group_number > 0),
  qualifying_teams integer not null default 1 check (qualifying_teams > 0),
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','LIVE','COMPLETED')),
  created_at timestamptz not null default now(),
  unique(tournament_id, group_number)
);

create table if not exists public.tournament_group_duos (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.tournament_groups(id) on delete cascade,
  duo_id uuid not null references public.tournament_duos(id) on delete cascade,
  seed integer,
  unique(group_id, duo_id)
);

create table if not exists public.tournament_schedules (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  schedule_date date not null,
  start_at timestamptz not null,
  court_count integer not null default 1 check (court_count > 0),
  match_duration_minutes integer not null default 20 check (match_duration_minutes > 0),
  rest_minutes integer not null default 5 check (rest_minutes >= 0),
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','LOCKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tournament_id)
);

create table if not exists public.tournament_standings (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  group_id uuid references public.tournament_groups(id) on delete cascade,
  duo_id uuid not null references public.tournament_duos(id) on delete cascade,
  played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  games_won integer not null default 0,
  games_lost integer not null default 0,
  points_for integer not null default 0,
  points_against integer not null default 0,
  ranking_points integer not null default 0,
  rank_position integer,
  updated_at timestamptz not null default now(),
  unique(tournament_id, group_id, duo_id)
);

alter table public.tournament_matches alter column team_a_duo_id drop not null;
alter table public.tournament_matches alter column team_b_duo_id drop not null;

alter table public.tournament_rounds drop constraint if exists tournament_rounds_round_type_check;
alter table public.tournament_rounds add constraint tournament_rounds_round_type_check check (round_type = any (array['GROUP'::text,'ROUND_OF_16'::text,'QUARTER_FINAL'::text,'SEMI_FINAL'::text,'FINAL'::text,'RANDOM'::text));

create index if not exists idx_tournament_groups_tournament on public.tournament_groups(tournament_id);
create index if not exists idx_tournament_group_duos_group on public.tournament_group_duos(group_id);
create index if not exists idx_tournament_schedules_tournament on public.tournament_schedules(tournament_id);
create index if not exists idx_tournament_standings_tournament on public.tournament_standings(tournament_id);
