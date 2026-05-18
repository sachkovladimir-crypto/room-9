# ROOM_9 Ready State

This file summarizes what is currently implemented in ROOM_9 and what is still future scope.

## Core MVP Ready

- Home page with ROOM_9 brutalist branding.
- Supabase email/password registration.
- Supabase login/logout.
- Role selection on registration.
- Current public registration roles:
  - DJ
  - Organizer
  - Venue
  - Listener
- Role-based redirect after login.
- DJ profile creation and editing.
- DJ avatar upload.
- DJ cover image upload.
- DJ audio track upload.
- Track cover image upload.
- Track lyrics / notes field.
- Persistent global audio player.
- Global audio player progress bar, waveform-like progress, previous/next, repeat-one, time display, volume, and save action.
- Public Sound Vault with saved tracks, saved moments, playlists, followed DJs, queue, listening history, and booking-ready views.
- Personal playlists scoped per account, backed by Supabase when signed in with local demo fallback.
- SoundCloud-like play controls on public DJ profile tracks.
- Track library editing in Sound Vault.
- `/library` is the primary Sound Vault for DJ/operator music control, search, filters, playlists, releases, playback console, uploads, and library health.
- Legacy `/dashboard/music` redirects to `/library` so music remains a platform-level surface rather than a hidden workspace tab.
- Track archive/delete behavior in Sound Vault.
- Public Explore DJs page.
- Multi-attribute Explore search/filtering.
- Public DJ profile page.
- Booking request form.
- Booking requests saved to Supabase.
- DJ dashboard with incoming bookings.
- Organizer dashboard with sent bookings.
- Venue dashboard profile flow.
- Booking accept/decline actions.
- Booking details page.
- Booking chat backed by database rows.
- Per-side chat archive/restore behavior.
- Calendar page for bookings.
- Events page.
- Event details page.
- Organizer/Venue event management.
- Streams page.
- DJ stream management page.
- Settings page.
- Dark brutalist desktop-first UI.

## V2 Implemented

- Listener role registration.
- Venue role registration.
- Venue profile table and dashboard form.
- Saved DJs / favorites.
- Save DJ action on public DJ profiles.
- Listener dashboard with saved DJs.
- Reviews and ratings on DJ profiles.
- SoundCloud-like music layer with persistent listening across app navigation.
- In-app notification rows for booking requests.
- In-app notification rows for booking status changes.
- Dashboard notification feed.
- Real database tables and RLS policies for:
  - favorites
  - reviews
  - notifications
  - availability
  - venue_profiles
  - admin_reports

## V3 Prepared

- Payments table.
- Event tickets table.
- Stream sessions table.
- Subscriptions table.
- Booking details include an escrow/payment readiness panel.
- Documentation explains future marketplace architecture.

## Not Yet Fully Implemented

- Real escrow provider integration.
- Real payment checkout.
- Real payout release/refund/dispute flow.
- Full ticket checkout.
- Full admin moderation interface.
- DJ availability editor UI.
- Advanced notification center with read/unread actions.
- AI recommendation system.
- AI lineup matching.
- Production-grade media CDN/transcoding.
- Comments, reposts, and timed public comments similar to mature music platforms.
- Private paid streaming access.

## Current Escrow Position

Escrow is currently prepared at schema and UI-concept level, but it is not connected to a real payment provider.

For a real pre-release, escrow should be implemented as a separate, carefully isolated payment module using a provider such as Stripe Connect or another marketplace payment provider. The frontend must never handle secret keys. Payment state should be written by secure server routes or webhooks, not by direct client-side updates.

Recommended escrow lifecycle:

- organizer/venue creates booking request;
- DJ accepts booking;
- organizer/venue pays deposit or full amount;
- payment state becomes `paid`;
- funds stay held by provider/escrow flow;
- after event completion, status becomes `released`;
- disputes can move payment to `disputed`, `refunded`, or `failed`.

## Music Experience Position

The SoundCloud-like listening layer is now an implemented product layer rather than future scope:

- users can play tracks from Explore, Track Page, Artist Dossier, Sound Vault, and music management surfaces;
- the global player persists across navigation and supports queue, next, previous, repeat-one, favorite/save, and selected booking moments;
- Sound Vault stores saved tracks, saved moments, playlists, queue/history context, and booking-ready evidence;
- DJs can upload audio with metadata and cover artwork, then manage those tracks from `/library`.

Remaining future music scope is deeper social behavior: public comments, reposts, advanced queue collaboration, and production-grade media processing.
