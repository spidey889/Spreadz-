-- FRIDAY: User Behaviour Tracking Table
-- Run this SQL in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

create table if not exists user_behaviour (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  room_id uuid references rooms(id),
  seconds_spent integer default 0,
  messages_sent integer default 0,
  typed_but_not_sent integer default 0,
  returned_to_room integer default 0,
  visited_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table user_behaviour enable row level security;

create policy "Anyone can insert behaviour" on user_behaviour
  for insert with check (true);

create policy "Anyone can update behaviour" on user_behaviour
  for update using (true);

create policy "Anyone can read behaviour" on user_behaviour
  for select using (true);
