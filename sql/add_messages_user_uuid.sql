-- Add nullable message ownership for secure push verification

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'user_uuid'
  ) then
    alter table public.messages
      add column user_uuid uuid null;
  end if;
end $$;

create index if not exists messages_user_uuid_idx
  on public.messages (user_uuid);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'user_uuid'
  ) and not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'messages'
      and constraint_name = 'messages_user_uuid_fkey'
  ) then
    alter table public.messages
      add constraint messages_user_uuid_fkey
      foreign key (user_uuid)
      references auth.users(id)
      on delete set null;
  end if;
end $$;
