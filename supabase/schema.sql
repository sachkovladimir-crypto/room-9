-- ROOM_9 full demo schema
-- Copy this whole file into Supabase SQL Editor and press Run.
-- It is safe to run more than once.

create extension if not exists pgcrypto;

-- =========================================================
-- Tables
-- =========================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'listener' check (role in ('dj', 'organizer', 'admin', 'listener', 'venue')),
  created_at timestamp with time zone default now()
);

alter table public.profiles
  alter column role set default 'listener';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('dj', 'organizer', 'admin', 'listener', 'venue'));

create table if not exists public.profile_role_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('dj', 'organizer', 'venue', 'admin')),
  status text not null default 'active' check (status in ('locked', 'pending', 'active', 'rejected')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique (user_id, role)
);

create table if not exists public.dj_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  stage_name text,
  bio text,
  country text,
  city text,
  genres text,
  bpm_range text,
  price numeric,
  avatar_url text,
  cover_image_url text,
  profile_theme text,
  soundcloud_url text,
  mixcloud_url text,
  technical_rider_url text,
  is_available boolean default true,
  created_at timestamp with time zone default now(),
  unique (user_id)
);

alter table public.dj_profiles
  add column if not exists cover_image_url text,
  add column if not exists profile_theme text,
  add column if not exists soundcloud_url text,
  add column if not exists mixcloud_url text,
  add column if not exists technical_rider_url text;

create table if not exists public.organizer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_name text,
  country text,
  city text,
  contact_email text,
  description text,
  created_at timestamp with time zone default now(),
  unique (user_id)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id) on delete cascade,
  dj_id uuid not null references public.dj_profiles(id) on delete cascade,
  event_date date not null,
  venue_name text not null,
  city text not null,
  event_type text not null,
  message text,
  status text default 'pending' check (status in ('pending', 'accepted', 'declined')),
  archived_by_dj boolean default false,
  archived_by_organizer boolean default false,
  created_at timestamp with time zone default now()
);

alter table public.bookings
  add column if not exists source_track_title text,
  add column if not exists source_timestamp_seconds integer,
  add column if not exists source_timestamp_label text,
  add column if not exists source_moment_note text,
  add column if not exists archived_by_dj boolean default false,
  add column if not exists archived_by_organizer boolean default false;

alter table public.bookings
  drop constraint if exists bookings_status_check;

alter table public.bookings
  add constraint bookings_status_check
  check (status in ('pending', 'accepted', 'declined', 'cancelled', 'completed', 'paid', 'disputed'));

create table if not exists public.booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  dj_id uuid not null references public.dj_profiles(id) on delete cascade,
  title text,
  type text default 'track',
  link text,
  description text,
  cover_image text,
  lyrics text,
  genre text,
  bpm text,
  key text,
  visibility text default 'public' check (visibility in ('public', 'private')),
  play_count integer default 0,
  like_count integer default 0,
  duration_seconds integer,
  waveform_peaks jsonb,
  waveform_analyzed_at timestamp with time zone,
  is_deleted boolean default false,
  created_at timestamp with time zone default now()
);

alter table public.works
  add column if not exists cover_image text,
  add column if not exists description text,
  add column if not exists lyrics text,
  add column if not exists genre text,
  add column if not exists bpm text,
  add column if not exists key text,
  add column if not exists visibility text default 'public',
  add column if not exists play_count integer default 0,
  add column if not exists like_count integer default 0,
  add column if not exists duration_seconds integer,
  add column if not exists waveform_peaks jsonb,
  add column if not exists waveform_analyzed_at timestamp with time zone,
  add column if not exists is_deleted boolean default false;

alter table public.bookings
  add column if not exists source_work_id uuid references public.works(id) on delete set null;

alter table public.bookings
  add column if not exists source_event_id uuid,
  add column if not exists source_slot_id uuid,
  add column if not exists source_saved_moment_id uuid;

alter table public.works
  drop constraint if exists works_visibility_check;

alter table public.works
  add constraint works_visibility_check
  check (visibility in ('public', 'private'));

-- V2: Real DJ releases. Albums and EPs are collections, not just track types.
create table if not exists public.releases (
  id uuid primary key default gen_random_uuid(),
  dj_id uuid not null references public.dj_profiles(id) on delete cascade,
  title text not null,
  release_type text not null default 'single' check (release_type in ('single', 'ep', 'album', 'set')),
  description text,
  cover_image text,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.releases
  add column if not exists release_type text default 'single',
  add column if not exists description text,
  add column if not exists cover_image text,
  add column if not exists visibility text default 'public',
  add column if not exists updated_at timestamp with time zone default now();

alter table public.releases
  drop constraint if exists releases_release_type_check;

alter table public.releases
  add constraint releases_release_type_check
  check (release_type in ('single', 'ep', 'album', 'set'));

alter table public.releases
  drop constraint if exists releases_visibility_check;

alter table public.releases
  add constraint releases_visibility_check
  check (visibility in ('public', 'private'));

create table if not exists public.release_tracks (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  work_id uuid not null references public.works(id) on delete cascade,
  position integer default 0,
  created_at timestamp with time zone default now(),
  unique (release_id, work_id)
);

alter table public.release_tracks
  add column if not exists position integer default 0,
  add column if not exists created_at timestamp with time zone default now();

comment on table public.releases is 'DJ-owned releases: singles, EPs, albums, and DJ set collections.';
comment on table public.release_tracks is 'Ordered membership of works inside a release.';

create table if not exists public.live_streams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  title text not null,
  artist_name text not null,
  location text,
  genre text,
  status text default 'upcoming' check (status in ('live', 'upcoming', 'archived')),
  starts_at timestamp with time zone,
  embed_url text,
  stream_url text,
  thumbnail_url text,
  created_at timestamp with time zone default now()
);

alter table public.live_streams
  add column if not exists owner_id uuid references public.profiles(id) on delete set null;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid references public.profiles(id) on delete set null,
  title text not null,
  description text,
  venue_name text,
  city text,
  country text,
  event_date date,
  event_type text,
  status text default 'draft' check (status in ('draft', 'public', 'hold', 'archived')),
  capacity integer,
  budget numeric,
  lineup text,
  poster_url text,
  created_at timestamp with time zone default now()
);

alter table public.events
  add column if not exists status text default 'draft',
  add column if not exists capacity integer,
  add column if not exists budget numeric;

alter table public.events
  drop constraint if exists events_status_check;

alter table public.events
  add constraint events_status_check
  check (status in ('draft', 'public', 'hold', 'archived'));

create table if not exists public.profile_views (
  id uuid primary key default gen_random_uuid(),
  dj_id uuid not null references public.dj_profiles(id) on delete cascade,
  viewer_id uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default now()
);

create table if not exists public.track_plays (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete cascade,
  dj_id uuid not null references public.dj_profiles(id) on delete cascade,
  listener_id uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default now()
);

-- V2: Ratings after completed or accepted booking relationships.
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete set null,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamp with time zone default now()
);

-- V2: Saved DJs for listeners, organizers, and venues.
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  dj_id uuid not null references public.dj_profiles(id) on delete cascade,
  created_at timestamp with time zone default now(),
  unique (user_id, dj_id)
);

-- V2: User-owned Sound Vault tracks. This replaces shared/local-only saved tracks.
create table if not exists public.saved_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_id uuid not null references public.works(id) on delete cascade,
  created_at timestamp with time zone default now(),
  unique (user_id, work_id)
);

-- V2: Saved timestamp moments used as future booking evidence.
create table if not exists public.saved_moments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_id uuid not null references public.works(id) on delete cascade,
  dj_id uuid references public.dj_profiles(id) on delete set null,
  timestamp_seconds integer not null check (timestamp_seconds >= 0),
  timestamp_label text,
  moment_label text,
  energy text,
  room_type text,
  notes text,
  status text default 'saved' check (status in ('saved', 'used-in-booking', 'in-case-file')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique (user_id, work_id, timestamp_seconds)
);

-- V2: User-owned playlists for listeners, DJs, organizers, and venues.
create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  visibility text default 'private' check (visibility in ('private', 'public')),
  cover_image text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.playlists
  add column if not exists description text,
  add column if not exists visibility text default 'private',
  add column if not exists cover_image text,
  add column if not exists updated_at timestamp with time zone default now();

alter table public.playlists
  drop constraint if exists playlists_visibility_check;

alter table public.playlists
  add constraint playlists_visibility_check
  check (visibility in ('private', 'public'));

create table if not exists public.playlist_tracks (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  work_id uuid not null references public.works(id) on delete cascade,
  position integer default 0,
  added_at timestamp with time zone default now(),
  unique (playlist_id, work_id)
);

alter table public.playlist_tracks
  add column if not exists position integer default 0,
  add column if not exists added_at timestamp with time zone default now();

-- V2: Listening history powers Sound Vault and "continue listening".
create table if not exists public.listening_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_id uuid not null references public.works(id) on delete cascade,
  played_at timestamp with time zone default now(),
  position_seconds integer default 0
);

-- Phase 6: Behavior capture for the deterministic Signal Engine.
-- This table records product interactions without controlling core app behavior.
create table if not exists public.user_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_id uuid references public.works(id) on delete set null,
  dj_id uuid references public.dj_profiles(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  interaction_type text not null check (
    interaction_type in (
      'play',
      'pause',
      'complete',
      'skip',
      'like',
      'unlike',
      'save_track',
      'remove_saved_track',
      'save_moment',
      'remove_moment',
      'add_to_playlist',
      'remove_from_playlist',
      'create_playlist',
      'add_to_queue',
      'remove_from_queue',
      'open_track',
      'open_artist',
      'attach_to_event_slot',
      'start_booking',
      'booking_sent'
    )
  ),
  timestamp_seconds integer,
  weight numeric default 1,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now()
);

-- V2: In-app product notifications.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text,
  title text,
  body text,
  is_read boolean default false,
  created_at timestamp with time zone default now()
);

alter table public.notifications
  add column if not exists type text,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists is_read boolean default false,
  add column if not exists created_at timestamp with time zone default now();

comment on table public.playlists is 'User-owned Sound Vault playlists. These persist listening systems between devices.';
comment on table public.playlist_tracks is 'Ordered playlist membership for Sound Vault playlists.';
comment on table public.notifications is 'In-app notification center events for bookings, messages, conflicts, and saved tracks.';
comment on table public.user_interactions is 'Behavior capture table for the deterministic Signal Engine. Stores user-owned music, booking, and event intent signals.';

-- Phase 7: Track audio feature profiles for the deterministic Signal Engine.
-- MVP features are derived from metadata first. Future audio workers can update these rows.
create table if not exists public.track_audio_features (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null unique references public.works(id) on delete cascade,
  bpm numeric,
  energy numeric default 5,
  darkness numeric default 5,
  groove numeric default 5,
  intensity numeric default 5,
  density numeric default 5,
  vocal_presence numeric default 0,
  room_fit text[] default '{}',
  moment_types text[] default '{}',
  sound_dna text[] default '{}',
  waveform_profile jsonb default '{}'::jsonb,
  source text default 'metadata',
  confidence numeric default 0.48,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.track_audio_features
  add column if not exists bpm numeric,
  add column if not exists energy numeric default 5,
  add column if not exists darkness numeric default 5,
  add column if not exists groove numeric default 5,
  add column if not exists intensity numeric default 5,
  add column if not exists density numeric default 5,
  add column if not exists vocal_presence numeric default 0,
  add column if not exists room_fit text[] default '{}',
  add column if not exists moment_types text[] default '{}',
  add column if not exists sound_dna text[] default '{}',
  add column if not exists waveform_profile jsonb default '{}'::jsonb,
  add column if not exists source text default 'metadata',
  add column if not exists confidence numeric default 0.48,
  add column if not exists updated_at timestamp with time zone default now();

comment on table public.track_audio_features is 'Normalized music descriptors for the deterministic ROOM_9 Signal Engine. MVP rows are metadata-derived; V3 can replace source with audio-analysis or ML embeddings.';

-- Phase 8: Aggregated user taste profile for faster, explainable recommendations.
-- This is user-owned derived data. It can be rebuilt from saved tracks, playlists, moments and interactions.
create table if not exists public.user_sound_profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  preferred_genres text[] default '{}',
  bpm_min numeric,
  bpm_max numeric,
  avg_energy numeric,
  avg_darkness numeric,
  avg_groove numeric,
  preferred_room_types text[] default '{}',
  top_dna_tags text[] default '{}',
  saved_track_count integer default 0,
  saved_moment_count integer default 0,
  playlist_track_count integer default 0,
  interaction_count integer default 0,
  profile_vector jsonb default '{}'::jsonb,
  confidence numeric default 0.32,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.user_sound_profile
  add column if not exists preferred_genres text[] default '{}',
  add column if not exists bpm_min numeric,
  add column if not exists bpm_max numeric,
  add column if not exists avg_energy numeric,
  add column if not exists avg_darkness numeric,
  add column if not exists avg_groove numeric,
  add column if not exists preferred_room_types text[] default '{}',
  add column if not exists top_dna_tags text[] default '{}',
  add column if not exists saved_track_count integer default 0,
  add column if not exists saved_moment_count integer default 0,
  add column if not exists playlist_track_count integer default 0,
  add column if not exists interaction_count integer default 0,
  add column if not exists profile_vector jsonb default '{}'::jsonb,
  add column if not exists confidence numeric default 0.32,
  add column if not exists updated_at timestamp with time zone default now();

comment on table public.user_sound_profile is 'User-owned aggregated taste model for ROOM_9 Signal Engine. Derived from Sound Vault activity and safe to rebuild.';

-- V2: DJ availability calendar.
create table if not exists public.availability (
  id uuid primary key default gen_random_uuid(),
  dj_id uuid not null references public.dj_profiles(id) on delete cascade,
  date date not null,
  status text not null check (status in ('available', 'unavailable', 'booked')),
  note text,
  unique (dj_id, date)
);

-- V2: Separate public profile for clubs and venues.
create table if not exists public.venue_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  venue_name text,
  country text,
  city text,
  address text,
  capacity integer,
  description text,
  website_url text,
  instagram_url text,
  created_at timestamp with time zone default now(),
  unique (user_id)
);

-- V2: Event Desk lineup slots connect event planning to saved sound moments.
create table if not exists public.event_lineup_slots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  slot_type text not null check (slot_type in ('opening', 'support', 'peak', 'closing', 'stream')),
  dj_id uuid references public.dj_profiles(id) on delete set null,
  saved_moment_id uuid references public.saved_moments(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  status text default 'searching' check (status in ('searching', 'hold', 'accepted', 'optional', 'blocked')),
  position integer default 0,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique (event_id, slot_type, position)
);

-- V3: Payment / escrow ledger placeholder. No real provider is connected in the app yet.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  payer_id uuid references public.profiles(id) on delete set null,
  receiver_id uuid references public.profiles(id) on delete set null,
  amount numeric,
  currency text default 'EUR',
  status text check (status in ('pending', 'paid', 'released', 'refunded', 'failed', 'not_funded', 'deposit_pending', 'escrow_ready')),
  provider text,
  created_at timestamp with time zone default now()
);

alter table public.payments
  drop constraint if exists payments_status_check;

alter table public.payments
  add constraint payments_status_check
  check (status in ('pending', 'paid', 'released', 'refunded', 'failed', 'not_funded', 'deposit_pending', 'escrow_ready'));

-- V3: Ticketing placeholder for public listener purchases.
create table if not exists public.event_tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  buyer_id uuid references public.profiles(id) on delete set null,
  ticket_code text,
  status text check (status in ('active', 'used', 'cancelled')),
  created_at timestamp with time zone default now()
);

-- V2/V3: Trust and safety reports.
create table if not exists public.admin_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  target_type text,
  target_id uuid,
  reason text,
  status text default 'open' check (status in ('open', 'reviewed', 'resolved', 'rejected')),
  created_at timestamp with time zone default now()
);

-- V3: Advanced stream sessions beyond the simple live_streams page.
create table if not exists public.stream_sessions (
  id uuid primary key default gen_random_uuid(),
  dj_id uuid references public.dj_profiles(id) on delete cascade,
  title text,
  stream_url text,
  status text check (status in ('scheduled', 'live', 'ended', 'archived')),
  scheduled_at timestamp with time zone,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  viewer_count integer default 0,
  created_at timestamp with time zone default now()
);

-- V3: Premium plans and monetization.
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  plan text,
  status text,
  started_at timestamp with time zone,
  expires_at timestamp with time zone
);

-- =========================================================
-- Indexes for current MVP scale
-- =========================================================

create index if not exists idx_dj_profiles_city on public.dj_profiles(city);
create index if not exists idx_dj_profiles_country on public.dj_profiles(country);
create index if not exists idx_dj_profiles_genres on public.dj_profiles(genres);
create index if not exists idx_dj_profiles_is_available on public.dj_profiles(is_available);
create index if not exists idx_dj_profiles_created_at on public.dj_profiles(created_at);
create index if not exists idx_profile_role_access_user_id on public.profile_role_access(user_id);
create index if not exists idx_profile_role_access_role_status on public.profile_role_access(role, status);

create index if not exists idx_bookings_dj_id on public.bookings(dj_id);
create index if not exists idx_bookings_organizer_id on public.bookings(organizer_id);
create index if not exists idx_bookings_status on public.bookings(status);
create index if not exists idx_bookings_created_at on public.bookings(created_at);
create index if not exists idx_bookings_source_work_id on public.bookings(source_work_id);
create index if not exists idx_bookings_source_event_id on public.bookings(source_event_id);
create index if not exists idx_bookings_source_slot_id on public.bookings(source_slot_id);
create index if not exists idx_bookings_source_saved_moment_id on public.bookings(source_saved_moment_id);

create index if not exists idx_booking_messages_booking_id on public.booking_messages(booking_id);
create index if not exists idx_booking_messages_sender_id on public.booking_messages(sender_id);
create index if not exists idx_booking_messages_created_at on public.booking_messages(created_at);

create index if not exists idx_works_dj_id on public.works(dj_id);
create index if not exists idx_works_created_at on public.works(created_at);
create index if not exists idx_works_visibility on public.works(visibility);
create index if not exists idx_works_is_deleted on public.works(is_deleted);
create index if not exists idx_works_play_count on public.works(play_count);
create index if not exists idx_works_duration_seconds on public.works(duration_seconds);
create index if not exists idx_releases_dj_id on public.releases(dj_id);
create index if not exists idx_releases_visibility on public.releases(visibility);
create index if not exists idx_releases_release_type on public.releases(release_type);
create index if not exists idx_release_tracks_release_id on public.release_tracks(release_id);
create index if not exists idx_release_tracks_work_id on public.release_tracks(work_id);
create index if not exists idx_release_tracks_release_position on public.release_tracks(release_id, position);

create index if not exists idx_events_event_date on public.events(event_date);
create index if not exists idx_events_city on public.events(city);
create index if not exists idx_events_organizer_id on public.events(organizer_id);

create index if not exists idx_live_streams_status on public.live_streams(status);
create index if not exists idx_live_streams_starts_at on public.live_streams(starts_at);
create index if not exists idx_live_streams_owner_id on public.live_streams(owner_id);

create index if not exists idx_profile_views_dj_id on public.profile_views(dj_id);
create index if not exists idx_track_plays_dj_id on public.track_plays(dj_id);
create index if not exists idx_track_plays_work_id on public.track_plays(work_id);
create index if not exists idx_reviews_reviewee_id on public.reviews(reviewee_id);
create index if not exists idx_reviews_reviewer_id on public.reviews(reviewer_id);
create index if not exists idx_favorites_user_id on public.favorites(user_id);
create index if not exists idx_favorites_dj_id on public.favorites(dj_id);
create index if not exists idx_saved_tracks_user_id on public.saved_tracks(user_id);
create index if not exists idx_saved_tracks_work_id on public.saved_tracks(work_id);
create index if not exists idx_saved_moments_user_id on public.saved_moments(user_id);
create index if not exists idx_saved_moments_work_id on public.saved_moments(work_id);
create index if not exists idx_saved_moments_dj_id on public.saved_moments(dj_id);
create index if not exists idx_saved_moments_status on public.saved_moments(status);
create index if not exists idx_playlists_user_id on public.playlists(user_id);
create index if not exists idx_playlist_tracks_playlist_id on public.playlist_tracks(playlist_id);
create index if not exists idx_playlist_tracks_work_id on public.playlist_tracks(work_id);
create index if not exists idx_playlist_tracks_playlist_position on public.playlist_tracks(playlist_id, position);
create index if not exists idx_listening_history_user_played on public.listening_history(user_id, played_at desc);
create index if not exists idx_listening_history_work_id on public.listening_history(work_id);
create index if not exists idx_user_interactions_user_created on public.user_interactions(user_id, created_at desc);
create index if not exists idx_user_interactions_user_type on public.user_interactions(user_id, interaction_type);
create index if not exists idx_user_interactions_work_id on public.user_interactions(work_id);
create index if not exists idx_user_interactions_dj_id on public.user_interactions(dj_id);
create index if not exists idx_user_interactions_event_id on public.user_interactions(event_id);
create index if not exists idx_user_interactions_booking_id on public.user_interactions(booking_id);
create index if not exists idx_track_audio_features_work_id on public.track_audio_features(work_id);
create index if not exists idx_track_audio_features_energy on public.track_audio_features(energy);
create index if not exists idx_track_audio_features_room_fit on public.track_audio_features using gin(room_fit);
create index if not exists idx_track_audio_features_sound_dna on public.track_audio_features using gin(sound_dna);
create index if not exists idx_user_sound_profile_user_id on public.user_sound_profile(user_id);
create index if not exists idx_user_sound_profile_genres on public.user_sound_profile using gin(preferred_genres);
create index if not exists idx_user_sound_profile_dna on public.user_sound_profile using gin(top_dna_tags);
create index if not exists idx_notifications_user_read on public.notifications(user_id, is_read);
create index if not exists idx_notifications_user_created on public.notifications(user_id, created_at desc);
create index if not exists idx_availability_dj_date on public.availability(dj_id, date);
create index if not exists idx_venue_profiles_city on public.venue_profiles(city);
create index if not exists idx_event_lineup_slots_event_id on public.event_lineup_slots(event_id);
create index if not exists idx_event_lineup_slots_dj_id on public.event_lineup_slots(dj_id);
create index if not exists idx_event_lineup_slots_saved_moment_id on public.event_lineup_slots(saved_moment_id);
create index if not exists idx_event_lineup_slots_booking_id on public.event_lineup_slots(booking_id);
create index if not exists idx_payments_booking_id on public.payments(booking_id);
create index if not exists idx_payments_status on public.payments(status);
create index if not exists idx_event_tickets_event_id on public.event_tickets(event_id);
create index if not exists idx_event_tickets_buyer_id on public.event_tickets(buyer_id);
create index if not exists idx_admin_reports_status on public.admin_reports(status);
create index if not exists idx_stream_sessions_status on public.stream_sessions(status);
create index if not exists idx_stream_sessions_dj_id on public.stream_sessions(dj_id);
create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);

-- =========================================================
-- Grants
-- =========================================================

grant usage on schema public to anon, authenticated;

grant select on public.dj_profiles to anon, authenticated;
grant select on public.works to anon, authenticated;
grant select on public.track_audio_features to anon, authenticated;
grant select on public.releases to anon, authenticated;
grant select on public.release_tracks to anon, authenticated;
grant select on public.live_streams to anon, authenticated;
grant select on public.events to anon, authenticated;
grant select on public.reviews to anon, authenticated;
grant select on public.venue_profiles to anon, authenticated;
grant select on public.stream_sessions to anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.profile_role_access to authenticated;
grant select, insert, update on public.dj_profiles to authenticated;
grant select, insert, update on public.organizer_profiles to authenticated;
grant select, insert, update on public.venue_profiles to authenticated;
grant select, insert, update on public.bookings to authenticated;
grant select, insert on public.booking_messages to authenticated;
grant select, insert, update on public.works to authenticated;
grant select, insert, update on public.track_audio_features to authenticated;
grant select, insert, update, delete on public.user_sound_profile to authenticated;
grant select, insert, update, delete on public.releases to authenticated;
grant select, insert, update, delete on public.release_tracks to authenticated;
grant select, insert, update on public.live_streams to authenticated;
grant select, insert, update, delete on public.events to authenticated;
grant select, insert, update, delete on public.favorites to authenticated;
grant select, insert, delete on public.saved_tracks to authenticated;
grant select, insert, update, delete on public.saved_moments to authenticated;
grant select, insert, update, delete on public.playlists to authenticated;
grant select, insert, update, delete on public.playlist_tracks to authenticated;
grant select, insert, delete on public.listening_history to authenticated;
grant select, insert, delete on public.user_interactions to authenticated;
grant select, insert, update on public.reviews to authenticated;
grant select, insert, update, delete on public.notifications to authenticated;
grant select, insert, update, delete on public.availability to authenticated;
grant select, insert, update, delete on public.event_lineup_slots to authenticated;
grant select, insert, update on public.payments to authenticated;
grant select, insert, update on public.event_tickets to authenticated;
grant select, insert, update on public.admin_reports to authenticated;
grant select, insert, update on public.stream_sessions to authenticated;
grant select, insert, update on public.subscriptions to authenticated;

grant insert on public.profile_views to anon, authenticated;
grant select on public.profile_views to authenticated;
grant insert on public.track_plays to anon, authenticated;
grant select on public.track_plays to authenticated;

-- =========================================================
-- Auth trigger: creates public.profiles after sign up
-- =========================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_role text;
begin
  selected_role := coalesce(new.raw_user_meta_data ->> 'role', 'listener');

  if selected_role not in ('dj', 'organizer', 'admin', 'listener', 'venue') then
    selected_role := 'listener';
  end if;

  insert into public.profiles (id, email, role)
  values (new.id, new.email, selected_role)
  on conflict (id) do update
    set email = excluded.email,
        role = coalesce(public.profiles.role, excluded.role);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- =========================================================
-- RLS
-- =========================================================

alter table public.profiles enable row level security;
alter table public.profile_role_access enable row level security;
alter table public.dj_profiles enable row level security;
alter table public.organizer_profiles enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_messages enable row level security;
alter table public.works enable row level security;
alter table public.track_audio_features enable row level security;
alter table public.user_sound_profile enable row level security;
alter table public.releases enable row level security;
alter table public.release_tracks enable row level security;
alter table public.live_streams enable row level security;
alter table public.events enable row level security;
alter table public.profile_views enable row level security;
alter table public.track_plays enable row level security;
alter table public.favorites enable row level security;
alter table public.saved_tracks enable row level security;
alter table public.saved_moments enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_tracks enable row level security;
alter table public.listening_history enable row level security;
alter table public.user_interactions enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.availability enable row level security;
alter table public.venue_profiles enable row level security;
alter table public.event_lineup_slots enable row level security;
alter table public.payments enable row level security;
alter table public.event_tickets enable row level security;
alter table public.admin_reports enable row level security;
alter table public.stream_sessions enable row level security;
alter table public.subscriptions enable row level security;

-- Clean old and current demo policies.

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "dj_profiles_select_public" on public.dj_profiles;
drop policy if exists "dj_profiles_insert_own" on public.dj_profiles;
drop policy if exists "dj_profiles_update_own" on public.dj_profiles;
drop policy if exists "organizer_profiles_select_own" on public.organizer_profiles;
drop policy if exists "organizer_profiles_insert_own" on public.organizer_profiles;
drop policy if exists "organizer_profiles_update_own" on public.organizer_profiles;
drop policy if exists "bookings_insert_organizer" on public.bookings;
drop policy if exists "bookings_select_organizer" on public.bookings;
drop policy if exists "bookings_select_dj" on public.bookings;
drop policy if exists "bookings_update_dj" on public.bookings;
drop policy if exists "booking_messages_select_related" on public.booking_messages;
drop policy if exists "booking_messages_insert_related" on public.booking_messages;
drop policy if exists "works_select_public" on public.works;
drop policy if exists "works_insert_owner" on public.works;
drop policy if exists "works_update_owner" on public.works;

drop policy if exists "demo_profiles_select_authenticated" on public.profiles;
drop policy if exists "demo_profiles_insert_own" on public.profiles;
drop policy if exists "demo_profiles_update_own" on public.profiles;
drop policy if exists "demo_profile_role_access_select_own" on public.profile_role_access;
drop policy if exists "demo_profile_role_access_insert_own" on public.profile_role_access;
drop policy if exists "demo_profile_role_access_update_own" on public.profile_role_access;
drop policy if exists "demo_profile_role_access_delete_own" on public.profile_role_access;
drop policy if exists "demo_dj_profiles_select_public" on public.dj_profiles;
drop policy if exists "demo_dj_profiles_insert_own" on public.dj_profiles;
drop policy if exists "demo_dj_profiles_update_own" on public.dj_profiles;
drop policy if exists "demo_organizer_profiles_select_own" on public.organizer_profiles;
drop policy if exists "demo_organizer_profiles_insert_own" on public.organizer_profiles;
drop policy if exists "demo_organizer_profiles_update_own" on public.organizer_profiles;
drop policy if exists "demo_bookings_insert_own_organizer" on public.bookings;
drop policy if exists "demo_bookings_select_related" on public.bookings;
drop policy if exists "demo_bookings_update_related_dj" on public.bookings;
drop policy if exists "demo_booking_messages_select_related" on public.booking_messages;
drop policy if exists "demo_booking_messages_insert_related" on public.booking_messages;
drop policy if exists "demo_works_select_public" on public.works;
drop policy if exists "demo_works_insert_owner" on public.works;
drop policy if exists "demo_works_update_owner" on public.works;
drop policy if exists "demo_track_audio_features_select_public" on public.track_audio_features;
drop policy if exists "demo_track_audio_features_insert_owner" on public.track_audio_features;
drop policy if exists "demo_track_audio_features_update_owner" on public.track_audio_features;
drop policy if exists "demo_user_sound_profile_select_own" on public.user_sound_profile;
drop policy if exists "demo_user_sound_profile_insert_own" on public.user_sound_profile;
drop policy if exists "demo_user_sound_profile_update_own" on public.user_sound_profile;
drop policy if exists "demo_user_sound_profile_delete_own" on public.user_sound_profile;
drop policy if exists "demo_releases_select_public_or_owner" on public.releases;
drop policy if exists "demo_releases_insert_owner" on public.releases;
drop policy if exists "demo_releases_update_owner" on public.releases;
drop policy if exists "demo_releases_delete_owner" on public.releases;
drop policy if exists "demo_release_tracks_select_public_or_owner" on public.release_tracks;
drop policy if exists "demo_release_tracks_manage_owner" on public.release_tracks;
drop policy if exists "demo_live_streams_select_public" on public.live_streams;
drop policy if exists "demo_live_streams_insert_owner" on public.live_streams;
drop policy if exists "demo_live_streams_update_owner" on public.live_streams;
drop policy if exists "demo_events_select_public" on public.events;
drop policy if exists "demo_events_insert_organizer" on public.events;
drop policy if exists "demo_events_update_organizer" on public.events;
drop policy if exists "demo_events_delete_organizer" on public.events;
drop policy if exists "demo_profile_views_insert_anyone" on public.profile_views;
drop policy if exists "demo_profile_views_select_dj_owner" on public.profile_views;
drop policy if exists "demo_track_plays_insert_anyone" on public.track_plays;
drop policy if exists "demo_track_plays_select_dj_owner" on public.track_plays;
drop policy if exists "demo_favorites_select_own" on public.favorites;
drop policy if exists "demo_favorites_insert_own" on public.favorites;
drop policy if exists "demo_favorites_delete_own" on public.favorites;
drop policy if exists "demo_saved_tracks_select_own" on public.saved_tracks;
drop policy if exists "demo_saved_tracks_insert_own" on public.saved_tracks;
drop policy if exists "demo_saved_tracks_delete_own" on public.saved_tracks;
drop policy if exists "demo_saved_moments_select_own" on public.saved_moments;
drop policy if exists "demo_saved_moments_insert_own" on public.saved_moments;
drop policy if exists "demo_saved_moments_update_own" on public.saved_moments;
drop policy if exists "demo_saved_moments_update_related_booking_dj" on public.saved_moments;
drop policy if exists "demo_saved_moments_delete_own" on public.saved_moments;
drop policy if exists "demo_playlists_select_own_or_public" on public.playlists;
drop policy if exists "demo_playlists_insert_own" on public.playlists;
drop policy if exists "demo_playlists_update_own" on public.playlists;
drop policy if exists "demo_playlists_delete_own" on public.playlists;
drop policy if exists "demo_playlist_tracks_select_related" on public.playlist_tracks;
drop policy if exists "demo_playlist_tracks_manage_owner" on public.playlist_tracks;
drop policy if exists "demo_user_interactions_select_own" on public.user_interactions;
drop policy if exists "demo_user_interactions_insert_own" on public.user_interactions;
drop policy if exists "demo_user_interactions_delete_own" on public.user_interactions;
drop policy if exists "demo_listening_history_select_own" on public.listening_history;
drop policy if exists "demo_listening_history_insert_own" on public.listening_history;
drop policy if exists "demo_listening_history_delete_own" on public.listening_history;
drop policy if exists "demo_reviews_select_public" on public.reviews;
drop policy if exists "demo_reviews_insert_own" on public.reviews;
drop policy if exists "demo_reviews_update_own" on public.reviews;
drop policy if exists "demo_notifications_select_own" on public.notifications;
drop policy if exists "demo_notifications_insert_authenticated" on public.notifications;
drop policy if exists "demo_notifications_update_own" on public.notifications;
drop policy if exists "demo_notifications_delete_own" on public.notifications;
drop policy if exists "demo_availability_select_public" on public.availability;
drop policy if exists "demo_availability_manage_dj_owner" on public.availability;
drop policy if exists "demo_venue_profiles_select_public" on public.venue_profiles;
drop policy if exists "demo_venue_profiles_insert_own" on public.venue_profiles;
drop policy if exists "demo_venue_profiles_update_own" on public.venue_profiles;
drop policy if exists "demo_event_lineup_slots_select_public" on public.event_lineup_slots;
drop policy if exists "demo_event_lineup_slots_manage_event_owner" on public.event_lineup_slots;
drop policy if exists "demo_event_lineup_slots_update_related_dj" on public.event_lineup_slots;
drop policy if exists "demo_payments_select_related" on public.payments;
drop policy if exists "demo_payments_insert_related" on public.payments;
drop policy if exists "demo_event_tickets_select_own" on public.event_tickets;
drop policy if exists "demo_event_tickets_insert_own" on public.event_tickets;
drop policy if exists "demo_admin_reports_insert_authenticated" on public.admin_reports;
drop policy if exists "demo_admin_reports_select_admin" on public.admin_reports;
drop policy if exists "demo_admin_reports_update_admin" on public.admin_reports;
drop policy if exists "demo_stream_sessions_select_public" on public.stream_sessions;
drop policy if exists "demo_stream_sessions_manage_dj_owner" on public.stream_sessions;
drop policy if exists "demo_subscriptions_select_own" on public.subscriptions;
drop policy if exists "demo_subscriptions_insert_own" on public.subscriptions;
drop policy if exists "demo_subscriptions_update_own" on public.subscriptions;

-- Profiles

create policy "demo_profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "demo_profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "demo_profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Role access
-- Every account starts as listener. Rows here unlock DJ, Organizer, Venue, or Admin tools
-- without exposing a service_role key to the frontend.

create policy "demo_profile_role_access_select_own"
  on public.profile_role_access for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "demo_profile_role_access_insert_own"
  on public.profile_role_access for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and role in ('dj', 'organizer', 'venue')
  );

create policy "demo_profile_role_access_update_own"
  on public.profile_role_access for update
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  )
  with check (
    (
      auth.uid() = user_id
      and role in ('dj', 'organizer', 'venue')
    )
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "demo_profile_role_access_delete_own"
  on public.profile_role_access for delete
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- DJ profiles

create policy "demo_dj_profiles_select_public"
  on public.dj_profiles for select
  using (true);

create policy "demo_dj_profiles_insert_own"
  on public.dj_profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "demo_dj_profiles_update_own"
  on public.dj_profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Organizer profiles

create policy "demo_organizer_profiles_select_own"
  on public.organizer_profiles for select
  to authenticated
  using (auth.uid() = user_id);

create policy "demo_organizer_profiles_insert_own"
  on public.organizer_profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "demo_organizer_profiles_update_own"
  on public.organizer_profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Bookings

create policy "demo_bookings_insert_own_organizer"
  on public.bookings for insert
  to authenticated
  with check (
    auth.uid() = organizer_id
    and (
      exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
        and profiles.role in ('organizer', 'venue')
      )
      or exists (
        select 1 from public.profile_role_access
        where profile_role_access.user_id = auth.uid()
        and profile_role_access.role in ('organizer', 'venue')
        and profile_role_access.status = 'active'
      )
    )
  );

create policy "demo_bookings_select_related"
  on public.bookings for select
  to authenticated
  using (
    auth.uid() = organizer_id
    or exists (
      select 1 from public.dj_profiles
      where dj_profiles.id = bookings.dj_id
      and dj_profiles.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "demo_bookings_update_related_dj"
  on public.bookings for update
  to authenticated
  using (
    auth.uid() = organizer_id
    or
    exists (
      select 1 from public.dj_profiles
      where dj_profiles.id = bookings.dj_id
      and dj_profiles.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  )
  with check (
    auth.uid() = organizer_id
    or
    exists (
      select 1 from public.dj_profiles
      where dj_profiles.id = bookings.dj_id
      and dj_profiles.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- Booking chat

create policy "demo_booking_messages_select_related"
  on public.booking_messages for select
  to authenticated
  using (
    exists (
      select 1
      from public.bookings
      left join public.dj_profiles on dj_profiles.id = bookings.dj_id
      where bookings.id = booking_messages.booking_id
      and (
        bookings.organizer_id = auth.uid()
        or dj_profiles.user_id = auth.uid()
      )
    )
  );

create policy "demo_booking_messages_insert_related"
  on public.booking_messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and exists (
      select 1
      from public.bookings
      left join public.dj_profiles on dj_profiles.id = bookings.dj_id
      where bookings.id = booking_messages.booking_id
      and (
        bookings.organizer_id = auth.uid()
        or dj_profiles.user_id = auth.uid()
      )
    )
  );

-- Works / tracks

create policy "demo_works_select_public"
  on public.works for select
  using (
    (
      coalesce(works.is_deleted, false) = false
      and coalesce(works.visibility, 'public') = 'public'
    )
    or exists (
      select 1 from public.dj_profiles
      where dj_profiles.id = works.dj_id
      and dj_profiles.user_id = auth.uid()
    )
  );

create policy "demo_works_insert_owner"
  on public.works for insert
  to authenticated
  with check (
    exists (
      select 1 from public.dj_profiles
      where dj_profiles.id = works.dj_id
      and dj_profiles.user_id = auth.uid()
    )
  );

create policy "demo_works_update_owner"
  on public.works for update
  to authenticated
  using (
    exists (
      select 1 from public.dj_profiles
      where dj_profiles.id = works.dj_id
      and dj_profiles.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.dj_profiles
      where dj_profiles.id = works.dj_id
      and dj_profiles.user_id = auth.uid()
    )
  );

create policy "demo_track_audio_features_select_public"
  on public.track_audio_features for select
  using (
    exists (
      select 1 from public.works
      where works.id = track_audio_features.work_id
      and coalesce(works.is_deleted, false) = false
      and coalesce(works.visibility, 'public') = 'public'
    )
    or exists (
      select 1
      from public.works
      join public.dj_profiles on dj_profiles.id = works.dj_id
      where works.id = track_audio_features.work_id
      and dj_profiles.user_id = (select auth.uid())
    )
  );

create policy "demo_track_audio_features_insert_owner"
  on public.track_audio_features for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.works
      join public.dj_profiles on dj_profiles.id = works.dj_id
      where works.id = track_audio_features.work_id
      and dj_profiles.user_id = (select auth.uid())
    )
  );

create policy "demo_track_audio_features_update_owner"
  on public.track_audio_features for update
  to authenticated
  using (
    exists (
      select 1
      from public.works
      join public.dj_profiles on dj_profiles.id = works.dj_id
      where works.id = track_audio_features.work_id
      and dj_profiles.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.works
      join public.dj_profiles on dj_profiles.id = works.dj_id
      where works.id = track_audio_features.work_id
      and dj_profiles.user_id = (select auth.uid())
    )
  );

-- Releases / Albums / EPs

create policy "demo_releases_select_public_or_owner"
  on public.releases for select
  using (
    coalesce(releases.visibility, 'public') = 'public'
    or exists (
      select 1 from public.dj_profiles
      where dj_profiles.id = releases.dj_id
      and dj_profiles.user_id = (select auth.uid())
    )
  );

create policy "demo_releases_insert_owner"
  on public.releases for insert
  to authenticated
  with check (
    exists (
      select 1 from public.dj_profiles
      where dj_profiles.id = releases.dj_id
      and dj_profiles.user_id = (select auth.uid())
    )
  );

create policy "demo_releases_update_owner"
  on public.releases for update
  to authenticated
  using (
    exists (
      select 1 from public.dj_profiles
      where dj_profiles.id = releases.dj_id
      and dj_profiles.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.dj_profiles
      where dj_profiles.id = releases.dj_id
      and dj_profiles.user_id = (select auth.uid())
    )
  );

create policy "demo_releases_delete_owner"
  on public.releases for delete
  to authenticated
  using (
    exists (
      select 1 from public.dj_profiles
      where dj_profiles.id = releases.dj_id
      and dj_profiles.user_id = (select auth.uid())
    )
  );

create policy "demo_release_tracks_select_public_or_owner"
  on public.release_tracks for select
  using (
    exists (
      select 1
      from public.releases
      left join public.dj_profiles on dj_profiles.id = releases.dj_id
      where releases.id = release_tracks.release_id
      and (
        coalesce(releases.visibility, 'public') = 'public'
        or dj_profiles.user_id = (select auth.uid())
      )
    )
  );

create policy "demo_release_tracks_manage_owner"
  on public.release_tracks for all
  to authenticated
  using (
    exists (
      select 1
      from public.releases
      join public.dj_profiles on dj_profiles.id = releases.dj_id
      where releases.id = release_tracks.release_id
      and dj_profiles.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.releases
      join public.dj_profiles on dj_profiles.id = releases.dj_id
      where releases.id = release_tracks.release_id
      and dj_profiles.user_id = (select auth.uid())
    )
  );

-- Live streams

create policy "demo_live_streams_select_public"
  on public.live_streams for select
  using (true);

create policy "demo_live_streams_insert_owner"
  on public.live_streams for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and (
      exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
        and profiles.role = 'dj'
      )
      or exists (
        select 1 from public.profile_role_access
        where profile_role_access.user_id = auth.uid()
        and profile_role_access.role = 'dj'
        and profile_role_access.status = 'active'
      )
    )
  );

create policy "demo_live_streams_update_owner"
  on public.live_streams for update
  to authenticated
  using (owner_id = auth.uid() or owner_id is null)
  with check (
    owner_id = auth.uid()
    and (
      exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
        and profiles.role = 'dj'
      )
      or exists (
        select 1 from public.profile_role_access
        where profile_role_access.user_id = auth.uid()
        and profile_role_access.role = 'dj'
        and profile_role_access.status = 'active'
      )
    )
  );

-- Events

create policy "demo_events_select_public"
  on public.events for select
  using (true);

create policy "demo_events_insert_organizer"
  on public.events for insert
  to authenticated
  with check (
    organizer_id = auth.uid()
    and (
      exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
        and profiles.role in ('organizer', 'venue')
      )
      or exists (
        select 1 from public.profile_role_access
        where profile_role_access.user_id = auth.uid()
        and profile_role_access.role in ('organizer', 'venue')
        and profile_role_access.status = 'active'
      )
    )
  );

create policy "demo_events_update_organizer"
  on public.events for update
  to authenticated
  using (organizer_id = auth.uid())
  with check (
    organizer_id = auth.uid()
    and (
      exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
        and profiles.role in ('organizer', 'venue')
      )
      or exists (
        select 1 from public.profile_role_access
        where profile_role_access.user_id = auth.uid()
        and profile_role_access.role in ('organizer', 'venue')
        and profile_role_access.status = 'active'
      )
    )
  );

create policy "demo_events_delete_organizer"
  on public.events for delete
  to authenticated
  using (
    organizer_id = auth.uid()
    and (
      exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
        and profiles.role in ('organizer', 'venue')
      )
      or exists (
        select 1 from public.profile_role_access
        where profile_role_access.user_id = auth.uid()
        and profile_role_access.role in ('organizer', 'venue')
        and profile_role_access.status = 'active'
      )
    )
  );

-- Analytics

create policy "demo_profile_views_insert_anyone"
  on public.profile_views for insert
  with check (
    exists (
      select 1 from public.dj_profiles
      where dj_profiles.id = profile_views.dj_id
    )
    and (viewer_id is null or viewer_id = (select auth.uid()))
  );

create policy "demo_profile_views_select_dj_owner"
  on public.profile_views for select
  to authenticated
  using (
    exists (
      select 1 from public.dj_profiles
      where dj_profiles.id = profile_views.dj_id
      and dj_profiles.user_id = auth.uid()
    )
  );

create policy "demo_track_plays_insert_anyone"
  on public.track_plays for insert
  with check (
    exists (
      select 1 from public.works
      where works.id = track_plays.work_id
      and works.dj_id = track_plays.dj_id
      and coalesce(works.is_deleted, false) = false
      and (
        works.visibility = 'public'
        or exists (
          select 1 from public.dj_profiles
          where dj_profiles.id = works.dj_id
          and dj_profiles.user_id = (select auth.uid())
        )
      )
    )
    and (listener_id is null or listener_id = (select auth.uid()))
  );

create policy "demo_track_plays_select_dj_owner"
  on public.track_plays for select
  to authenticated
  using (
    exists (
      select 1 from public.dj_profiles
      where dj_profiles.id = track_plays.dj_id
      and dj_profiles.user_id = auth.uid()
    )
  );

-- V2: Favorites

create policy "demo_favorites_select_own"
  on public.favorites for select
  to authenticated
  using (auth.uid() = user_id);

create policy "demo_favorites_insert_own"
  on public.favorites for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "demo_favorites_delete_own"
  on public.favorites for delete
  to authenticated
  using (auth.uid() = user_id);

-- V2: Sound Vault, saved moments, playlists, and listening history

create policy "demo_saved_tracks_select_own"
  on public.saved_tracks for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "demo_saved_tracks_insert_own"
  on public.saved_tracks for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "demo_saved_tracks_delete_own"
  on public.saved_tracks for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "demo_saved_moments_select_own"
  on public.saved_moments for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "demo_saved_moments_insert_own"
  on public.saved_moments for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "demo_saved_moments_update_own"
  on public.saved_moments for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "demo_saved_moments_update_related_booking_dj"
  on public.saved_moments for update
  to authenticated
  using (
    exists (
      select 1
      from public.event_lineup_slots
      join public.bookings on bookings.id = event_lineup_slots.booking_id
      join public.dj_profiles on dj_profiles.id = bookings.dj_id
      where event_lineup_slots.saved_moment_id = saved_moments.id
      and dj_profiles.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.bookings
      join public.dj_profiles on dj_profiles.id = bookings.dj_id
      where bookings.source_saved_moment_id = saved_moments.id
      and dj_profiles.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.event_lineup_slots
      join public.bookings on bookings.id = event_lineup_slots.booking_id
      join public.dj_profiles on dj_profiles.id = bookings.dj_id
      where event_lineup_slots.saved_moment_id = saved_moments.id
      and dj_profiles.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.bookings
      join public.dj_profiles on dj_profiles.id = bookings.dj_id
      where bookings.source_saved_moment_id = saved_moments.id
      and dj_profiles.user_id = (select auth.uid())
    )
  );

create policy "demo_saved_moments_delete_own"
  on public.saved_moments for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "demo_playlists_select_own_or_public"
  on public.playlists for select
  to authenticated
  using ((select auth.uid()) = user_id or visibility = 'public');

create policy "demo_playlists_insert_own"
  on public.playlists for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "demo_playlists_update_own"
  on public.playlists for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "demo_playlists_delete_own"
  on public.playlists for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "demo_playlist_tracks_select_related"
  on public.playlist_tracks for select
  to authenticated
  using (
    exists (
      select 1 from public.playlists
      where playlists.id = playlist_tracks.playlist_id
      and (playlists.user_id = (select auth.uid()) or playlists.visibility = 'public')
    )
  );

create policy "demo_playlist_tracks_manage_owner"
  on public.playlist_tracks for all
  to authenticated
  using (
    exists (
      select 1 from public.playlists
      where playlists.id = playlist_tracks.playlist_id
      and playlists.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.playlists
      where playlists.id = playlist_tracks.playlist_id
      and playlists.user_id = (select auth.uid())
    )
  );

create policy "demo_listening_history_select_own"
  on public.listening_history for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "demo_listening_history_insert_own"
  on public.listening_history for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "demo_listening_history_delete_own"
  on public.listening_history for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "demo_user_interactions_select_own"
  on public.user_interactions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "demo_user_interactions_insert_own"
  on public.user_interactions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "demo_user_interactions_delete_own"
  on public.user_interactions for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "demo_user_sound_profile_select_own"
  on public.user_sound_profile for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "demo_user_sound_profile_insert_own"
  on public.user_sound_profile for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "demo_user_sound_profile_update_own"
  on public.user_sound_profile for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "demo_user_sound_profile_delete_own"
  on public.user_sound_profile for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- V2: Reviews and ratings

create policy "demo_reviews_select_public"
  on public.reviews for select
  using (true);

create policy "demo_reviews_insert_own"
  on public.reviews for insert
  to authenticated
  with check (auth.uid() = reviewer_id);

create policy "demo_reviews_update_own"
  on public.reviews for update
  to authenticated
  using (auth.uid() = reviewer_id)
  with check (auth.uid() = reviewer_id);

-- V2: Notifications. Users can notify themselves or the counterparty on an existing booking.

create policy "demo_notifications_select_own"
  on public.notifications for select
  to authenticated
  using (auth.uid() = user_id);

create policy "demo_notifications_insert_authenticated"
  on public.notifications for insert
  to authenticated
  with check (
    user_id = auth.uid()
    or exists (
      select 1
      from public.bookings
      join public.dj_profiles on dj_profiles.id = bookings.dj_id
      where (
        bookings.organizer_id = auth.uid()
        and dj_profiles.user_id = notifications.user_id
      )
      or (
        dj_profiles.user_id = auth.uid()
        and bookings.organizer_id = notifications.user_id
      )
    )
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "demo_notifications_update_own"
  on public.notifications for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "demo_notifications_delete_own"
  on public.notifications for delete
  to authenticated
  using (auth.uid() = user_id);

-- V2: Availability calendar

create policy "demo_availability_select_public"
  on public.availability for select
  using (true);

create policy "demo_availability_manage_dj_owner"
  on public.availability for all
  to authenticated
  using (
    exists (
      select 1 from public.dj_profiles
      where dj_profiles.id = availability.dj_id
      and dj_profiles.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.dj_profiles
      where dj_profiles.id = availability.dj_id
      and dj_profiles.user_id = auth.uid()
    )
  );

-- V2: Venue profiles

create policy "demo_venue_profiles_select_public"
  on public.venue_profiles for select
  using (true);

create policy "demo_venue_profiles_insert_own"
  on public.venue_profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "demo_venue_profiles_update_own"
  on public.venue_profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- V2: Event Desk lineup slots

create policy "demo_event_lineup_slots_select_public"
  on public.event_lineup_slots for select
  using (true);

create policy "demo_event_lineup_slots_manage_event_owner"
  on public.event_lineup_slots for all
  to authenticated
  using (
    exists (
      select 1 from public.events
      where events.id = event_lineup_slots.event_id
      and events.organizer_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.events
      where events.id = event_lineup_slots.event_id
      and events.organizer_id = (select auth.uid())
    )
  );

create policy "demo_event_lineup_slots_update_related_dj"
  on public.event_lineup_slots for update
  to authenticated
  using (
    exists (
      select 1
      from public.bookings
      join public.dj_profiles on dj_profiles.id = bookings.dj_id
      where bookings.id = event_lineup_slots.booking_id
      and dj_profiles.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.bookings
      join public.dj_profiles on dj_profiles.id = bookings.dj_id
      where bookings.id = event_lineup_slots.booking_id
      and dj_profiles.user_id = (select auth.uid())
    )
  );

-- V3: Payments / ticketing placeholders

create policy "demo_payments_select_related"
  on public.payments for select
  to authenticated
  using (
    auth.uid() = payer_id
    or auth.uid() = receiver_id
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "demo_payments_insert_related"
  on public.payments for insert
  to authenticated
  with check (auth.uid() = payer_id);

create policy "demo_event_tickets_select_own"
  on public.event_tickets for select
  to authenticated
  using (auth.uid() = buyer_id);

create policy "demo_event_tickets_insert_own"
  on public.event_tickets for insert
  to authenticated
  with check (auth.uid() = buyer_id);

-- V2/V3: Admin reports

create policy "demo_admin_reports_insert_authenticated"
  on public.admin_reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);

create policy "demo_admin_reports_select_admin"
  on public.admin_reports for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "demo_admin_reports_update_admin"
  on public.admin_reports for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- V3: Stream sessions and subscriptions

create policy "demo_stream_sessions_select_public"
  on public.stream_sessions for select
  using (true);

create policy "demo_stream_sessions_manage_dj_owner"
  on public.stream_sessions for all
  to authenticated
  using (
    exists (
      select 1 from public.dj_profiles
      where dj_profiles.id = stream_sessions.dj_id
      and dj_profiles.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.dj_profiles
      where dj_profiles.id = stream_sessions.dj_id
      and dj_profiles.user_id = auth.uid()
    )
  );

create policy "demo_subscriptions_select_own"
  on public.subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "demo_subscriptions_insert_own"
  on public.subscriptions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "demo_subscriptions_update_own"
  on public.subscriptions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =========================================================
-- Seed demo data for support pages
-- =========================================================

insert into public.live_streams (
  owner_id,
  title,
  artist_name,
  location,
  genre,
  status,
  starts_at,
  embed_url,
  stream_url,
  thumbnail_url
)
select *
from (
  values
  (
    null::uuid,
    'Exhale / Tresor Berlin',
    'Amelie Lens',
    'Berlin',
    'Techno',
    'live',
    now(),
    null,
    null,
    null
  ),
  (
    null::uuid,
    'Awakenings Festival',
    'Ben Klock',
    'Amsterdam',
    'Techno',
    'archived',
    now() - interval '14 days',
    null,
    null,
    null
  ),
  (
    null::uuid,
    'Time Warp DE',
    'Nina Kraviz',
    'Mannheim',
    'Acid',
    'archived',
    now() - interval '30 days',
    null,
    null,
    null
  )
) as seed(owner_id, title, artist_name, location, genre, status, starts_at, embed_url, stream_url, thumbnail_url)
where not exists (
  select 1
  from public.live_streams
  where live_streams.title = seed.title
  and live_streams.artist_name = seed.artist_name
);

insert into public.events (
  organizer_id,
  title,
  description,
  venue_name,
  city,
  country,
  event_date,
  event_type,
  lineup,
  poster_url
)
select *
from (
  values
  (
    null::uuid,
    'Void Resonance',
    'A concrete-room techno event with extended DJ sets and low-light visuals.',
    'Basement',
    'Berlin',
    'DE',
    '2026-10-24'::date,
    'Techno',
    'DVS1 + Rodhad + Blawan / Visuals by HEX',
    null
  ),
  (
    null::uuid,
    'Industrial Decay',
    'Industrial and experimental sound for a late-night warehouse program.',
    'Warehouse 4',
    'London',
    'UK',
    '2026-11-08'::date,
    'Experimental',
    'Surgeon + Paula Temple / Live modular set',
    null
  ),
  (
    null::uuid,
    'Synaptic Shift',
    'Extended B2B archive-focused club night with raw visuals.',
    'Sector 9',
    'Amsterdam',
    'NL',
    '2026-12-15'::date,
    'Live',
    'Objekt + Call Super / Extended B2B',
    null
  )
) as seed(organizer_id, title, description, venue_name, city, country, event_date, event_type, lineup, poster_url)
where not exists (
  select 1
  from public.events
  where events.title = seed.title
  and events.event_date = seed.event_date
);

-- =========================================================
-- Storage
-- =========================================================
-- tracks: public audio uploads. images: public covers for tracks, playlists, avatars, and event posters.
-- documents: public demo PDFs for technical riders. In production this should become private + signed URLs.
-- The app stores user-owned files under the authenticated user's UUID folder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tracks',
  'tracks',
  true,
  52428800,
  array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'images',
  'images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  true,
  10485760,
  array['application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "tracks_select_public" on storage.objects;
drop policy if exists "tracks_insert_owner_folder" on storage.objects;
drop policy if exists "tracks_update_owner_folder" on storage.objects;
drop policy if exists "tracks_delete_owner_folder" on storage.objects;
drop policy if exists "demo_tracks_select_public" on storage.objects;
drop policy if exists "demo_tracks_select_owner_folder" on storage.objects;
drop policy if exists "demo_tracks_insert_owner_folder" on storage.objects;
drop policy if exists "demo_tracks_update_owner_folder" on storage.objects;
drop policy if exists "demo_tracks_delete_owner_folder" on storage.objects;
drop policy if exists "demo_images_select_public" on storage.objects;
drop policy if exists "demo_images_select_owner_folder" on storage.objects;
drop policy if exists "demo_images_insert_owner_folder" on storage.objects;
drop policy if exists "demo_images_update_owner_folder" on storage.objects;
drop policy if exists "demo_images_delete_owner_folder" on storage.objects;
drop policy if exists "demo_documents_select_owner_folder" on storage.objects;
drop policy if exists "demo_documents_insert_owner_folder" on storage.objects;
drop policy if exists "demo_documents_update_owner_folder" on storage.objects;
drop policy if exists "demo_documents_delete_owner_folder" on storage.objects;

create policy "demo_tracks_select_owner_folder"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'tracks'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "demo_tracks_insert_owner_folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'tracks'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "demo_tracks_update_owner_folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'tracks'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'tracks'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "demo_tracks_delete_owner_folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'tracks'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "demo_images_select_owner_folder"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "demo_images_insert_owner_folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "demo_images_update_owner_folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'images'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "demo_images_delete_owner_folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "demo_documents_select_owner_folder"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "demo_documents_insert_owner_folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "demo_documents_update_owner_folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "demo_documents_delete_owner_folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- =========================================================
-- FUTURE V2/V3 TABLES
-- =========================================================
-- The MVP remains intentionally small. The SQL below documents the next
-- database modules for V2/V3 and can be uncommented module by module when
-- the product needs those flows.

-- Reviews: ratings after completed bookings.
-- create table if not exists public.reviews (
--   id uuid primary key default gen_random_uuid(),
--   booking_id uuid references public.bookings(id) on delete cascade,
--   reviewer_id uuid references public.profiles(id) on delete cascade,
--   reviewee_id uuid references public.profiles(id) on delete cascade,
--   rating integer check (rating between 1 and 5),
--   comment text,
--   created_at timestamp with time zone default now()
-- );
-- create index if not exists idx_reviews_reviewee_id on public.reviews(reviewee_id);

-- Favorites: listeners and organizers can save DJs.
-- create table if not exists public.favorites (
--   id uuid primary key default gen_random_uuid(),
--   user_id uuid references public.profiles(id) on delete cascade,
--   dj_id uuid references public.dj_profiles(id) on delete cascade,
--   created_at timestamp with time zone default now(),
--   unique (user_id, dj_id)
-- );
-- create index if not exists idx_favorites_user_id on public.favorites(user_id);
-- create index if not exists idx_favorites_dj_id on public.favorites(dj_id);

-- Notifications: booking updates, stream reminders, event alerts.
-- create table if not exists public.notifications (
--   id uuid primary key default gen_random_uuid(),
--   user_id uuid references public.profiles(id) on delete cascade,
--   type text,
--   title text,
--   body text,
--   is_read boolean default false,
--   created_at timestamp with time zone default now()
-- );
-- create index if not exists idx_notifications_user_read on public.notifications(user_id, is_read);

-- Availability: DJ calendar for available, unavailable, and booked dates.
-- create table if not exists public.availability (
--   id uuid primary key default gen_random_uuid(),
--   dj_id uuid references public.dj_profiles(id) on delete cascade,
--   date date not null,
--   status text check (status in ('available', 'unavailable', 'booked')),
--   note text,
--   unique (dj_id, date)
-- );
-- create index if not exists idx_availability_dj_date on public.availability(dj_id, date);

-- Venue profiles: physical clubs with recurring events and public pages.
-- create table if not exists public.venue_profiles (
--   id uuid primary key default gen_random_uuid(),
--   user_id uuid references public.profiles(id) on delete cascade,
--   venue_name text,
--   country text,
--   city text,
--   address text,
--   capacity integer,
--   description text,
--   website_url text,
--   instagram_url text,
--   created_at timestamp with time zone default now(),
--   unique (user_id)
-- );
-- create index if not exists idx_venue_profiles_city on public.venue_profiles(city);

-- Payments: future payment and escrow ledger for bookings.
-- create table if not exists public.payments (
--   id uuid primary key default gen_random_uuid(),
--   booking_id uuid references public.bookings(id) on delete cascade,
--   payer_id uuid references public.profiles(id) on delete set null,
--   receiver_id uuid references public.profiles(id) on delete set null,
--   amount numeric,
--   currency text default 'EUR',
--   status text check (status in ('pending', 'paid', 'released', 'refunded', 'failed')),
--   provider text,
--   created_at timestamp with time zone default now()
-- );
-- create index if not exists idx_payments_booking_id on public.payments(booking_id);
-- create index if not exists idx_payments_status on public.payments(status);

-- Event tickets: future public listener ticketing.
-- create table if not exists public.event_tickets (
--   id uuid primary key default gen_random_uuid(),
--   event_id uuid references public.events(id) on delete cascade,
--   buyer_id uuid references public.profiles(id) on delete set null,
--   ticket_code text,
--   status text check (status in ('active', 'used', 'cancelled')),
--   created_at timestamp with time zone default now()
-- );
-- create index if not exists idx_event_tickets_event_id on public.event_tickets(event_id);
-- create index if not exists idx_event_tickets_buyer_id on public.event_tickets(buyer_id);

-- Admin reports: moderation and abuse reporting.
-- create table if not exists public.admin_reports (
--   id uuid primary key default gen_random_uuid(),
--   reporter_id uuid references public.profiles(id) on delete set null,
--   target_type text,
--   target_id uuid,
--   reason text,
--   status text check (status in ('open', 'reviewed', 'resolved', 'rejected')),
--   created_at timestamp with time zone default now()
-- );
-- create index if not exists idx_admin_reports_status on public.admin_reports(status);

-- Stream sessions: advanced live stream scheduling and archive state.
-- create table if not exists public.stream_sessions (
--   id uuid primary key default gen_random_uuid(),
--   dj_id uuid references public.dj_profiles(id) on delete cascade,
--   title text,
--   stream_url text,
--   status text check (status in ('scheduled', 'live', 'ended', 'archived')),
--   scheduled_at timestamp with time zone,
--   started_at timestamp with time zone,
--   ended_at timestamp with time zone,
--   viewer_count integer default 0,
--   created_at timestamp with time zone default now()
-- );
-- create index if not exists idx_stream_sessions_status on public.stream_sessions(status);
-- create index if not exists idx_stream_sessions_dj_id on public.stream_sessions(dj_id);

-- Subscriptions: premium plans and monetization.
-- create table if not exists public.subscriptions (
--   id uuid primary key default gen_random_uuid(),
--   user_id uuid references public.profiles(id) on delete cascade,
--   plan text,
--   status text,
--   started_at timestamp with time zone,
--   expires_at timestamp with time zone
-- );
-- create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);

-- Future standalone messages table if chat grows beyond booking threads.
-- Keep these commented until public.messages exists:
-- create index if not exists idx_messages_sender_id on public.messages(sender_id);
-- create index if not exists idx_messages_receiver_id on public.messages(receiver_id);
