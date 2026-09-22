create table if not exists public.ai_response_feedback (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  question text not null,
  response text not null,
  feedback text not null check (feedback in ('up', 'down')),
  intent text,
  retry_response text,
  created_at timestamptz not null default now()
);

create index if not exists ai_response_feedback_group_created_idx
  on public.ai_response_feedback (group_id, created_at desc);

alter table public.ai_response_feedback enable row level security;
