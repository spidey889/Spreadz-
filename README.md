# Spreadz

Spreadz is a real-time social app for college students. It is built for fast, casual room-based conversation with student identity, swipeable discovery, and lightweight profiles.

You can use Spreadz to:
- Talk to other college students in real time
- Spill and catch the latest gossip and news
- Swipe to new rooms and meet new students
- Send inline GIFs in chat with the built-in picker
- Opt in to push notifications for new messages
- Hang out in a student-only space

To get started, open the app and jump in.

**[spreadz.vercel.app](https://spreadz.vercel.app)**

*Spreadz is currently open only to Indian colleges.*

## Run locally
1. Install dependencies with `npm install`
2. Create `.env.local`
3. Add:
   `NEXT_PUBLIC_SUPABASE_URL`
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   `SUPABASE_SERVICE_ROLE_KEY`
   `VAPID_PRIVATE_KEY`
   `VAPID_SUBJECT`
4. Apply `sql/db_cleanup.sql` in Supabase so `messages.user_uuid`, RLS, and `push_subscriptions` are in place
5. Run `npm run dev`

## Notifications
- Foreground notifications can show through the browser Notification API
- Background notifications are delivered through the service worker and push subscription flow
- Clicking a notification deep-links back to the correct room and message in chat
