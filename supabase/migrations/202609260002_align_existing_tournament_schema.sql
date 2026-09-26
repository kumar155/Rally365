-- The tournaments table already existed in this Supabase project with a legacy shape.
-- Add the Tournament module fields without replacing or dropping existing data.
alter table public.tournaments add column if not exists tournament_date date;
alter table public.tournaments add column if not exists partner_mode text;
alter table public.tournaments add column if not exists rounds integer;
alter table public.tournaments add column if not exists group_count integer;
alter table public.tournaments add column if not exists qualifiers_per_group integer;
alter table public.tournaments add column if not exists games_per_match integer not null default 1;
alter table public.tournaments add column if not exists points_win integer not null default 1;
alter table public.tournaments add column if not exists points_draw integer not null default 0;
alter table public.tournaments add column if not exists points_loss integer not null default 0;

update public.tournaments
set partner_mode = coalesce(partner_mode, 'RANDOM'),
    tournament_date = coalesce(tournament_date, start_date::date),
    games_per_match = coalesce(games_per_match, 1),
    points_win = coalesce(points_win, 1),
    points_draw = coalesce(points_draw, 0),
    points_loss = coalesce(points_loss, 0)
where partner_mode is null
   or tournament_date is null
   or games_per_match is null
   or points_win is null
   or points_draw is null
   or points_loss is null;

alter table public.tournaments drop constraint if exists tournaments_partner_mode_check;
alter table public.tournaments add constraint tournaments_partner_mode_check
  check (partner_mode in ('RANDOM','FIXED'));

alter table public.tournaments drop constraint if exists tournaments_status_check;
alter table public.tournaments add constraint tournaments_status_check
  check (status in ('UPCOMING','DRAFT','READY','LIVE','COMPLETED','CANCELLED'));

create index if not exists idx_tournaments_tournament_date
  on public.tournaments(tournament_date);
