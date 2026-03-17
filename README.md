# Spreadz

Real-time global chat where strangers discuss trending topics together.
Swipe to find new people and fresh discussions — no commitment, no friend requests.

## What's built
- Live messaging with Supabase real-time
- TikTok-style room swiping
- Discussion headlines per room
- User profiles with college tags
- FRIDAY personalization engine running in background
- Mobile-first, clean UI

## Tech stack
- Next.js 14 + TypeScript
- Supabase
- Tailwind CSS
- Vercel

## Run locally
1. Clone the repo
2. Create `.env.local` with your Supabase URL and anon key
3. `npm install`
4. `npm run dev`

## Notifications System

### Current Capabilities
- Real-time notifications triggered from chat events
- Desktop support using Notification API
- Mobile support using Service Worker fallback (`showNotification`)
- Click on notification opens the correct chat room
- Duplicate notification prevention (message-level dedupe)
- Anti-spam cooldown to avoid rapid notification bursts
- Debug mode toggle for development visibility

### Behavior Notes
- Notifications only trigger for messages from other users
- Notifications currently fire even when app is visible (testing mode)
- Works reliably when app is active or recently in background

### Limitations
- Notifications do not work when the app is fully closed or inactive for long
- No true background push delivery yet (no Web Push API integration)
- Notification popup style (heads-up) depends on device/browser settings
- Some notification behavior varies across platforms (desktop vs mobile)

### Architecture Overview
- Chat event -> message detected -> notification pipeline
- Desktop: Notification API
- Mobile: Service Worker (`registration.showNotification`)
- Fallback logic ensures no crashes across environments
- In-memory dedupe + cooldown used for control

### Debug System
- Debug mode toggle available in UI
- Shows:
  - event detection logs
  - notification result logs
  - skip reasons (cooldown, self-message, etc.)
- Hidden by default for normal usage

### Pending Improvements
- Web Push API integration (true background/closed-app notifications)
- Push subscription storage + backend delivery system
- Notification monitoring (delivery rate, click rate)
- Advanced notification logic:
  - mentions
  - direct messages priority
  - smarter grouping

### Notes
- Current system is optimized for prototype and active-session usage
- Production-grade push system will be implemented in a later phase
- Code has been cleaned to remove experimental paths and keep only stable flows

## Progress log
- March 15, 2026 — Hit 101 pushes; shipped identity, reporting, PWA install flow, and UI polish.
- March 15, 2026 — Crossed 100+ commits and kept shipping consistently.
- Early build — Real-time chat, swipe rooms, discussion headlines, and FRIDAY personalization.


