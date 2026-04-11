-- Add pairwise mutes with mutual message hiding
-- 2026-04-11: mute relations + message visibility RLS update

create extension if not exists "pgcrypto";

create table if not exists public.mutes (
  id uuid primary key default gen_random_uuid(),
  muter_uuid uuid not null references auth.users(id) on delete cascade,
  muted_uuid uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint mutes_not_self check (muter_uuid <> muted_uuid)
);

create unique index if not exists mutes_pair_uniq
  on public.mutes (least(muter_uuid, muted_uuid), greatest(muter_uuid, muted_uuid));

create index if not exists mutes_muter_idx
  on public.mutes (muter_uuid);

create index if not exists mutes_muted_idx
  on public.mutes (muted_uuid);

alter table public.mutes enable row level security;

drop policy if exists mutes_select_pair on public.mutes;
create policy mutes_select_pair
  on public.mutes for select
  using (muter_uuid = auth.uid() or muted_uuid = auth.uid());

drop policy if exists mutes_insert_owner on public.mutes;
create policy mutes_insert_owner
  on public.mutes for insert
  with check (muter_uuid = auth.uid() and muted_uuid <> auth.uid());

drop policy if exists mutes_delete_pair on public.mutes;
create policy mutes_delete_pair
  on public.mutes for delete
  using (muter_uuid = auth.uid() or muted_uuid = auth.uid());

drop policy if exists messages_select_all on public.messages;
drop policy if exists messages_select_unmuted on public.messages;
create policy messages_select_unmuted
  on public.messages for select
  using (
    auth.uid() is not null
    and not exists (
      select 1
      from public.mutes
      where (
        public.mutes.muter_uuid = auth.uid()
        and public.mutes.muted_uuid = public.messages.user_uuid
      ) or (
        public.mutes.muter_uuid = public.messages.user_uuid
        and public.mutes.muted_uuid = auth.uid()
      )
    )
  );

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mutes'
  ) then
    execute 'alter publication supabase_realtime add table public.mutes';
  end if;
end $$;
