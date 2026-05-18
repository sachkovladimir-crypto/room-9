# ROOM_9 Supabase RLS Audit

Date: 2026-05-18

This audit is based on the current `supabase/schema.sql`. It checks whether the main pre-release data surfaces are user-scoped and safe for a diploma demo without using a frontend `service_role` key.

## Result

The current schema already has RLS enabled for all core public tables and storage buckets used by ROOM_9. The most important Sound Vault, booking, notification, event, and media tables are scoped by `auth.uid()` or by explicit booking/event ownership relationships.

## User-Scoped Music Data

| Surface | Tables | Current Access Model | Status |
| --- | --- | --- | --- |
| Liked / saved tracks | `saved_tracks` | User can select, insert, delete only rows where `user_id = auth.uid()` | OK |
| Saved moments / Atmosphere Briefs | `saved_moments` | User can select, insert, update, delete own moments; related DJ can update case-linked moment status | OK |
| Playlists | `playlists` | User can manage own playlists; public playlists can be selected | OK |
| Playlist tracks | `playlist_tracks` | User can manage tracks only inside playlists they own; public playlist membership can be selected | OK |
| Listening history | `listening_history` | User can select, insert, delete only own rows | OK |
| Interactions / Signal Engine | `user_interactions` | User can select, insert, delete only own rows | OK |
| User taste profile | `user_sound_profile` | User can select, insert, update, delete only own profile | OK |

## Booking / Event Ownership

| Surface | Tables | Current Access Model | Status |
| --- | --- | --- | --- |
| Booking requests | `bookings` | Organizer/Venue can create own bookings; organizer and target DJ can select/update related rows | OK |
| Booking chat | `booking_messages` | Only organizer or target DJ can read/insert messages for related booking | OK |
| Event Desk | `events` | Public events can be selected; Organizer/Venue/Admin access can create/update/delete own events | OK |
| Lineup slots | `event_lineup_slots` | Event owner can manage slots; related DJ can update slot state through booking relationship | OK |
| Payments / escrow preview | `payments` | Organizer, payer, receiver, or target DJ can select; related users can insert preview rows | OK for preview |

## Notifications

| Surface | Tables | Current Access Model | Status |
| --- | --- | --- | --- |
| Notification center | `notifications` | User can select/update/delete own notifications; authenticated insert is limited to self or booking counterparties/admin | OK |

## Media Storage

| Bucket | Usage | Current Access Model | Status |
| --- | --- | --- | --- |
| `tracks` | Audio uploads | Users manage files only in their own top-level folder | OK |
| `images` | Avatars, covers, posters, playlist/release covers | Users manage files only in their own top-level folder | OK |
| `documents` | Technical riders | Users manage files only in their own top-level folder | OK |

## Notes

- No frontend code should use a `service_role` key.
- The schema uses `profile_role_access` for DJ, Organizer, Venue, and Admin unlock gates while preserving the legacy `profiles.role` field.
- Public tables like `works`, `releases`, `events`, `live_streams`, and `dj_profiles` allow public reading where needed for music discovery.
- Private user state stays scoped to `auth.uid()`.

## Recommended Verification Before Defense

Run the latest `supabase/schema.sql` in the Supabase SQL Editor, then test with two accounts:

1. Account A creates a playlist and saved moment.
2. Account B logs in and confirms Account A's private playlist and saved moment are not visible.
3. Account B creates a booking request.
4. Account A as DJ confirms only related booking rows and messages are visible.
5. Account B confirms it can only update/cancel its own organizer-side booking rows.

## Remaining Hardening For Real Production

- Move rider documents to a private bucket with signed URLs.
- Add stricter payment rows once a real provider is connected.
- Add admin moderation policies that rely on trusted app metadata or database role access, not editable user metadata.
- Add rate limiting for booking requests, chat messages, uploads, and notifications.
- Add audit logs for booking status changes and payment status changes.
