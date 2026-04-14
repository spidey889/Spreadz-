create extension if not exists "pgcrypto";

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  rating integer not null,
  reason text null,
  other_text text null,
  user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint feedback_rating_range check (rating between 1 and 5)
);

alter table public.feedback add column if not exists reason text;
alter table public.feedback add column if not exists other_text text;
alter table public.feedback add column if not exists user_id uuid;
alter table public.feedback add column if not exists created_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'feedback'
      and column_name = 'user_id'
      and data_type <> 'uuid'
  ) then
    execute 'alter table public.feedback alter column user_id type uuid using nullif(trim(user_id::text), '''')::uuid';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'feedback'
      and constraint_name = 'feedback_user_id_fkey'
  ) then
    alter table public.feedback
      add constraint feedback_user_id_fkey
      foreign key (user_id)
      references auth.users(id)
      on delete set null;
  end if;
end $$;

update public.feedback
set created_at = now()
where created_at is null;

alter table public.feedback alter column created_at set default now();
alter table public.feedback alter column created_at set not null;

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);
create index if not exists feedback_user_id_idx on public.feedback (user_id);

alter table public.feedback enable row level security;

drop policy if exists feedback_select_own on public.feedback;
create policy feedback_select_own
  on public.feedback for select
  using (auth.uid() is not null and user_id = auth.uid());

drop policy if exists feedback_insert_own on public.feedback;
create policy feedback_insert_own
  on public.feedback for insert
  with check (
    auth.uid() is not null
    and user_id = auth.uid()
    and rating between 1 and 5
  );

drop policy if exists feedback_update_own on public.feedback;
create policy feedback_update_own
  on public.feedback for update
  using (auth.uid() is not null and user_id = auth.uid())
  with check (
    auth.uid() is not null
    and user_id = auth.uid()
    and rating between 1 and 5
  );
