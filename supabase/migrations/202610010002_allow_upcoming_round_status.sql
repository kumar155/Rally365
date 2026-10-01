-- Allow tournament rounds to be explicitly marked UPCOMING.
-- The draw generator uses UPCOMING for future knockout stages that have
-- not started yet, while SCHEDULED remains valid for individual matches.
alter table public.tournament_rounds
drop constraint if exists tournament_rounds_status_check;

alter table public.tournament_rounds
add constraint tournament_rounds_status_check
check (status in ('SCHEDULED', 'UPCOMING', 'LIVE', 'COMPLETED'));
