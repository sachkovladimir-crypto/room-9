# ROOM_9 Product Model

## Core Positioning

ROOM_9 is a music streaming, sound discovery, live stream, event, and DJ booking platform.

The product principle is:

**Music platform first. Booking layer second.**

Users should be able to use ROOM_9 as a listening platform even if they never book an artist. Booking becomes a professional workflow that starts from sound evidence, selected moments, saved tracks, and artist dossiers.

## Account Model

Every user starts as a **listener**.

Inside the workspace, the user can unlock or verify additional toolsets:

- **DJ tools**: profile, tracks, playlists, streams, performance signals, incoming booking offers.
- **Organizer tools**: events, lineup slots, sent booking requests, saved sound moments, booking cases.
- **Venue tools**: venue profile, recurring events, public venue context, lineup management.

This avoids forcing users to choose a rigid identity during registration. A user can listen first, then activate professional tools later.

## Public Product Layer

The public layer is focused on music and discovery:

- Home
- Explore
- Track Page
- Artist Dossier
- Events
- Streams

Public flow:

1. Discover a sound.
2. Listen in the global player.
3. Open the Track Page.
4. Save, queue, favorite, or inspect the artist.
5. If needed, book from a selected timestamp.

## Workspace Product Layer

The workspace is focused on operations:

- `/dashboard`: overview, next actions, blocked items, current state.
- `/dashboard/bookings`: booking CRM and case workflow.
- `/dashboard/events`: event desk and lineup planning.
- `/library`: Sound Vault, track upload, playlist management, favorites, queue, listening history, saved moments, releases, and DJ music operations.
- `/dashboard/calendar`: operational timeline, conflicts, pending and accepted dates.
- `/dashboard/settings`: account, role access, verification, profile editing.
- `/dashboard/analytics`: music and booking metrics.

`/dashboard/music` is intentionally retired from the IA and redirects to `/library`. Music is not a dashboard-only tool: Sound Vault is the shared product surface for listeners, DJs, organizers, and venues.

## Music Platform Mechanics

Implemented/prepared mechanics:

- Persistent global audio player.
- Queue playback.
- Previous/next track controls.
- Repeat-one mode.
- Favorite tracks.
- Personal playlists scoped per account, backed by Supabase when signed in and local demo storage when not signed in.
- Sound Vault saved moments and booking-ready moment objects.
- Listening history.
- Cover images and fallback cover artwork.
- Track upload with metadata.
- Artist music section in each DJ profile.

## Booking Model

Booking starts from sound, but does not replace listening.

Professional booking flow:

1. Track or DJ set is discovered.
2. User selects a timestamp/moment.
3. Booking request preserves `workId` and timestamp `t`.
4. Booking becomes a case file with status, messages, sound reference, and operational next actions.

MVP database can keep simple statuses while the UI presents a more professional case lifecycle:

- Request sent
- Offer opened
- Fee discussed
- Rider needed
- Contract next
- Deposit / escrow preview
- Confirmed

## Escrow Direction

For pre-release, ROOM_9 should use an **Escrow Preview Layer** rather than full payment processing:

- booking amount
- deposit
- platform fee
- status: not funded / deposit pending / escrow ready
- action: Prepare Payment

Full Stripe/payment-provider integration is V3 scope because it requires webhooks, refunds, dispute handling, audit logs, and stronger security isolation.
