# ROOM_9 V4 Design Report

Date: 2026-05-10

## Result

Created a client-ready V4 Figma direction for ROOM_9 as a desktop-first commercial music platform with booking tools.

Figma start frame:
https://www.figma.com/design/fAx6fYKPenu7LBomlrCTVA/portfolio?node-id=451-879

Presentation / UI Kit frame:
https://www.figma.com/design/fAx6fYKPenu7LBomlrCTVA/portfolio?node-id=451-2509

## Product Direction

ROOM_9 is now positioned as a music-first platform for DJ sets, live streams, discovery, saved music, and booking.

The registration model is changed conceptually:

- every user starts with one listener account;
- DJ tools are unlocked after DJ role verification;
- organizer tools are unlocked after organizer role verification;
- regular users stay focused on listening, saving tracks, events, streams, and discovery.

This makes the product feel closer to SoundCloud / Spotify / Apple Music for music behavior, with Resident Advisor / DICE / Boiler Room logic for events, streams, and booking.

## Screens Created

The V4 prototype contains 15 top-level desktop frames:

1. Home
2. Explore DJs
3. DJ Profile
4. Booking Flow
5. Dashboard / Role Access Center
6. DJ Tools
7. Organizer Tools
8. Events
9. Event Detail
10. Live Streams
11. Stream Studio
12. Music Library
13. Booking Details / Chat
14. Login
15. Register

Also added:

- Client Presentation + UI Kit V4 frame
- palette, player treatment, component direction, and product rationale
- clickable prototype navigation

## Prototype Wiring

Figma reactions were added to all V4 navigation zones.

Validation:

- total interactive hotspots: 138
- wired hotspots: 138
- missing reactions: 0

The first attempt failed because Figma rejects some prototype destinations when screens are nested inside a large board frame. The final V4 screens were therefore created as top-level frames, which allowed stable prototype navigation.

## UX / UI Decisions

### Music-First Structure

The interface prioritizes listening before booking:

- persistent bottom player;
- queue-like discovery;
- public sets on DJ profiles;
- music library with saved and liked items;
- stream archive and live stream discovery.

### Booking Layer

Booking is treated as a professional workflow:

- request form;
- escrow-ready payment preview;
- booking case file;
- chat and status history;
- organizer and DJ operational dashboards.

### Visual Style

The design keeps the existing ROOM_9 brutalist identity but makes it more commercial:

- black / off-white base;
- acid green as a controlled functional accent;
- thin borders;
- dense editorial spacing;
- fewer generic cards;
- more list, archive, queue, waveform, and dashboard surfaces;
- global player inspired by Spotify / Apple Music behavior but styled in ROOM_9 brutalism.

### Typography

The design uses heavy uppercase display typography for page identity and tighter utility typography for interface controls. Home and Explore hero typography were adjusted after QA to prevent body copy overlap.

## Research Basis

Key references used:

- Spotify design system thinking and Encore principles
- Spotify product principles around relevance and ease of use
- SoundCloud continuous listening and queue behavior
- Apple Human Interface Guidelines for clarity, consistency, and feedback
- Nielsen Norman Group usability heuristics
- Dieter Rams principles of usefulness, clarity, and restraint
- DICE / Resident Advisor / Boiler Room / Bandcamp / Beatport as category references

## Implementation Notes For Code

When V4 is moved into the Next.js app:

- keep the persistent global audio player across pages;
- change auth onboarding to one account first, role verification later;
- make Dashboard a listener home by default;
- move DJ-only actions into DJ Tools;
- move event and lineup work into Organizer Tools;
- keep Explore as a sound-first discovery surface, not just a card grid;
- add saved tracks, liked tracks, queue, lyrics, covers, play analytics, and booking status as first-class UI states.

## QA Notes

Checked visually:

- Home
- Explore
- DJ Profile
- Dashboard
- Client Presentation + UI Kit

Fixed during QA:

- Home hero copy overlap
- Explore hero copy overlap
- weak presentation frame density
- prototype reaction issue caused by nested frames

Remaining design work before code polish:

- refine all secondary screens with final production copy;
- expand the UI Kit into reusable component specs;
- decide final font license / production font fallback;
- prepare exact component mapping for the Next.js implementation.
