# ROOM_9

ROOM_9 is a dark brutalist DJ booking MVP built with Next.js App Router, TypeScript, Tailwind CSS, and Supabase.

The goal is a stable diploma demo: DJs create profiles and upload audio, organizers browse artists and send booking requests, DJs accept or decline those requests, both sides can message each other, and support pages show how the system scales.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Auth, PostgreSQL, and Storage
- Vercel-ready environment variables
- Cloudflare Workers deployment config through OpenNext

## Setup

1. Create a Supabase project.

2. In Supabase, open **Project Settings > API**.

3. Copy the **Project URL**. It should look like:

   ```text
   https://your-project-ref.supabase.co
   ```

4. Copy the **publishable** API key. Older Supabase projects may call this the **anon public** key. Do not use the `service_role` key in this frontend app.

5. Create `.env.local` in the project root:

   ```bash
   cp .env.example .env.local
   ```

6. Fill in `.env.local`:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   NEXT_PUBLIC_ROOM9_DEMO_MODE=false
   ```

7. In Supabase SQL Editor, run the full contents of:

   ```text
   supabase/schema.sql
   ```

   The script creates the required tables, grants, demo RLS policies, auth trigger, demo event/live stream rows, analytics tables, and attempts to create the public `tracks`, `images`, and `documents` storage buckets.

8. In Supabase Storage, confirm there are public buckets named:

   ```text
   tracks
   images
   documents
   ```

   If the SQL bucket creation did not work in your project, create the buckets manually and keep them public for the MVP demo.

9. In Supabase Auth settings, enable email/password auth. For the smoothest live demo, disable email confirmation so users can register and immediately continue.

10. Install dependencies:

   ```bash
   npm install
   ```

11. Restart the dev server after any `.env.local` change:

   ```bash
   npm run dev
   ```

12. Open `http://localhost:3001` and test the demo flow below. The local dev script is pinned to port `3001` to avoid stale `3000` sessions during demos.

13. Deploy to Cloudflare Workers using `docs/cloudflare-deployment.md`. The recommended production path is GitHub -> GitHub Actions -> Cloudflare Workers.

## Supabase Troubleshooting

- If registration shows `Could not reach Supabase`, the Project URL is wrong, the Supabase project is paused/deleted, DNS has not propagated yet, or the dev server was not restarted after editing `.env.local`.
- If registration shows `over_email_send_rate_limit`, Supabase has sent too many auth emails. For the demo, disable **Authentication > Providers > Email > Confirm email**, then register with a new email. Otherwise wait for the rate limit window to reset.
- If you need to demo without a reachable Supabase project, set `NEXT_PUBLIC_ROOM9_DEMO_MODE=true` and restart the dev server. This uses browser `localStorage` only; turn it back to `false` for real Supabase testing.
- If you see a missing table or schema error, run `supabase/schema.sql` again in the Supabase SQL Editor.
- If you see an RLS or permission error, run `supabase/schema.sql` again so the demo policies are installed.
- If Organizer/Venue booking tools stay locked after verification, run the latest `supabase/schema.sql`; V2 access uses `profile_role_access` in addition to the legacy `profiles.role`.
- If track upload says bucket `tracks` is missing, create a public Supabase Storage bucket named `tracks`.
- If avatar, track cover, playlist cover, or event image upload says bucket `images` is missing, create a public Supabase Storage bucket named `images`.
- If rider upload says bucket `documents` is missing, run `supabase/schema.sql` again or create a public Supabase Storage bucket named `documents`.
- Track audio files are stored in `tracks`; DJ avatars, DJ covers, track covers, playlist covers, and event images are stored in `images`; technical rider PDFs are stored in `documents`.
- Browser console errors are prefixed with `[ROOM_9]` to make Supabase failures easier to find.

## Git and Cloudflare Deployment

The project is now prepared for Git-based deployment. Push `main` to GitHub and add these GitHub Actions secrets:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_ROOM9_DEMO_MODE
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

The workflow at `.github/workflows/cloudflare-deploy.yml` runs:

```bash
npm ci
npm run lint
npm run build
npm run cf:deploy
```

Do not commit `.env.local`, Cloudflare tokens, Supabase secret keys, or service role keys.

If Cloudflare logs show `Worker exceeded CPU time limit`, confirm the latest code is deployed. Demo audio is now served from static files in `public/demo-audio/`, and the legacy `/api/demo-audio/[id]` route redirects to those files instead of generating WAV audio inside the Worker.

## Demo Scenario

1. Register a listener account.
2. Open `/dashboard/settings` and unlock DJ tools.
3. Create the DJ profile, upload avatar/cover/rider assets, then open `/library`.
4. Upload an MP3 or WAV track, cover image, and optional release/playlist metadata.
5. Open `/explore`, play a track, select a sound reference, and save it to Sound Vault.
6. Open `/dashboard/settings` and unlock Organizer or Venue tools on another account.
7. Create an event in `/dashboard/events`, attach a saved sound reference to a lineup slot, and send a booking request.
8. Open `/dashboard/bookings` to review the Booking CRM lifecycle.
9. Open booking details from the CRM and use the case chat, rider upload, and escrow preview.
10. Open `/dashboard/calendar` to review pending bookings, accepted bookings, event dates, stream dates, and conflicts.
11. Open `/dashboard/streams` to schedule or manage DJ stream proof.

## Implemented

- Email/password registration and login through Supabase.
- Listener-first account creation with professional access stored in `profile_role_access`.
- Role-aware redirect after login and unlock gates for DJ, Organizer, Venue, and Admin tooling.
- Public DJ discovery grid on `/explore`.
- Public DJ profile page at `/dj/[id]`.
- Organizer booking flow at `/booking/[djId]`.
- DJ workspace with incoming bookings and status updates; music upload and track management live in Sound Vault.
- DJ avatar and cover uploads through the public `images` Storage bucket.
- DJ technical rider PDF upload through the public `documents` Storage bucket, including direct upload from booking case files.
- Listener-first account model with `profile_role_access` for unlocking DJ, Organizer, and Venue tools.
- Track cover image upload through the public `images` Storage bucket.
- Playlist cover upload through the public `images` Storage bucket.
- Structured track metadata: title, genre, BPM, key, description, lyrics/notes, visibility, play count, and like count.
- Track lyrics / notes saved with uploaded tracks.
- Persistent global audio player with cover, title, artist, play/pause, previous/next, progress, time, volume, and save action.
- Personal Sound Vault playlists, playlist track ordering, saved tracks, saved moments, and listening history backed by Supabase with local demo fallback.
- DJ track library management with metadata editing, cover replacement, public/private visibility, and archive/delete behavior.
- `/library` as the primary Sound Vault for upload, track management, playlist CRUD, queue control, favorites, saved moments, history, and library health. Legacy `/dashboard/music` redirects there.
- Deterministic Signal Engine foundation for Explore ranking: genre, BPM, room fit, saved archive activity, and booking readiness are scored without pretending to be full AI.
- DJ analytics cards based on bookings, profile views, track count, saved count, and track play rows.
- Organizer/Venue workspace with sent booking requests, Event Desk, Booking CRM, Timeline, and saved sound references.
- Notification center backed by `notifications` with read/unread state.
- Full booking chat backed by `booking_messages`.
- Booking details page with status actions and chat.
- Chat archive/restore behavior per booking side.
- Booking calendar page backed by real booking rows.
- Interactive live stream/archive page with filters, player controls, and optional `live_streams` table data.
- DJ stream management in `/dashboard/streams`; legacy `/streams/manage` redirects there.
- Public events page, event detail pages, and organizer/venue event management in `/dashboard/events`; legacy `/events/manage` redirects there.
- Venue role registration and venue dashboard profile support.
- Listener role registration with Sound Vault, saved DJs, and unlockable workspace tools.
- Saved DJs / favorites on public DJ profiles.
- Reviews and ratings on public DJ profiles.
- In-app notification rows for new booking requests and booking status changes.
- V3 escrow/payment readiness panel on booking details without a real payment provider.
- Genre filtering in Explore DJs.
- Profile settings support page.
- Supabase SQL schema with RLS, `tracks` and `images` storage policies, public `live_streams`, events, chat, and analytics tables.
- V2/V3 schema tables for favorites, reviews, notifications, availability, venue profiles, payments, tickets, reports, stream sessions, and subscriptions.
- SoundCloud-inspired track cards with cover, global play action, and lyrics/notes disclosure.
- Dark brutalist UI with black background, off-white text, thin borders, and bold typography.
- Cloudflare Workers build path with `@opennextjs/cloudflare`, Wrangler config, and `npm run cf:build`.

## Scalability and Future Development

ROOM_9 should stay a modular monolith for the diploma MVP: one Next.js app, one Supabase project, and clear internal modules for auth, profiles, bookings, events, streams, chat, and dashboard logic. This keeps development fast, deployment simple, and debugging realistic for the project scope.

The codebase is prepared for future roles in TypeScript and SQL:

- `dj`
- `organizer`
- `admin`
- `listener`
- `venue`

V2 expands platform interaction. The current code now starts this transition with Listener and Venue roles, saved DJs, reviews, notifications, venue profiles, and stronger event/event-dashboard behavior. Remaining V2 work includes admin moderation UI depth, a full DJ availability editor, and more formal booking lifecycle screens.

V3 turns ROOM_9 into a marketplace ecosystem: payments and escrow, ticketing, advanced analytics, AI DJ recommendations, AI lineup matching, premium profiles, subscriptions, public listener accounts, internationalization, advanced stream sessions, and trust/safety tools. The current app includes an escrow/payment readiness panel and database placeholders, but no real payment provider is connected yet.

Potential future independent services are media/streaming, chat/realtime, recommendations, payments, and analytics. These should only be extracted when they have independent load, stronger security requirements, or specialized compute needs.

Detailed diploma documents:

- `docs/roadmap-v2-v3.md`
- `docs/current-product-roadmap.md`
- `docs/cloudflare-deployment.md`
- `docs/scaling-architecture.md`
- `docs/performance-scalability.md`
- `docs/security-scalability.md`
- `docs/supabase-rls-audit.md`
- `docs/ux-ui-scalability.md`
- `docs/diploma-scalability-summary.md`
- `docs/diploma-technical-summary.md`
- `docs/testing-checklist.md`

## Future Scope

- Organizer profile editing.
- Real hosted livestream ingestion.
- Real notification delivery beyond database-backed in-app rows.
- Admin moderation interface depth for public roster quality.
- Full DJ availability calendar editor.
- Real payment provider integration and escrow.
- Ticket checkout and ticket validation.
- Public comments and timed comments.
- Generated thumbnails for tracks and playlists.
