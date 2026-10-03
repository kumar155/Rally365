-- Shared expense payer support for Rally365 group settlements.
alter table public.expenses
  add column if not exists paid_by_player_id uuid references public.players(id) on delete set null;

create index if not exists expenses_paid_by_player_id_idx
  on public.expenses(paid_by_player_id);
