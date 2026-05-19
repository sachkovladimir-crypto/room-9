# ROOM_9 Current Product Roadmap

This roadmap captures the current state of ROOM_9 after the MVP-to-pre-release work and defines the next implementation order.

Core principle:

**Music platform first. Booking layer second. Sound leads. Booking follows.**

ROOM_9 should not become only booking software. It should feel useful as a music platform even when a user never books an artist. Booking becomes the professional layer that grows out of listening behavior, saved moments, artist dossiers, events, and case files.

## 1. Current Product Point

ROOM_9 is no longer just the first diploma MVP. It is now a pre-release alpha with several real product layers.

Already implemented or prepared:

- Supabase Auth, profiles, role access, and RLS.
- Listener-first account model with unlockable DJ, Organizer, and Venue tools.
- Public music discovery: Home, Explore, Track Page, Artist Dossier, Events, Streams.
- Persistent global audio player with queue, repeat-one, progress, likes, and booking moment context.
- Sound Vault with saved tracks, liked tracks, playlists, queue, saved moments, listening history, and booking-ready objects.
- DJ upload and track management with cover images, metadata, release collections, and profile media.
- Releases with `releases` and `release_tracks`.
- Booking request from a selected sound reference.
- Booking case with chat, rider status, operational timeline, and escrow preview.
- Dashboard workspace pages: overview, bookings, events, calendar, analytics, streams, settings.
- Event Desk direction: event slots, saved sound moments, and booking requests.
- Role Verification Center direction in settings.
- Notification center.
- Supabase schema for playlists, saved moments, notifications, releases, and role access.

Current product status:

**Good enough for a strong diploma demo, but not yet clean enough for a confident pre-release.**

The next work should focus on reliability, IA clarity, product flow, and only then the recommendation algorithm.

Status, May 19, 2026:

- Pre-release branch currently contains deployment documentation plus the active polish package for Music Lab, password recovery, and recommendation visibility.
- `main` is now the source of truth for the pre-release package. `work/pre-release-polish` is an older branch point; its content has already been carried into `main` through the active polish commits.
- Music Lab now has a clearer locked-state boundary: listener accounts can no longer land on a confusing half-open lab surface.
- The shared waveform component was changed to scale inside tall and compact containers, so Music Lab, Track Page, DJ Dossier and Player can use the same visual language without leaving large empty blocks.
- Music Lab now includes a lightweight EQ Sketch panel. It is not a mastering tool; it stores a DJ-facing signal profile that can feed recommendations, room fit, and sound evidence.
- Music Lab workbench layout was tightened after visual QA: source queue, waveform, cue cards and EQ panels now use safer grid widths, non-overflowing cue labels and adaptive marker placement.
- Local blank-screen debugging found a corrupted `.next` dev cache rather than a product runtime bug. The cache was cleared and the app was restarted on `localhost:3001`.
- Signal Engine is now surfaced as a reusable product UI layer. Explore shows the current best match with explainable reasons and direct actions, while Track Page shows the same scoring model as a clear "Why this sound fits" panel with Sound Vault and Atmosphere Brief actions.
- Auth gained a proper password recovery path: `/forgot-password` sends a Supabase recovery email and `/update-password` lets the user set a stronger password from the recovery session.
- Registration now uses one password quality model across the app: 8+ characters, one letter, one number.
- Signal Engine is already implemented as a deterministic recommendation layer. It ranks tracks by genre, BPM, saved moments, playlists, room fit, energy, booking trust, and user archive behavior. The next step is to make these recommendations more visible and actionable across Sound Vault, Explore, Track Page and Event Desk.
- Explore now exposes Signal Engine reasoning directly in result rows instead of hiding it as a score only.
- Track Page now has a dedicated Signal Engine panel with sound match, booking fit, feature confidence, reasons and signal tags.
- Music Lab now includes an Analysis Summary output: recommendation bias, best event slot, EQ focus and brief readiness. This makes the DJ workbench read as a signal editing tool, not a confusing decoration.
- Supabase/RLS scope was re-audited in `docs/supabase-rls-audit.md` for playlists, playlist tracks, saved moments, saved tracks, notifications, bookings, events, event slots and Music Lab feature rows.

## 2. Main Recommendation

Do not implement a heavy AI system first.

The right move is:

1. Finish the product rails.
2. Make all user actions persist correctly.
3. Capture listening and booking behavior.
4. Then add a deterministic Signal Engine MVP.
5. Later evolve it into real AI/ML recommendations.

Reason:

An algorithm is only useful if the product already records meaningful behavior. If likes, saved moments, playlists, queue, event slots, and booking cases are unstable, recommendations will feel fake.

So the ideal strategy is:

**stabilize actions -> collect signals -> score matches -> show recommendations -> later add AI.**

## 3. Roadmap Overview

### Phase 0: Stability Lock

Goal: remove blockers that can break the demo flow.

Status, May 17, 2026:

- Local demo server was reset back to `localhost:3001` after production build so stale `_next/static` chunks do not leave the browser with an unstyled/empty page.
- Lint, TypeScript and production build pass after the latest reliability pass.
- Explore no longer allows invalid `Infinity:NaN` duration labels from browser audio metadata; UI and moment logic fall back to the stored `works.duration_seconds`.
- Global player now accepts stored track duration from the current track object, so demo/audio streams with infinite metadata do not break progress or timestamp display.

Priority:

- Keep only `localhost:3001` for local demo.
- Verify auth redirects and protected routes.
- Verify listener cannot bypass locked professional pages.
- Verify DJ can upload rider from booking case.
- Verify Organizer/Venue can open booking CRM only after role access unlock.
- Verify Supabase schema is fully applied.
- Verify RLS for:
  - playlists
  - playlist_tracks
  - saved_moments
  - notifications
  - bookings
  - events
  - releases
  - profile_role_access
- Verify storage buckets:
  - tracks
  - images
  - documents
- Artist Identity Pass:
  - Explore related artists should render real `avatar_url` / `cover_image_url` from Supabase before falling back to demo imagery.
  - DJ Dossier should show a visible avatar identity block, not only a cover background.
  - Settings media upload should create a DJ profile draft when avatar/cover/rider is uploaded before the profile has been saved.
- Auth Stability Pass:
  - Password reset email should redirect to `/update-password`.
  - Supabase Auth redirect URLs must include local and deployed recovery URLs.
  - Registration should stay listener-first while DJ / Organizer / Venue access unlocks in Settings.
- Music Lab Stability Pass:
  - Listener cannot bypass locked Music Lab.
  - DJ/Admin sees a readable workbench: source track, adaptive waveform, cue points, EQ Sketch, analysis tags.
  - Music Lab should feed track features and recommendation signals, not become a full DAW.

Status, May 18, 2026:

- Added a system-level text safety pass: headings, cards, buttons, badges, metrics and dense table rows must clamp, wrap, or scale instead of overflowing their containers.
- Release / EP / Album pages now treat Atmosphere Brief as an intentional action, not a permanent sidebar. The brief should open from a button as a glass drawer so long release titles and cover art keep priority.
- Sound Vault is moving from one overloaded terminal page into focused modes: Overview, Tracks, Briefs, Playlists, Uploads and Network. Modules can be hidden and restored so users control page density.
- Sound Vault mode URLs now resolve directly (`/library/tracks`, `/library/moments`, `/library/playlists`, `/library/uploads`, `/library/network`) instead of bouncing through query redirects. This makes the IA presentable as real product sections while preserving the shared Vault implementation.
- Booking CRM now supports a user-scoped remove/archive action. Cases are hidden from the current user's board without destroying the booking record for the other side.

Definition of done:

- Listener flow works.
- DJ flow works.
- Organizer flow works.
- Venue/event flow works.
- No user sees another user's private Sound Vault data.

### Phase 1: Information Architecture Lock

Goal: remove navigation confusion.

Status, May 17, 2026:

- Workspace access is now based on active role access rows instead of blindly trusting legacy `profiles.role`.
- Login fallback creates missing profiles as `listener`, keeping the new listener-first model intact.
- Login-to-register handoff now preserves `next` without forcing `role=organizer`; generic dashboard registration stays listener-first and professional access is unlocked later in Settings.
- Registering from a professional request path now sends the user to Role Verification with the original `next` URL preserved instead of looping back into a locked booking page.
- Booking from an artist as a logged-in listener now points to the Organizer unlock path, not a generic booking lock.

Public layer:

- `/`
- `/explore`
- `/track/[id]`
- `/dj/[id]`
- `/events`
- `/streams`
- `/library`
- `/release/[id]`

Workspace layer:

- `/dashboard`
- `/dashboard/bookings`
- `/dashboard/events`
- `/dashboard/calendar`
- `/dashboard/analytics`
- `/dashboard/streams`
- `/dashboard/settings`

Rules:

- `/library` is the main Sound Vault.
- `/dashboard/music` redirects to `/library`; music now lives in Sound Vault, not inside dashboard IA.
- Dashboard should not contain every feature. It should be a command center.
- Discover should not appear as a vague workspace item. Public discovery is `/explore`.
- Tools should be removed unless it becomes a real utility module.

Definition of done:

- A user always understands whether they are in public music mode or workspace mode.
- Dense pages have a clear depth model: public music discovery, Sound Vault mode, workspace operation, case file.
- No route should depend on a huge all-in-one screen when a mode/page can make the task clearer.

### Phase 2: Sound Vault Finalization

Goal: make Sound Vault the center of the music platform.

Status, May 17, 2026:

- Playlist mutation now checks playlist ownership before adding, removing, or reordering tracks. This protects user-scoped playlists even if demo policies are permissive.
- Queue/playback track objects now carry `durationSeconds` from stored track metadata across Explore, Track Page, Artist Dossier, Booking Preview, Release Page, Sound Vault and Music Lab.

Status, May 16, 2026:

- Core reliability pass completed.
- Playlist creation now uses the created Supabase row instead of guessing the first playlist.
- Empty remote playlist state no longer resurrects deleted local playlists.
- Track action menu now handles Supabase/local fallback errors without leaving buttons stuck.
- Saved moments emit a local sync event so Sound Vault can refresh when references are saved from Explore, Track Page, or Artist Dossier.
- Global player queue now supports viewing upcoming tracks, removing queued tracks, and clearing the queue.
- Lint and build passed after the pass.

Must work:

- Like and unlike tracks.
- Remove liked tracks.
- Add to playlist.
- Remove from playlist.
- Create playlist.
- Edit playlist.
- Upload playlist cover.
- Reorder playlist tracks.
- Add to queue.
- Remove from queue.
- See what plays next.
- Save moment.
- Remove saved moment.
- Use saved moment as an event/booking brief.
- Open track from Vault.
- Open artist from Vault.
- Create booking from saved moment.
- Hide and restore non-critical vault modules.
- Move between Vault modes without losing the current account scope or queue state.

Product rule:

Sound Vault is not only saved songs. It is the user's archive of useful sound evidence.

Next refinement:

- Convert the most important Vault modes into dedicated nested routes when the UI stabilizes:
  - `/library/tracks`
  - `/library/moments`
  - `/library/playlists`
  - `/library/uploads`
  - `/library/network`
- Keep `/library` as the Overview command surface.

Definition of done:

- Listener can build a taste archive.
- Organizer can turn a saved moment into a booking brief.
- DJ can understand which tracks create intent.

### Phase 3: Booking Operations Finalization

Goal: make booking feel professional, not just accepted/declined.

Status, May 18, 2026:

- Booking requests now preserve the full source chain: `eventId`, `slotId`, `momentId`, `workId`, and timestamp survive the login/register gate.
- New booking rows can store optional direct source context (`source_event_id`, `source_slot_id`, `source_saved_moment_id`) so case files can recover their Event Desk and Sound Vault origin even if the lineup slot sync is delayed.
- Saved moments now move to `used-in-booking` when a request is submitted, then to `in-case-file` only when the booking is accepted, paid, or completed.
- Booking case and Booking CRM status updates now sync both slot status and saved-moment status through the centralized booking operations helper.
- `supabase/schema.sql` includes the booking context columns and indexes, plus an RLS path that lets the related DJ update saved-moment case status through direct booking context.
- Booking CRM cards now expose the operational actions directly on the board: open case, see Event Desk / saved brief context, and remove the case from the current user's board without deleting the other side's record.

Status, May 17, 2026:

- Booking CRM effective role selection now uses active roles only, preventing old account role values from opening professional booking views.
- Booking Case ownership checks now rely on active DJ/Organizer/Venue/Admin access instead of raw legacy profile role values.
- Booking request gate now makes the path explicit: listener -> Organizer/Venue verification -> original booking request.

Status, May 16, 2026:

- Booking lifecycle logic is now centralized in `lib/bookingLifecycle.ts`.
- Booking CRM and Booking Case use the same stage model, next-action copy, timeline states and escrow preview calculations.
- Booking Case now performs an explicit client-side ownership check: only the organizer/venue attached to the case, the DJ who owns the artist profile, or admin can view it.
- DJ case actions are safer: only the DJ profile owner can accept, decline or upload the technical rider.
- Escrow remains a pre-release preview layer: deposit, platform fee, artist payout and provider state are shown without connecting real payments.

Status, May 17, 2026:

- Booking requests created from Event Desk now preserve the source saved moment ID in the request URL.
- After a booking is submitted, the matching saved moment is marked as `in-case-file`, so Sound Vault reflects that the reference became operational booking evidence.
- The booking success state now gives a direct `Open Case` action instead of forcing the user to hunt through the dashboard.
- The event slot still stores the created `booking_id`, `dj_id`, and `hold` state, keeping Event Desk, Booking CRM, and Booking Case connected.

Booking CRM columns:

- New Requests
- Negotiating
- Rider Needed
- Contract Next
- Escrow Preview
- Confirmed

Board actions:

- Open Case File.
- Accept / Decline for the DJ owner.
- Remove From Board for the current user.
- Cancel pending client-side requests when they are removed before an artist decision.

Booking case must show:

- Artist
- Event
- Fee
- Date
- Venue
- Selected sound reference
- Timeline
- Chat/log
- Rider state
- Contract state
- Escrow preview
- Next action

Copy shift:

- Do not say "sell sound".
- Use mature professional language:
  - Sound Reference
  - Atmosphere Brief
  - Use as Brief
  - Attach to Event Slot
  - Book DJ

Definition of done:

- A booking is clearly a case file with next actions, not a simple message thread.

### Phase 4: Event Desk

Goal: create the strongest diploma logic chain.

Status, May 17, 2026:

- Event Desk remains connected to the corrected booking access model: lineup-slot booking requests preserve `eventId`, `slotId`, `momentId`, `workId`, and timestamp, while the booking request page enforces Organizer/Venue access before submit.
- The Event Desk path is now safer for listener-first accounts because role access must be active before the Event Desk or Booking CRM can be opened.

Status, May 16, 2026:

- Event Desk already supports creating events, loading owned events, creating the five lineup slots, attaching saved sound references, and sending a booking request from a slot.
- The booking request flow now preserves `eventId` and `slotId`.
- After a booking request is created from a lineup slot, the slot stores `booking_id`, `dj_id`, and moves to `hold`.
- Event Desk reads linked booking status: pending requests show as `request sent`, accepted/paid/completed requests show as confirmed lineup slots, and declined/cancelled/disputed cases show as blocked.
- Event RLS in `schema.sql` now matches the listener-first model by allowing active Organizer/Venue role access from `profile_role_access`, not only the legacy `profiles.role` value.

Status, May 17, 2026:

- Event Desk now sends `momentId` with `workId`, `eventId`, `slotId`, and timestamp when using a saved sound reference as an atmosphere brief.
- The product flow now has a clearer return path: lineup slot -> booking request -> case file -> Event Desk / Booking CRM.

Status, May 18, 2026:

- Event Desk request counts now prioritize real `source_event_id` links before falling back to city matching, so the selected event command reflects the actual booking chain more accurately.
- Lineup slots can now recover their linked booking through `booking_id`, `source_slot_id`, or `source_saved_moment_id`, which makes the board more resilient if one sync step is delayed.

Core flow:

**music -> saved moment -> lineup slot -> booking request -> accepted DJ -> event lineup**

Event Desk must support:

- Create event.
- Edit event.
- Venue, date, city, capacity, budget.
- Lineup slots:
  - Opening
  - Support
  - Peak
  - Closing
  - Stream
- Attach saved sound reference to a slot.
- Choose DJ.
- Send booking request from the slot.
- Show accepted DJ in lineup.
- Show missing slots and conflicts.

Definition of done:

- Organizer can build an event from sound references instead of generic search.

### Phase 5: Role Verification Center

Goal: make role unlocking feel like a real system.

Status, May 18, 2026:

- Settings now treats roles as unlock paths rather than a one-time registration choice.
- `lib/roleVerification.ts` exposes shared helpers for next unlock step, completed-step count, and activation gate messages.
- The Role Verification Center now shows the selected path, readiness percentage, gate state, next required action, and direct CTA to the exact profile section or workspace needed.
- Role path cards are selectable and show active/selected/locked/complete state instead of static role descriptions.
- Settings no longer trusts stale `profiles.role` as the primary workspace mode when active role access is missing; listener mode stays the safe default.
- Organizer and Venue profile forms now have direct anchors for unlock guidance.
- Status badges now include a `complete` variant for finished role paths.

Status, May 16, 2026:

- Role unlock logic now lives in `lib/roleVerification.ts` instead of being scattered inside the Settings page.
- Settings now loads real product signals for verification:
  - uploaded DJ tracks
  - saved sound references
  - owned events
  - lineup slots
  - organizer/DJ booking cases
  - avatar, profile cover and technical rider state
- DJ readiness is based on actual profile, media, track, cover, rider, analytics and booking-trust steps.
- Organizer readiness is based on organization details, saved sound references, first event, attached lineup slot and first request.
- Venue readiness is based on venue profile, event creation, lineup slots, atmosphere brief and recurring timeline activity.
- Listener mode remains the default path and points users toward Sound Vault before professional tools.

Every user starts as Listener.

Unlock paths:

DJ:

- Complete public profile.
- Upload avatar.
- Upload cover.
- Upload first track.
- Add track cover.
- Upload rider.
- Unlock analytics.
- Unlock booking trust.

Organizer:

- Add organization details.
- Create first event.
- Save first sound moment.
- Send first request.
- Unlock Booking CRM.

Venue:

- Add venue name.
- Add address/city/capacity.
- Create venue event.
- Add lineup slot.
- Unlock recurring calendar.

Definition of done:

- Features unlock by readiness, not by random navigation.

### Phase 6: Signal Engine MVP

Goal: add an algorithm that makes ROOM_9 feel smarter without pretending to be full AI.

Status, May 16, 2026:

- `lib/signalEngine.ts` now contains the shared deterministic Signal Engine layer.
- Explore already uses it to rank tracks and explain why a sound matches.
- Sound Vault now builds a personal Sound Profile from saved tracks, playlists and saved moments.
- Sound Vault now shows a ranked signal index with match score, reason text, play and queue actions.
- Event Desk now suggests the best saved moment for each lineup slot: Opening, Support, Peak, Closing and Stream.
- Slot suggestions use BPM, energy, room type, saved-moment status and slot intent.
- `user_interactions` is now part of the schema so playback, queue, playlist, saved moment, event-slot and booking signals can be captured per user.
- The client now records the first behavior layer from the player, Sound Vault, Track Page, Event Desk and booking flow.
- `track_audio_features` is now part of the schema with RLS and API grants, so ROOM_9 has a safe place to persist normalized track descriptors.
- `lib/trackAudioFeatures.ts` now derives metadata-based audio features from title, genre, BPM, DJ profile context and waveform peaks when available.
- Signal ranking now reads those derived descriptors for energy, room fit, Sound DNA tags and explanation text before falling back to older metadata scoring.
- `user_sound_profile` is now part of the schema with private RLS, so a user's Sound Vault can persist an aggregated taste model between devices.
- `lib/userSoundProfile.ts` now builds the first deterministic taste model from saved tracks, playlists, saved moments and captured interactions.
- Sound Vault now uses the profile model for its Signal Engine panel and persists the model when the user is signed in.
- Explore now reads the persisted Sound Profile when available and blends it into discovery ranking as an intelligent default. Manual filters still override the model.
- Event Desk now reads the Sound Profile and uses it to improve lineup-slot recommendations, so saved moments are ranked by slot fit plus the user's taste model.
- This remains explainable scoring, not black-box AI.

The Signal Engine should analyze:

- Track metadata.
- Sound moment metadata.
- Listening behavior.
- Saved tracks.
- Liked tracks.
- Playlists.
- Queue.
- Listening history.
- Artist opens.
- Saved moments.
- Event slot usage.
- Booking starts.
- Booking conversions.

It should output:

- Sound Match score.
- Booking Fit score.
- Atmosphere Fit tags.
- Recommended tracks.
- Recommended DJs.
- Recommended saved moments for an event slot.
- Similar peak moments.
- "Why this matches" explanations.

Important:

This should start as deterministic scoring, not black-box AI.

## 4. Signal Engine System

### 4.1 Data Objects

Minimum useful objects:

- `track_audio_features`
- `user_interactions`
- `user_sound_profile`
- existing `works`
- existing `saved_moments`
- existing `playlists`
- existing `playlist_tracks`
- existing `listening_history`
- existing `bookings`
- existing `events`

Recommended future table: `track_audio_features`

Purpose: store normalized music descriptors.

Fields:

- id
- work_id
- bpm
- energy
- darkness
- groove
- intensity
- density
- vocal_presence
- room_fit
- moment_types
- sound_dna
- waveform_profile
- source
- confidence
- created_at
- updated_at

Recommended future table: `user_interactions`

Purpose: collect behavior signals.

Fields:

- id
- user_id
- work_id
- dj_id
- event_id
- interaction_type
- timestamp_seconds
- weight
- metadata
- created_at

Interaction types:

- play
- pause
- complete
- skip
- like
- unlike
- save_track
- remove_saved_track
- save_moment
- remove_moment
- add_to_playlist
- remove_from_playlist
- create_playlist
- add_to_queue
- remove_from_queue
- open_track
- open_artist
- attach_to_event_slot
- start_booking
- booking_sent

Recommended future table: `user_sound_profile`

Purpose: store aggregate taste vectors for fast matching.

Fields:

- id
- user_id
- preferred_genres
- bpm_min
- bpm_max
- avg_energy
- avg_darkness
- avg_groove
- preferred_room_types
- top_dna_tags
- saved_track_count
- saved_moment_count
- playlist_track_count
- interaction_count
- profile_vector
- confidence
- created_at
- updated_at

### 4.2 MVP Scoring Formula

The first version should be readable and explainable:

```ts
matchScore =
  genreMatch * 0.18 +
  bpmMatch * 0.14 +
  energyMatch * 0.18 +
  roomFitMatch * 0.14 +
  savedMomentSimilarity * 0.18 +
  userBehaviorMatch * 0.12 +
  bookingTrust * 0.06;
```

Booking Fit can be separate:

```ts
bookingFit =
  soundMatch * 0.45 +
  availability * 0.15 +
  bookingTrust * 0.2 +
  feeFit * 0.1 +
  cityFit * 0.1;
```

### 4.3 UI Placement

Explore:

- Sort by:
  - Energy Match
  - Similar to Saved
  - Booking Fit
  - New in Your Sound Zone
- Show small reason text:
  - "Matches saved peak moments"
  - "BPM inside your event range"
  - "High warehouse fit"

Track Page:

- Show Sound DNA.
- Show "Similar moments".
- Show "Recommended for Peak slot".

Artist Dossier:

- Show "Why this artist fits your sound profile".
- Show strongest sound reference.

Sound Vault:

- Add "Your Sound Profile".
- Add "Recommended from your archive".
- Add "High-intent moments".

Event Desk:

- For each lineup slot, suggest saved moments and DJs.
- Example:
  - Opening: hypnotic / lower energy / 125-132 BPM
  - Peak: high energy / warehouse / 135-145 BPM
  - Closing: atmospheric / pressure release / 128-136 BPM

Analytics:

- Show funnel:
  - Play
  - Save
  - Moment
  - Open artist
  - Booking started
  - Booking sent

### 4.4 Signal Engine Implementation Order

Do not start with AI.

Build in this order:

1. Add pure scoring helpers in `lib/signalEngine.ts`. **Started: deterministic scoring now exists.**
2. Add lightweight UI labels using existing data. **Started: Explore now ranks by Signal Engine and shows reasons.**
3. Add Sound Profile panel to Sound Vault. **Done: Sound Vault now shows taste vector, intent counts and archive size.**
4. Add recommendation sorting to Explore. **Done: Explore ranks by Signal Engine.**
5. Add Event Desk slot recommendations. **Done: slots now suggest saved moments by fit score.**
6. Add `user_interactions` table. **Done in `supabase/schema.sql`; run the SQL in Supabase before relying on persistence.**
7. Record interactions from player, Sound Vault, Track Page, Event Desk, and booking flow. **Started: play, pause, complete, queue, save track, playlist, saved moment, event slot attach, open track, booking start and booking sent are captured.**
8. Add `track_audio_features` table. **Done in `supabase/schema.sql`; run the SQL in Supabase before relying on persisted feature rows.**
9. Generate features from existing metadata first. **Done in `lib/trackAudioFeatures.ts`; Signal Engine uses it at runtime even before persisted feature rows exist.**
10. Add `user_sound_profile` table and runtime model. **Done in `supabase/schema.sql`, `lib/userSoundProfile.ts` and Sound Vault. Run the SQL in Supabase before relying on cross-device persistence.**
11. Connect Sound Profile to discovery and event programming. **Done: Explore uses it for personal ranking defaults and Event Desk uses it for lineup-slot suggestions.**
12. Later add real audio analysis and embeddings.

## 5. V4 Execution Roadmap: From Alpha To Strong Pre-Release

The next work package turns ROOM_9 from a polished demo into a clearer product system. The order matters: first give DJs a way to shape music data, then make the algorithm smarter, then harden booking and live streaming.

### Phase 7: DJ Music Lab

Goal: let verified DJs work with their uploaded music inside ROOM_9 instead of only uploading static files.

Status, May 18, 2026:

- Music Lab was rechecked after the Role Verification pass: it is already DJ-gated through active `profile_role_access`, redirects locked listeners to Settings, and reads/writes the shared `track_audio_features` model.
- Cue preview already hands the selected timestamp to the global player, so DJ-authored moments can be auditioned before saving.
- Track Page and Explore already consume saved feature/cue data, which means Music Lab is connected to the public discovery layer rather than being an isolated editor.
- Remaining Phase 7 depth is now future refinement: richer cue markers, compare-two-tracks, and real audio analysis.

Started, May 17, 2026:

- Added `/dashboard/music-lab` as a DJ-only workspace.
- The lab uses the existing `track_audio_features` table, so no risky new schema is required for the first version.
- DJs can select an uploaded track, edit cue points, energy, room fit and Sound DNA.
- Cue points are stored inside `track_audio_features.waveform_profile.lab_cues`.
- Track Page can read saved lab cues and replace generic generated moments with DJ-authored cue points.
- Explore now reads `track_audio_features` so manual DJ models improve deterministic ranking.

Music Lab should support:

- Track source selection.
- Cue editing: Intro, Build, Peak, Closing.
- Manual energy, darkness, groove, intensity and density values.
- Room fit tags.
- Sound DNA tags.
- DJ notes for atmosphere brief copy.
- Preview cue in global player.
- Save model to Supabase.

Future Music Lab improvements:

- Real audio analysis worker.
- Beat grid / BPM detection.
- Cue markers beyond the four core moments.
- Exportable atmosphere brief.
- Compare two tracks for lineup fit.
- Stem or loop tools only if they do not make the product too complex for diploma scope.

Definition of done:

- A DJ can shape how their track is understood by ROOM_9.
- Explore, Track Page, Event Desk and Booking Brief all benefit from that model.

### Phase 8: Recommendation Intelligence

Goal: make discovery feel personal and explainable without pretending to be a black-box AI product.

Status, May 18, 2026:

- Signal Engine now exposes `buildSignalRecommendationGroups`, a shared explainable recommendation layer.
- Sound Vault now shows four recommendation channels:
  - Similar to saved moments.
  - Fits your peak slot.
  - New in your Sound Zone.
  - High booking-fit artists.
- Each recommended track shows a short reason, match score, play action and queue action.
- This keeps recommendations deterministic and readable: saved moments, likes, playlists, Sound Profile and Music Lab features explain the output.

Implementation direction:

- Keep the deterministic Signal Engine as the core.
- Add more inputs from Music Lab: manual cue points, energy, room fit and Sound DNA.
- Add "why this matches" explanations on Explore, Sound Vault and Event Desk.
- Add similarity between saved moments and DJ-authored cues.
- Add recommendation groups:
  - Similar to saved moments.
  - Fits your peak slot.
  - New in your Sound Zone.
  - High booking-fit artists.

Future AI layer:

- Embeddings for track text, cue notes and artist bios.
- Audio feature extraction worker.
- AI lineup assistant for organizers.
- AI brief generator from saved moments and event constraints.

Definition of done:

- Users understand why ROOM_9 recommends a track, DJ or saved moment.

### Phase 9: Booking Operations Completion

Goal: make the full booking path reliable from event intent to confirmed case.

Status, May 18, 2026:

- Added a small booking operations sync layer in `lib/bookingOperations.ts`.
- When a DJ accepts/declines from Booking CRM or Booking Case, linked Event Desk lineup slots now move to `accepted`, `hold`, or `blocked` instead of staying stale.
- Linked saved moments now update with the case lifecycle, so Sound Vault can reflect whether a moment is still saved, used in booking, or inside a case file.
- Booking Case now loads the linked Event Desk slot and event page when the case came from a lineup slot.
- Booking request submission now preserves the saved moment on the lineup slot while attaching `booking_id` and `dj_id`.
- Demo RLS in `supabase/schema.sql` now allows the related DJ to update linked event slot and saved moment status during case progression.

Required flow:

1. Save sound reference.
2. Attach it to an Event Desk lineup slot.
3. Send booking request.
4. Open booking case.
5. Discuss in case chat.
6. Upload rider.
7. Show contract next.
8. Show escrow preview.
9. Accept / decline / confirm.

Important:

- Escrow remains a preview layer until a real payment provider is connected.
- The product should say "sound reference" or "atmosphere brief", not "sell sound".
- Case files must always show next action and blocked state.

Definition of done:

- The organizer and DJ can both move through the same case without getting stuck at rider, contract or status stages.

### Phase 10: Live Streaming From The Site

Goal: make live streams a real platform layer, not only a page with cards.

MVP-safe direction:

- Keep `live_streams` as the stream management table.
- Support stream creation from `/dashboard/streams`.
- Support embed URL or direct stream URL.
- Show public stream page with current stream, upcoming streams and archive.
- Connect stream archive to Artist Dossier and Sound Vault.

Future real streaming:

- RTMP ingest via a provider such as Mux, Livepeer, Cloudflare Stream or similar.
- Transcoding and HLS playback.
- Stream chat moderation.
- Stream archive clipping into saved moments.
- Stream analytics.

Definition of done:

- A DJ can schedule or publish a stream, and listeners can watch it from ROOM_9.

## 6. What To Work On Next

Recommended immediate order:

1. **DJ Music Lab MVP**
   - Finish `/dashboard/music-lab` and verify saving manual models to `track_audio_features`.
   - Confirm Track Page and Explore consume saved lab data.

2. **Booking path reliability**
   - Make sure Organizer/Venue can go from saved moment to event slot to booking request to booking case.
   - Make sure DJ can respond, upload rider, and progress the case.

3. **Sound Vault reliability**
   - Keep playlists, queue, like/unlike, saved moments and remove actions stable across accounts.

4. **Event Desk**
   - This is the strongest unique diploma story.
   - It connects sound discovery to real event building.

5. **Live Streaming MVP**
   - Make `/dashboard/streams` and `/streams` feel like one connected system.

6. **Recommendation Intelligence**
   - Expand the deterministic algorithm using Music Lab cues and saved moment behavior.

7. **Final UI QA**
   - Compact player.
   - Consistent buttons.
   - Consistent typography.
   - No overflow.
   - No broken role access.

## 6. Pre-Release Definition Of Done

ROOM_9 is pre-release ready when:

- A listener can discover, listen, like, save, queue, and create a personal Sound Vault.
- A listener can unlock DJ/Organizer/Venue tools through settings.
- A DJ can upload music, create releases, update profile media, upload rider, and respond to booking cases.
- An Organizer can save a moment, attach it to an event slot, send a booking, and manage a booking case.
- A Venue can manage event context and lineup needs.
- Dashboard is not confusing.
- Booking CRM is professional.
- Event Desk clearly shows the chain from sound to lineup.
- Signal Engine explains recommendations without pretending to be magic.
- Supabase data is scoped per account.
- `npm run lint` and `npm run build` pass.

## 7. V3 Direction

V3 is where ROOM_9 becomes a full ecosystem:

- Real AI recommendations with embeddings.
- Real audio analysis from uploaded tracks.
- AI lineup matching.
- Stripe Connect or another marketplace payment provider.
- Real escrow/payment lifecycle.
- Ticketing.
- Admin moderation and trust/safety.
- Public social layer: comments, reposts, timed reactions.
- Advanced livestream infrastructure.
- CDN/transcoding.
- Internationalization.

These are not needed before the diploma defense, but the current architecture should keep the door open for them.

## 8. Final Decision

The algorithm is a strong idea, but the next best work is not "big AI".

The next best work is:

1. Finish Sound Vault actions.
2. Finish Event Desk and Booking CRM.
3. Capture user interactions.
4. Add deterministic Signal Engine scoring.
5. Show recommendations in Explore, Vault, Track Page, and Event Desk.

This gives ROOM_9 a unique product idea:

**a music platform where saved sound moments become operational booking briefs.**

## 9. May 17 Implementation Status

Completed in the current pass:

- Role Verification Center now behaves like an unlock system instead of a plain role switcher.
- DJ, Organizer and Venue access require the first profile-readiness gate before activation.
- Selecting a locked role path reveals its setup form first, so users can complete the required profile step.
- Locked workspace routes point back to Settings with a contextual explanation.
- Listener mode no longer acts like professional access just because a user clicks a workspace link.
- `/dashboard`, `/dashboard/settings`, `/dashboard/calendar`, and locked navigation copy now use the same `calendar` unlock target.
- `npm run lint` passes.
- `npm run build` passes.
- Local dev server is expected on `localhost:3001`; `localhost:3000` should stay closed.

Next roadmap goal:

1. Run full role-flow QA with two accounts.
2. Confirm listener cannot open Booking CRM / Event Desk / Timeline through direct URLs.
3. Confirm DJ can unlock tools after profile readiness, upload track, upload rider, and see booking cases.
4. Confirm Organizer/Venue can unlock tools, create event slots, attach sound references, and send booking requests.

## 10. May 17 QA Update And Next Build Queue

Latest engineering check:

- `npm run lint` passes.
- `npx tsc --noEmit` passes.
- `npm run build` passes.
- Local demo server runs on `localhost:3001`.
- `localhost:3000` should remain unused.
- Public pages render:
  - Home
  - Explore
  - Sound Vault
  - Track Page
  - Artist Dossier
  - Events
  - Streams
  - Login/Register
- Protected dashboard routes redirect to Login when no session exists.
- Supabase config is read from:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Recent fixes:

- Calendar locked-state links now use the correct `unlock=calendar` target.
- Settings now has contextual unlock messages for Dashboard, DJ tools, Music Lab, Organizer tools, Timeline and Venue tools.
- Hydration warnings caused by browser extension body attributes are suppressed at the root layout level.

### Immediate Sprint A: Account And Role Flow QA

Goal: prove that the listener-first account model is reliable.

Status, May 18:

- Removed the remaining unsafe fallbacks where Header, Booking Request, Booking Case, Booking CRM and Settings could temporarily trust legacy `profiles.role` after `profile_role_access` failed to load.
- Those surfaces now fall back to listener-only access, so professional sections remain locked unless active role access is actually available.
- TypeScript, lint and production build pass after the access-hardening pass.

Tasks:

- Test two accounts:
  - listener / organizer account
  - DJ account
- Verify Listener cannot access:
  - Booking CRM
  - Event Desk
  - Timeline
  - Analytics
  - Streams management
  - Music Lab
- Verify locked pages always send the user to `/dashboard/settings` with the correct unlock reason.
- Verify DJ unlock path:
  - public profile
  - avatar
  - cover
  - first track
  - track cover
  - technical rider
  - booking trust
- Verify Organizer unlock path:
  - organization profile
  - saved sound reference
  - first event
  - lineup slot
  - booking request
- Verify Venue unlock path:
  - venue profile
  - address/capacity
  - venue event
  - lineup slot
  - calendar activity

Definition of done:

- A Listener cannot bypass professional pages by URL.
- DJ, Organizer and Venue access feels earned through profile readiness.
- Settings explains exactly what is missing.

### Immediate Sprint B: Booking Path Reliability

Goal: make the whole booking path work from saved sound reference to case file.

Tasks:

- Start from Explore or Track Page.
- Save an atmosphere brief / sound reference.
- Open Sound Vault.
- Attach that saved reference to an Event Desk lineup slot.
- Send booking request.
- Confirm the booking preserves:
  - `workId`
  - timestamp
  - `momentId`
  - `eventId`
  - `slotId`
- Open the created Booking Case.
- Confirm the DJ side can:
  - see the case
  - accept or decline
  - upload technical rider
- Confirm the Organizer/Venue side can:
  - see the same case
  - read chat/log
  - see escrow preview
  - see rider blocked/current state

Definition of done:

- No one gets stuck at the rider stage.
- The Booking Case always shows the next action.
- Event Desk, Booking CRM and Booking Case stay connected.

### Immediate Sprint C: Sound Vault Reliability

Goal: make Sound Vault feel like the real core of the music platform.

Tasks:

- Verify per-user data isolation for:
  - liked tracks
  - saved tracks
  - playlists
  - playlist tracks
  - queue
  - saved moments
  - listening history
- Confirm actions work from:
  - Explore
  - Track Page
  - Artist Dossier
  - Sound Vault
  - Global Player
- Finish/remove any confusing duplicate music surfaces.
- Keep `/dashboard/music` as redirect to `/library`.
- Keep `/dashboard/music-lab` only for DJ-authored track intelligence.

Definition of done:

- Listener can build a personal archive.
- Organizer can turn archive moments into booking briefs.
- DJ music tools do not pollute the public Sound Vault UX.

### Immediate Sprint D: DJ Music Lab Completion

Goal: give DJs a unique ROOM_9 tool for shaping how their music is understood.

Tasks:

- Verify Music Lab saves into `track_audio_features`.
- Confirm Track Page uses DJ-authored cues instead of generic generated moments.
- Confirm Explore ranking reads Music Lab data.
- Add clearer UI copy:
  - Cue Model
  - Atmosphere Brief
  - Sound DNA
  - Room Fit
  - Peak Reference
- Add "Preview Cue" behavior through the global player if safe.

Definition of done:

- A DJ can shape a track's meaning for discovery, booking and lineup matching.

### Immediate Sprint E: Recommendation Intelligence Pass

Goal: make the Signal Engine visible and useful.

Tasks:

- Show "Why this matches" on Explore result rows.
- Show similar moments on Track Page.
- Show "Recommended for this slot" in Event Desk.
- Show personal taste model in Sound Vault.
- Show analytics funnel:
  - Play
  - Save
  - Moment
  - Open Artist
  - Booking Started
  - Booking Sent

Definition of done:

- ROOM_9 feels intelligent, but still explainable.
- Recommendations are based on visible user behavior, not fake AI claims.

### Immediate Sprint F: Live Streaming MVP

Goal: make streams a connected platform layer.

Tasks:

- Confirm `/dashboard/streams` creates or edits stream entries.
- Confirm public `/streams` shows:
  - live now
  - upcoming streams
  - archive
- Add stream state clarity:
  - scheduled
  - live
  - archived
- Connect stream archive to:
  - Artist Dossier
  - Sound Vault
  - saved sound reference flow

Definition of done:

- A DJ can publish a stream entry.
- A listener can discover, play/watch and save stream context.

Status, May 18:

- Shared stream helpers now power public streams, stream room detail pages and workspace stream dates.
- `/streams/[streamId]` exists as a public stream room with live/archive status, viewer/play count, embedded video support, fallback visual stage and artist dossier link when a DJ profile is attached.
- `/dashboard/streams` now supports direct public room links and quick `Go Live` / `Archive` actions for verified DJs.
- `supabase/schema.sql` stream RLS now recognizes the listener-first role model through active `profile_role_access` DJ access, not only legacy `profiles.role = 'dj'`.
- Remaining future scope: true WebRTC/live ingest, clipping moments from streams into Sound Vault, realtime viewer counts and stream chat.

### Immediate Sprint G: Final UI Consistency Pass

Goal: make the product feel finished enough for diploma presentation.

Tasks:

- Unify buttons:
  - primary
  - secondary
  - icon-only
  - destructive
  - disabled
- Unify panels and spacing in:
  - Dashboard
  - Booking CRM
  - Event Desk
  - Calendar Timeline
  - Settings
  - Sound Vault
- Fix overflow in:
  - workspace sidebar
  - profile card
  - Artist Dossier trust drawer
  - player controls
- Confirm player is:
  - compact
  - visually stable
  - white play button
  - transparent heart icon
  - one clear progress line / waveform
- Ensure public pages and workspace pages have different but coherent navigation.

Definition of done:

- No page feels like an old prototype mixed with the new system.
- The product reads as one coherent ROOM_9 interface.

Status, May 18:

- Workspace sidebar now uses one consistent icon/monogram navigation system and the same profile readiness/logout block across all workspace pages.
- Workspace logout is now available by default on every `WorkspacePageFrame`, not only the root dashboard.
- Sidebar overflow was loosened on desktop so notification/profile popovers are not clipped by the shell.
- Event Desk now owns event create/edit behavior directly in `/dashboard/events`.
- Legacy `/events/manage` now redirects to `/dashboard/events`, matching `/dashboard/music`, `/calendar`, `/settings`, and `/streams/manage` cleanup.
- Sound Vault now has safe deep-entry aliases for `/library/tracks`, `/library/moments`, `/library/playlists`, `/library/uploads`, and `/library/network`. They route into the existing Vault engine with a focused mode instead of duplicating stateful music logic.
- Dashboard Command Center primary actions now respect role unlock state: listener accounts are sent to Role Verification instead of being offered a direct professional CRM entry.

### Immediate Sprint H: Deep Surfaces Instead Of Giant Screens

Goal: stop dense product areas from becoming unreadable all-in-one pages.

Rules:

- Sound Vault is a hub with focused surfaces:
  - Tracks
  - Atmosphere Briefs
  - Playlists
  - Uploads / Releases
  - Network
- Dashboard is a Command Center, not a storage place for every workflow.
- Booking CRM, Event Desk and Calendar Timeline remain separate operational pages.
- Long names, emails, titles and metrics must clamp/wrap safely everywhere.
- Optional panels should be hideable or opened as drawers, not forced onto the primary layout.

Status, May 18:

- Release Atmosphere Brief was moved into an intentional glass drawer.
- Sound Vault gained focused mode entry points and hide/restore module controls.
- Booking CRM gained archive/remove-from-board behavior instead of only passive case viewing.
- Settings layout was tightened to reduce form/card overflow.
- Calendar Timeline now explains the source of every operational object: direct booking, Event Desk request, Event Desk slot, atmosphere brief, rider deadline, escrow preview, event page, or stream schedule.
- Cloudflare deployment path was documented in `docs/cloudflare-deployment.md`; `@opennextjs/cloudflare`, `wrangler`, `wrangler.jsonc`, and `open-next.config.ts` are now installed/configured, and `npm run cf:build` passes locally.

## 11. Updated Priority Order

Recommended next implementation order:

1. Account and Role Flow QA.
2. Booking Path Reliability.
3. Sound Vault Reliability.
4. DJ Music Lab Completion.
5. Event Desk Refinement.
6. Recommendation Intelligence Pass.
7. Live Streaming MVP.
8. Final UI Consistency Pass.

Reason:

The recommendation algorithm, streaming and advanced UI only matter if the core professional path is stable:

**Listener -> Sound Vault -> Atmosphere Brief -> Event Slot -> Booking Request -> Booking Case -> DJ Action.**
