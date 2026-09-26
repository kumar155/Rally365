create extension if not exists pgcrypto;

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  venue text,
  tournament_date date,
  partner_mode text not null default 'RANDOM' check (partner_mode in ('RANDOM','FIXED')),
  format text not null default 'KNOCKOUT' check (format in ('KNOCKOUT','ROUND_ROBIN','GROUPS_KNOCKOUT','RANDOM_ROUNDS')),
  rounds integer check (rounds is null or rounds > 0),
  group_count integer check (group_count is null or group_count > 0),
  qualifiers_per_group integer check (qualifiers_per_group is null or qualifiers_per_group > 0),
  games_per_match integer not null default 1 check (games_per_match > 0),
  points_win integer not null default 1 check (points_win >= 0),
  points_draw integer not null default 0 check (points_draw >= 0),
  points_loss integer not null default 0 check (points_loss >= 0),
  status text not null default 'DRAFT' check (status in ('DRAFT','READY','LIVE','COMPLETED','CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tournament_players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  phone text,
  seed integer,
  created_at timestamptz not null default now(),
  unique (tournament_id, name)
);

create table if not exists public.tournament_duos (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  seed integer,
  source text not null default 'RANDOM' check (source in ('RANDOM','FIXED')),
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tournament_id, name)
);

create table if not exists public.tournament_duo_members (
  id uuid primary key default gen_random_uuid(),
  duo_id uuid not null references public.tournament_duos(id) on delete cascade,
  player_id uuid not null references public.tournament_players(id) on delete cascade,
  slot integer not null check (slot in (1,2)),
  unique (duo_id, player_id),
  unique (duo_id, slot)
);

create table if not exists public.tournament_groups (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  group_number integer not null check (group_number > 0),
  qualifying_teams integer check (qualifying_teams is null or qualifying_teams > 0),
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','LIVE','COMPLETED')),
  created_at timestamptz not null default now(),
  unique (tournament_id, group_number)
);

create table if not exists public.tournament_group_duos (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.tournament_groups(id) on delete cascade,
  duo_id uuid not null references public.tournament_duos(id) on delete cascade,
  seed integer,
  unique (group_id, duo_id)
);

create table if not exists public.tournament_rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  name text not null,
  round_type text not null check (round_type in ('GROUP','KNOCKOUT','RANDOM')),
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','LIVE','COMPLETED')),
  created_at timestamptz not null default now(),
  unique (tournament_id, round_number, name)
);

create table if not exists public.tournament_schedules (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  schedule_date date,
  start_at timestamptz,
  court_count integer not null default 1 check (court_count > 0),
  match_duration_minutes integer not null default 20 check (match_duration_minutes > 0),
  rest_minutes integer not null default 5 check (rest_minutes >= 0),
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','LOCKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_id uuid references public.tournament_rounds(id) on delete set null,
  group_id uuid references public.tournament_groups(id) on delete set null,
  match_number integer not null,
  court_number integer,
  scheduled_at timestamptz,
  duo_a_id uuid references public.tournament_duos(id) on delete set null,
  duo_b_id uuid references public.tournament_duos(id) on delete set null,
  score_a integer,
  score_b integer,
  winner_duo_id uuid references public.tournament_duos(id) on delete set null,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','LIVE','COMPLETED','WALKOVER','CANCELLED')),
  next_match_id uuid references public.tournament_matches(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tournament_id, match_number)
);

create table if not exists public.tournament_match_games (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.tournament_matches(id) on delete cascade,
  game_number integer not null check (game_number > 0),
  score_a integer not null default 0 check (score_a >= 0),
  score_b integer not null default 0 check (score_b >= 0),
  created_at timestamptz not null default now(),
  unique (match_id, game_number)
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
  unique (tournament_id, group_id, duo_id)
);

create index if not exists idx_tournament_players_tournament on public.tournament_players(tournament_id);
create index if not exists idx_tournament_duos_tournament on public.tournament_duos(tournament_id);
create index if not exists idx_tournament_matches_tournament on public.tournament_matches(tournament_id);
create index if not exists idx_tournament_matches_round on public.tournament_matches(round_id);
create index if not exists idx_tournament_standings_tournament on public.tournament_standings(tournament_id);
