# ROOM_9 Supabase RLS Audit

Date: 2026-05-19

This audit is based on the current `supabase/schema.sql`. It checks whether the main pre-release data surfaces are user-scoped and safe for a diploma demo without using a frontend `service_role` key.

## Result

The current schema already has RLS enabled for all core public tables and storage buckets used by ROOM_9. The most important Sound Vault, booking, notification, event, and media tables are scoped by `auth.uid()` or by explicit booking/event ownership relationships.

## May 19 Code-Level Scope Check

The current `supabase/schema.sql` was re-checked for the data surfaces that can leak between accounts:

| Surface | Required scope | Policy result |
| --- | --- | --- |
| `playlists` | Only owner can insert/update/delete; authenticated users can read own playlists and public playlists | OK |
| `playlist_tracks` | Track membership can only be changed when the parent playlist belongs to `auth.uid()` | OK |
| `saved_moments` | Users can manage own Atmosphere Briefs; target DJ can only update case-linked moment state through booking/event relationships | OK |
| `saved_tracks` | Users can select/insert/delete only own liked/saved track rows | OK |
| `notifications` | Users can read/update/delete own notifications; insert is limited to self, booking counterparty, or admin | OK |
| `bookings` | Organizer/Venue can insert own requests; organizer, target DJ, and admin can read/update related rows | OK |
| `events` | Public events can be read; Organizer/Venue/Admin manage only their own events | OK |
| `event_lineup_slots` | Event owner manages slots; target DJ can update slot state only through related booking | OK |
| `track_audio_features` | Public can read features for public tracks; only track owner DJ can insert/update Music Lab models | OK |

No frontend `service_role` usage should be introduced. The frontend continues to use the public anon/publishable key and relies on RLS for account isolation.

Recommended live verification with two accounts remains mandatory before defense because schema review proves policy intent, while live testing proves Supabase project state matches the repository.

### SQL verification snippets

Run in Supabase SQL Editor to confirm RLS is enabled:

```sql
select
  n.nspname as schema,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
and c.relname in (
  'playlists',
  'playlist_tracks',
  'saved_moments',
  'saved_tracks',
  'notifications',
  'bookings',
  'events',
  'event_lineup_slots',
  'track_audio_features'
)
order by c.relname;
```

Run this to inspect current policies:

```sql
select
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
and tablename in (
  'playlists',
  'playlist_tracks',
  'saved_moments',
  'saved_tracks',
  'notifications',
  'bookings',
  'events',
  'event_lineup_slots',
  'track_audio_features'
)
order by tablename, policyname;
```

## Live Project Verification

Checked against the connected Supabase project on 2026-05-18:

- Project ref: `liedilmpafiugjsegcss`
- Status: active and healthy.
- Database: PostgreSQL 17.x.
- Core public tables checked through Supabase MCP have RLS enabled.
- Storage buckets checked through Supabase MCP:
  - `tracks`: public demo audio bucket, 50 MB limit, MP3/WAV MIME types.
  - `images`: public demo image bucket, 10 MB limit, JPG/PNG/WebP/GIF MIME types.
  - `documents`: public demo rider/document bucket, 10 MB limit, PDF MIME type.

Security advisor result:

- `auth_leaked_password_protection`: warning. Supabase Auth leaked password protection is disabled. This is acceptable for a controlled diploma demo, but it should be enabled before a public release: [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Performance advisor result:

- Several policies trigger `auth_rls_initplan` warnings because some RLS checks call `auth.uid()` or helper logic directly inside policies. For scale, rewrite those expressions to use `(select auth.uid())` or equivalent cached helper checks.
- Some tables have multiple permissive policies for the same role/action. This is understandable for demo readability, but production should merge overlapping policies where possible.
- A few future/V3 tables had unindexed foreign keys (`admin_reports`, `payments`, `profile_views`, `reviews`, `track_plays`). Covering indexes were added to `supabase/schema.sql` and applied to the live Supabase project on May 19, 2026.
- `payments` had update grants but no matching update policy. A related-user/admin update policy was added for the escrow preview layer and verified in the live project.
- The follow-up advisor check no longer reports the missing FK-index warnings. Remaining performance warnings are policy-shape optimizations (`auth_rls_initplan`, multiple permissive policies) and unused-index info expected for a pre-release/demo dataset.
- Many unused-index notices are expected because the project is still in demo/pre-release and has limited traffic. Do not remove indexes purely because of early unused warnings.

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
