insert into public.rooms (
  headline,
  message_count,
  user_count,
  total_seconds_spent,
  time_spent_minutes
) values (
  'Top story from Hacker News right now',
  0,
  0,
  0,
  0
)
returning id;
