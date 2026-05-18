# ROOM_9 Testing Checklist

Use this checklist after running `supabase/schema.sql`, restarting the dev server, and opening `http://localhost:3001`.

## Auth And Roles

- Register as DJ.
- Register as Organizer.
- Register as Venue.
- Register as Listener.
- Login/logout returns to the correct public page.
- DJ and Venue accounts open `/dashboard`.
- Organizer and Listener accounts can browse `/explore`.

## Track Upload

- DJ creates or updates a DJ profile.
- DJ uploads an MP3 file with title, genre, BPM, description, visibility, and cover image.
- DJ uploads a WAV file successfully.
- Invalid audio file shows a clear error.
- Invalid cover image shows a clear error.
- Missing `tracks` bucket shows a clear bucket error.
- Missing `images` bucket shows a clear bucket error.
- Uploaded track appears in Sound Vault.
- Public track appears on the public DJ profile.
- Private track stays out of the public DJ profile.

## Global Audio Player

- Click Play on a public DJ profile track.
- Bottom global player opens.
- Player shows cover image, title, and artist/stage name.
- Play/pause works.
- Progress bar moves during playback.
- Current time and duration display.
- Volume slider changes volume.
- Save button toggles saved state.
- Player remains visible while navigating to another page.
- Previous/next works when playing from a track list with multiple tracks.

## Track Library Management

- DJ can play a track from Sound Vault.
- DJ can edit track title.
- DJ can edit genre, BPM, key, description, lyrics/notes, and visibility.
- DJ can change track cover image.
- DJ can archive/delete a track after confirmation.
- Archived track disappears from Sound Vault.
- Archived track does not appear on public DJ profile.
- Play count increases after playback.
- Dashboard shows uploaded track count and track play analytics.

## DJ Profile Music Section

- Public DJ profile shows a music section.
- Each public track shows cover, title, genre/BPM/key, play button, play count, and lyrics/notes.
- Empty state appears when no tracks are public.
- Clicking a track uses the global player, not a separate inline-only player.

## Booking And Chat

- Organizer sends booking request.
- Venue sends booking request.
- DJ sees incoming booking.
- DJ accepts booking.
- DJ declines booking.
- Booking details page opens.
- Chat messages send and display for both sides.
- User can archive a chat from dashboard.
- Archived chat disappears from active booking list.
- Archived chats appear in the archived section.
- User can restore an archived chat.

## Events And Streams

- Organizer can create an event page.
- Venue can create an event page.
- Public events page loads.
- Event detail page loads.
- Streams page loads.
- DJ stream management page still loads.

## Build Checks

- `npm run lint` passes.
- `npm run build` passes.
