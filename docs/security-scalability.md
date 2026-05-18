# ROOM_9 Security Scalability

## Current MVP Security

ROOM_9 currently uses:

- Supabase Auth for email/password authentication;
- roles stored in the `profiles` table;
- Row Level Security policies in Supabase;
- user-specific profile updates;
- DJ profile update restrictions by owner;
- booking access restrictions for organizer and target DJ;
- booking status updates restricted to the target DJ;
- public read access only for public discovery data;
- public Storage buckets for diploma-safe media demos;
- environment variables for Supabase keys;
- no `service_role` key in frontend code;
- visible but safe error messages in the UI.

## Implemented / Prepared Now

The schema prepares the role model for:

- `dj`
- `organizer`
- `admin`
- `listener`
- `venue`

The MVP registration UI still exposes only DJ and Organizer. This keeps the current demo flow simple while allowing V2/V3 role expansion in the database and TypeScript types.

The schema also validates upload buckets with MIME limits for public demo buckets:

- `tracks`: MP3/WAV audio
- `images`: JPEG/PNG/WebP/GIF images

## Role Permission Matrix

| Role | Read | Create | Update | Delete / Moderate |
| --- | --- | --- | --- | --- |
| DJ | Own dashboard, public DJs, own bookings, related chat | DJ profile, tracks, streams, booking messages | Own DJ profile, own works, booking status | Own media later; no platform moderation |
| Organizer | Public DJs, own sent bookings, related chat, events | Booking requests, events, booking messages | Own events and organizer profile | Own events later |
| Venue | Public DJs, own venue data, venue events | Venue profile, venue events, booking requests | Venue profile, venue calendar, venue events | Own venue events later |
| Listener | Public DJs, tracks, streams, events | Favorites, saved events, reviews after eligible interactions | Own listener profile and preferences | Own saved items later |
| Admin | System-wide data needed for moderation | Reports/categories/admin notes | Moderation state, categories, flagged content | Remove inappropriate content and resolve reports |

Admin must not be part of the regular booking flow. Admin permissions should live in a separate moderation interface.

## Future Security Work

Future versions should add:

- admin moderation tools;
- abuse reports;
- audit logs for sensitive actions;
- stronger permission matrix for all roles;
- rate limiting;
- email verification rules for production;
- payment service isolation;
- secure streaming access;
- private buckets with signed URLs for paid/private content;
- GDPR/privacy export and delete functions;
- stricter validation for user-generated text, external links, and uploads.

## Security Principle

The MVP uses permissive but understandable demo RLS policies so the diploma flow works reliably without a service role key. V2/V3 should move toward stricter policies as features become public, monetized, or moderation-sensitive.
