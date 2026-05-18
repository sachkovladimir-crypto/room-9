# ROOM_9 Technical Summary

ROOM_9 is a desktop-first web platform for DJ discovery, music listening, and booking. The system is implemented with Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth, Supabase PostgreSQL, and Supabase Storage.

## Core Architecture

The project uses a modular monolith architecture. Authentication, profiles, booking, events, streams, chat, track uploads, and analytics are implemented inside one deployable Next.js application. This is appropriate for a diploma and pre-release stage because it keeps development, debugging, and deployment simpler than a distributed microservice architecture.

## Music Listening Layer

The music listening layer transforms uploaded tracks from static attachments into a platform-level media module.

Earlier versions treated audio as a file displayed inside a DJ profile. The current version introduces a persistent global audio player and structured track metadata. This means users can start playback from a DJ profile or Sound Vault and continue listening while navigating through the app.

Track records support:

- audio URL;
- title;
- cover image;
- description;
- lyrics or notes;
- genre;
- BPM;
- musical key;
- public/private visibility;
- play count;
- like count;
- archived/deleted state.

The player uses native HTML audio and React context. It does not depend on external music services.

## Track Management

DJs can upload tracks with metadata and cover images. Audio files are stored in the Supabase `tracks` bucket. Cover images are stored in the `images` bucket. Metadata is stored in the `works` table.

DJs can also edit track metadata, change cover images, archive tracks, and see play/like counters in Sound Vault.

## Analytics

The dashboard calculates simple analytics from current database tables:

- profile views;
- track play rows;
- track `play_count`;
- uploaded tracks;
- saved/favorited DJ count;
- booking requests;
- accepted bookings.

The system intentionally avoids overbuilt analytics charts at this stage. Simple dashboard cards are enough for a stable pre-release and diploma demonstration.

## Chat Archive Behavior

Booking chat is connected to bookings. Instead of physically deleting messages, the system supports per-side chat archiving:

- `archived_by_dj`;
- `archived_by_organizer`.

Archived chats disappear from the active booking list for that side and remain available in an archived section. This preserves message history while allowing users to keep the dashboard clean.

## Escrow Payments

The system contains V3-ready payment database structures and an escrow readiness panel on booking details, but it does not process real money yet.

Real escrow should be implemented through a secure marketplace payment provider, such as Stripe Connect or a comparable provider. Secret keys, payment state updates, webhooks, refunds, and disputes must be handled server-side, not directly from the frontend.

Recommended payment lifecycle:

- organizer or venue sends booking request;
- DJ accepts;
- organizer or venue pays deposit or full fee;
- payment becomes `paid`;
- funds are held by the provider;
- after event completion, payment is `released`;
- disputes can become `disputed`, `refunded`, or `failed`.

## Conclusion

ROOM_9 now demonstrates not only booking logic, but also a platform-level media module. This improves the product argument: DJs are not only listed for booking; their sound becomes directly discoverable, playable, measurable, and connected to the booking flow.
