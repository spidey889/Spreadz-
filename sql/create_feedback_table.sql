create extension if not exists pgcrypto;

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  reason text not null,
  other_text text null,
  rating smallint not null check (rating between 1 and 10),
  created_at timestamptz not null default timezone('utc', now()),
  user_id uuid null references auth.users(id) on delete set null,
  constraint feedback_other_text_required check (
    reason <> 'Other' or nullif(trim(coalesce(other_text, '')), '') is not null
  )
);

alter table public.feedback enable row level security;

grant insert on table public.feedback to anon, authenticated;

drop policy if exists "Allow inserts into feedback" on public.feedback;
create policy "Allow inserts into feedback"
on public.feedback
for insert
to anon, authenticated
with check (user_id is null or auth.uid() = user_id);
