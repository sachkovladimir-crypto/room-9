# ROOM_9 Performance Scalability

## Implemented Now

The MVP includes safe performance improvements that do not change the product architecture:

- Explore DJs uses a fixed page size instead of an unbounded query.
- Explore DJs fetches explicit DJ profile columns instead of `select("*")`.
- Explore DJs orders results by `created_at` for predictable pagination.
- Loading, error, and empty states are visible in the UI.
- Public lists avoid unnecessary joins.
- Database indexes are included in `supabase/schema.sql` for frequently queried fields.

Current important indexes:

- `dj_profiles(city)`
- `dj_profiles(country)`
- `dj_profiles(genres)`
- `dj_profiles(is_available)`
- `dj_profiles(created_at)`
- `bookings(dj_id)`
- `bookings(organizer_id)`
- `bookings(status)`
- `bookings(created_at)`
- `booking_messages(booking_id)`
- `booking_messages(sender_id)`
- `works(dj_id)`
- `events(event_date)`
- `events(city)`
- `live_streams(status)`
- `profile_views(dj_id)`
- `track_plays(dj_id)`

## Current MVP Limits

The current search is still simple and suitable for a diploma MVP. It filters the loaded DJ profiles by stage name, bio, genre, city, country, BPM, price, theme, and links. For a larger public catalog, server-side search or search indexing should replace client-only filtering.

## Future Improvements

Future performance work should include:

- server-side pagination with total counts;
- search indexing for genre, city, country, BPM, price, and stage name;
- CDN delivery for images, audio, and video;
- image optimization and responsive media sizes;
- caching for public DJ, event, and stream pages;
- background jobs for media processing and notification delivery;
- file size limits for uploads;
- audio/video transcoding;
- rate limiting for auth, booking, chat, and upload actions;
- monitoring for slow queries and client errors.

## Scaling Principle

ROOM_9 should optimize based on measured bottlenecks. At MVP stage, simple limits, explicit selects, and database indexes are enough. At V3 scale, public discovery, media delivery, analytics, and recommendations will need dedicated performance work.
