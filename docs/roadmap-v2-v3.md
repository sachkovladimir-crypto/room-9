# ROOM_9 Roadmap: V2 and V3

ROOM_9 started as a diploma MVP focused on one stable demo flow: DJ registration, DJ profile creation, track upload, organizer discovery, booking request, booking status update, and booking chat.

The codebase has now started the pre-release transition: Listener and Venue roles are available in registration, DJ profiles support saved DJs and reviews, dashboards can show notifications, venue accounts get their own profile flow, and booking details contain a V3 escrow/payment readiness panel without a real payment provider.

The next versions should expand the system gradually. V2 increases platform interaction and user roles. V3 turns ROOM_9 into a full marketplace ecosystem.

## V2: Platform Expansion

V2 should keep the current modular Next.js + Supabase foundation but add deeper product behavior around discovery, trust, events, and availability.

Core V2 additions:

- Admin role for moderation and system-level management.
- Listener role for browsing, listening, following DJs, watching streams, and saving events.
- Venue / Club role as a separate organizer-like role for physical locations.
- Reviews and ratings after completed bookings.
- Favorites / saved DJs for listeners and organizers.
- Notifications for bookings, event updates, stream reminders, and moderation events.
- DJ availability calendar with available, unavailable, and booked dates.
- Better event management with venue ownership, lineup editing, and event status.
- Basic moderation for public DJ profiles, events, streams, and reports.
- Improved booking lifecycle beyond pending, accepted, and declined.

Implemented in the current pre-release pass:

- Listener role registration.
- Venue role registration.
- Venue dashboard profile form.
- Favorites / saved DJs.
- Reviews and ratings on DJ profiles.
- In-app notification rows for booking events.
- V2/V3 database tables and RLS policies.

Still planned for later V2:

- Full Admin moderation UI.
- Full DJ availability editor.
- Notification center with read/unread actions.
- More formal booking lifecycle screens.

V2 role intent:

| Role | Purpose | Main Permissions |
| --- | --- | --- |
| DJ | Artist profile and booking receiver | Manage DJ profile, upload tracks, manage streams, read incoming bookings, accept/decline requests |
| Organizer | Person or agency booking DJs | Browse DJs, create bookings, manage sent bookings, communicate with DJs, publish events |
| Venue | Physical club or venue | Create venue profile, publish recurring events, book DJs, manage venue calendar |
| Listener | Public audience account | Browse DJs, listen to tracks, watch streams, favorite DJs, save events, receive notifications |
| Admin | Internal platform operator | Moderate users, DJ profiles, events, reports, categories, and system statistics |

Admin is intentionally outside the regular booking flow. Admin actions should be isolated in a separate moderation interface.

Organizer and Venue are related but not identical:

- Organizer = person, promoter, collective, or agency booking DJs for events.
- Venue / Club = physical location with address, capacity, public venue profile, recurring events, and venue calendar.

## V3: Marketplace / Ecosystem

V3 should evolve ROOM_9 from a booking MVP into a marketplace with monetization, public audience participation, and intelligent discovery.

Core V3 additions:

- Payments and escrow for booking deposits and payout release.
- Ticketing for public events.
- Advanced analytics for DJs, organizers, venues, streams, and events.
- AI DJ recommendations based on genre, location, BPM, price, availability, and previous bookings.
- AI lineup matching for organizers and venues.
- Premium DJ profiles with richer media and promotion.
- Subscription plans for DJs, venues, or organizers.
- Public listener accounts with favorites, saved events, stream reminders, and tickets.
- Internationalization and multi-language support.
- Advanced stream sessions with scheduling, live/archive states, viewer metrics, and CDN/encoding support.
- Admin reports and trust/safety workflows.

## Booking Lifecycle

Current MVP statuses:

- pending
- accepted
- declined

Future lifecycle:

- pending -> accepted -> completed
- pending -> declined
- accepted -> cancelled
- accepted -> paid -> completed
- paid -> disputed / refunded

Payments should not be implemented in the MVP because they require provider integration, audit logs, stronger security isolation, refunds, and legal/compliance handling. They belong in V3.

## Version Strategy

V2 should prioritize interaction depth: roles, favorites, reviews, notifications, availability, moderation, and better event management.

V3 should prioritize ecosystem scale: payments, ticketing, AI matching, subscriptions, advanced analytics, and trust/safety operations.

This roadmap keeps ROOM_9 realistic for diploma delivery while showing a clear path from MVP to platform.
