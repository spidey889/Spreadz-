# SQL Notes

This folder is for ad-hoc SQL scripts and notes related to Supabase and database changes.

## Index
- `add_messages_user_uuid.sql` - adds nullable message ownership for secure push verification
- `add_mutes.sql` - adds pairwise mutes, RLS, and mutual message hiding
- `db_cleanup.sql` - friends merge, message ownership cleanup, RLS, and push subscription table/policies
- `user_behaviour_migration.sql` - original FRIDAY tracking table migration

## Conventions
- Add a short summary at the top of each SQL file.
- Include the date and purpose in comments.
- Most ad-hoc SQL files here are ignored by Git; tracked exceptions should be called out in this index.
