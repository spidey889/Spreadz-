-- Spreadz DB cleanup: unify friends + requests, remove unused columns, add RLS

-- 1) Schema changes: unify friend_requests + friends
create extension if not exists "pgcrypto";

-- Normalize user id columns to UUID to match auth.uid()
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_behaviour' and column_name = 'user_id'
  ) then
    execute 'alter table public.user_behaviour rename column user_id to user_uuid';
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'uuid'
      and data_type <> 'uuid'
  ) then
    execute 'alter table public.users alter column uuid type uuid using uuid::uuid';
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'user_uuid'
      and data_type <> 'uuid'
  ) then
    execute 'alter table public.messages alter column user_uuid type uuid using user_uuid::uuid';
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_behaviour' and column_name = 'user_uuid'
      and data_type <> 'uuid'
  ) then
    execute 'alter table public.user_behaviour alter column user_uuid type uuid using user_uuid::uuid';
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'friend_status') then
    create type public.friend_status as enum ('accepted', 'declined');
  end if;
end $$;

create table if not exists public.friends_new (
  id uuid primary key default gen_random_uuid(),
  requester_uuid uuid not null,
  addressee_uuid uuid not null,
  sender_name text null,
  status public.friend_status null,
  created_at timestamptz not null default now(),
  constraint friends_new_not_self check (requester_uuid <> addressee_uuid)
);

create unique index if not exists friends_new_pair_uniq
  on public.friends_new (least(requester_uuid, addressee_uuid), greatest(requester_uuid, addressee_uuid));
create index if not exists friends_new_requester_idx on public.friends_new (requester_uuid);
create index if not exists friends_new_addressee_idx on public.friends_new (addressee_uuid);
create index if not exists friends_new_status_idx on public.friends_new (status);

-- Backfill from friend_requests
insert into public.friends_new (id, requester_uuid, addressee_uuid, sender_name, status, created_at)
select
  fr.id::uuid,
  fr.sender_uuid::uuid,
  fr.receiver_uuid::uuid,
  fr.sender_name,
  case
    when fr.status = 'accepted' then 'accepted'::public.friend_status
    when fr.status = 'declined' then 'declined'::public.friend_status
    else null
  end,
  fr.created_at
from public.friend_requests fr
on conflict do nothing;

-- Backfill accepted friends (dedupe by unordered pair)
insert into public.friends_new (requester_uuid, addressee_uuid, status, created_at)
select distinct on (least(f.user_uuid, f.friend_uuid), greatest(f.user_uuid, f.friend_uuid))
  f.user_uuid::uuid,
  f.friend_uuid::uuid,
  'accepted'::public.friend_status,
  coalesce(f.created_at, now())
from public.friends f
on conflict do nothing;

-- Swap tables
drop table if exists public.friend_requests;
drop table if exists public.friends;
alter table public.friends_new rename to friends;

-- Cleanup old enum if unused
do $$
begin
  if exists (select 1 from pg_type where typname = 'friend_request_status') then
    drop type public.friend_request_status;
  end if;
end $$;

-- 2) Drop unused columns from messages
alter table public.messages drop column if exists username;
alter table public.messages drop column if exists reveal_delay;

-- 3) Auto-decline (best-effort, runs every minute)
create or replace function public.decline_expired_friend_requests()
returns void
language plpgsql
as $$
begin
  update public.friends
  set status = 'declined'
  where status is null
    and created_at < now() - interval '10 seconds';
end;
$$;

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'friends_auto_decline') then
    perform cron.unschedule('friends_auto_decline');
  end if;
  perform cron.schedule('friends_auto_decline', '* * * * *', $$select public.decline_expired_friend_requests();$$);
end $$;

-- 4) Enable RLS + basic policies (requires auth)
alter table public.users enable row level security;
alter table public.rooms enable row level security;
alter table public.messages enable row level security;
alter table public.friends enable row level security;
alter table public.reports enable row level security;
alter table public.user_behaviour enable row level security;

-- Users
drop policy if exists users_select_all on public.users;
create policy users_select_all
  on public.users for select
  using (auth.uid() is not null);

drop policy if exists users_insert_self on public.users;
create policy users_insert_self
  on public.users for insert
  with check (uuid = auth.uid());

drop policy if exists users_update_self on public.users;
create policy users_update_self
  on public.users for update
  using (uuid = auth.uid())
  with check (uuid = auth.uid());

-- Rooms
drop policy if exists rooms_select_all on public.rooms;
create policy rooms_select_all
  on public.rooms for select
  using (auth.uid() is not null);

-- Messages
drop policy if exists messages_select_all on public.messages;
create policy messages_select_all
  on public.messages for select
  using (auth.uid() is not null);

drop policy if exists messages_insert_own on public.messages;
create policy messages_insert_own
  on public.messages for insert
  with check (user_uuid = auth.uid());

drop policy if exists messages_update_own on public.messages;
create policy messages_update_own
  on public.messages for update
  using (user_uuid = auth.uid())
  with check (user_uuid = auth.uid());

drop policy if exists messages_delete_own on public.messages;
create policy messages_delete_own
  on public.messages for delete
  using (user_uuid = auth.uid());

-- Friends
drop policy if exists friends_select_own on public.friends;
create policy friends_select_own
  on public.friends for select
  using (requester_uuid = auth.uid() or addressee_uuid = auth.uid());

drop policy if exists friends_insert_requester on public.friends;
create policy friends_insert_requester
  on public.friends for insert
  with check (requester_uuid = auth.uid());

drop policy if exists friends_update_addressee on public.friends;
create policy friends_update_addressee
  on public.friends for update
  using (addressee_uuid = auth.uid())
  with check (addressee_uuid = auth.uid());

-- Reports
drop policy if exists reports_insert_any on public.reports;
create policy reports_insert_any
  on public.reports for insert
  with check (auth.uid() is not null);

-- User behaviour
drop policy if exists user_behaviour_select_own on public.user_behaviour;
create policy user_behaviour_select_own
  on public.user_behaviour for select
  using (user_uuid = auth.uid());

drop policy if exists user_behaviour_insert_own on public.user_behaviour;
create policy user_behaviour_insert_own
  on public.user_behaviour for insert
  with check (user_uuid = auth.uid());

drop policy if exists user_behaviour_update_own on public.user_behaviour;
create policy user_behaviour_update_own
  on public.user_behaviour for update
  using (user_uuid = auth.uid())
  with check (user_uuid = auth.uid());
