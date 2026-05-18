# ROOM_9 Supabase RLS Audit

Date: 2026-05-14

Scope: persistence tables used by the pre-release MVP layer: playlists, playlist tracks, saved moments, notifications, bookings, events, and event lineup slots.

## Live Project Check

The live Supabase project `liedilmpafiugjsegcss` was inspected with Supabase tooling.

Confirmed live tables with RLS enabled:

- `public.playlists`
- `public.playlist_tracks`
- `public.saved_moments`
- `public.notifications`
- `public.bookings`
- `public.events`
- `public.event_lineup_slots`

The local schema in `supabase/schema.sql` is aligned with the live policy patch for notifications and event deletion.

## Access Matrix

| Table | Read | Create | Update | Delete |
| --- | --- | --- | --- | --- |
| `playlists` | Owner can read own playlists. Authenticated users can read public playlists. | Owner only, `user_id = auth.uid()`. | Owner only. | Owner only. |
| `playlist_tracks` | Owner can read tracks in own playlist. Authenticated users can read tracks in public playlists. | Playlist owner only. | Playlist owner only, used for reorder. | Playlist owner only. |
| `saved_moments` | Owner only. | Owner only, unique by `user_id + work_id + timestamp_seconds`. | Owner only. | Owner only. |
| `notifications` | Recipient only. | Recipient can create self notifications. Booking counterparties can notify each other after a booking relationship exists. Admin can create. | Recipient only, used for marking read. | Recipient only. |
| `bookings` | Organizer, target DJ profile owner, or admin. | Organizer/Venue only, with `organizer_id = auth.uid()`. | Organizer, target DJ profile owner, or admin. | Not exposed in MVP. Archive/status should be used instead. |
| `events` | Public read for event browsing. | Organizer/Venue only, with `organizer_id = auth.uid()`. | Owning Organizer/Venue only. | Owning Organizer/Venue only. |
| `event_lineup_slots` | Public read for event pages and workspace previews. | Owning event Organizer/Venue only. | Owning event Organizer/Venue only. | Owning event Organizer/Venue only. |

## Persistence Behavior

- Playlists and playlist order persist through `playlists` and `playlist_tracks`.
- Saved sound moments persist through `saved_moments`; unauthenticated users fall back to local storage.
- Notifications persist through `notifications` and are scoped to the recipient account.
- Booking cases persist through `bookings` and `booking_messages`.
- Event Desk data persists through `events` and `event_lineup_slots`.

## Changes Applied

- Replaced the overly broad `notifications` insert policy with a counterparty-aware policy.
- Added `notifications` delete-own policy for future notification center cleanup.
- Added `events` delete-own policy for Organizer/Venue ownership.
- Tightened anonymous analytics inserts:
  - `profile_views` can only insert views for an existing DJ profile.
  - `track_plays` can only insert plays for a valid non-deleted work and matching DJ.
- Restricted Storage listing policies to owner folders while keeping public buckets usable for public media URLs.
- Revoked direct RPC execution of `public.handle_new_user()` from `public`, `anon`, and `authenticated`; it remains available to the auth trigger.
- Added indexes for current workspace joins:
  - `idx_events_organizer_id`
  - `idx_live_streams_owner_id`
  - `idx_saved_moments_dj_id`
  - `idx_listening_history_work_id`
  - `idx_event_lineup_slots_dj_id`
  - `idx_event_lineup_slots_saved_moment_id`

## Remaining Security Notes

The Supabase security advisor now leaves one project-level Auth setting:

- Leaked password protection is disabled.

This must be enabled in Supabase Dashboard > Authentication > Security. It is not a schema-level change.

The public `tracks` and `images` buckets remain intentionally public for the demo, but object listing is now scoped to authenticated owner folders. For production, private buckets with signed URLs should still be considered for unreleased/private media.
