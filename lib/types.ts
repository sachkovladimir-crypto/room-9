export type Role = "dj" | "organizer" | "admin" | "listener" | "venue";
export type MvpRole = "dj" | "organizer";
export type FutureRole = "admin" | "listener" | "venue";
export type PublicRegisterRole = "dj" | "organizer" | "listener" | "venue";
export type BookingClientRole = "organizer" | "venue";

export const MVP_ROLES: MvpRole[] = ["dj", "organizer"];
export const FUTURE_ROLES: FutureRole[] = ["admin", "listener", "venue"];
export const PUBLIC_REGISTER_ROLES: PublicRegisterRole[] = [
  "dj",
  "organizer",
  "venue",
  "listener"
];

export type BookingStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "completed"
  | "paid"
  | "disputed";

export type Profile = {
  id: string;
  email: string | null;
  role: Role;
  created_at: string;
};

export type RoleAccessStatus = "locked" | "pending" | "active" | "rejected";

export type ProfileRoleAccess = {
  id: string;
  user_id: string;
  role: Role;
  status: RoleAccessStatus;
  created_at: string;
  updated_at: string | null;
};

export type DjProfile = {
  id: string;
  user_id: string;
  stage_name: string | null;
  bio: string | null;
  country: string | null;
  city: string | null;
  genres: string | null;
  bpm_range: string | null;
  price: number | null;
  avatar_url: string | null;
  cover_image_url: string | null;
  profile_theme: string | null;
  soundcloud_url: string | null;
  mixcloud_url: string | null;
  technical_rider_url?: string | null;
  is_available: boolean;
  created_at: string;
};

export type OrganizerProfile = {
  id: string;
  user_id: string;
  organization_name: string | null;
  country: string | null;
  city: string | null;
  contact_email: string | null;
  description: string | null;
  created_at: string;
};

export type VenueProfile = {
  id: string;
  user_id: string;
  venue_name: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  capacity: number | null;
  description: string | null;
  website_url: string | null;
  instagram_url: string | null;
  created_at: string;
};

export type Booking = {
  id: string;
  organizer_id: string;
  dj_id: string;
  event_date: string;
  venue_name: string;
  city: string;
  event_type: string;
  message: string | null;
  status: BookingStatus;
  source_work_id: string | null;
  source_event_id?: string | null;
  source_slot_id?: string | null;
  source_saved_moment_id?: string | null;
  source_track_title: string | null;
  source_timestamp_seconds: number | null;
  source_timestamp_label: string | null;
  source_moment_note: string | null;
  archived_by_dj: boolean | null;
  archived_by_organizer: boolean | null;
  created_at: string;
};

export type Work = {
  id: string;
  dj_id: string;
  title: string | null;
  type: string | null;
  link: string | null;
  description: string | null;
  cover_image: string | null;
  lyrics: string | null;
  genre: string | null;
  bpm: string | null;
  key: string | null;
  visibility: "public" | "private" | null;
  play_count: number | null;
  like_count: number | null;
  duration_seconds: number | null;
  waveform_peaks: number[] | null;
  waveform_analyzed_at: string | null;
  is_deleted: boolean | null;
  created_at: string;
};

export type TrackAudioFeature = {
  id: string;
  work_id: string;
  bpm: number | null;
  energy: number | null;
  darkness: number | null;
  groove: number | null;
  intensity: number | null;
  density: number | null;
  vocal_presence: number | null;
  room_fit: string[] | null;
  moment_types: string[] | null;
  sound_dna: string[] | null;
  waveform_profile: Record<string, unknown> | null;
  source: "metadata" | "audio-analysis" | "manual" | "ml" | string | null;
  confidence: number | null;
  created_at: string;
  updated_at: string | null;
};

export type UserSoundProfile = {
  id: string;
  user_id: string;
  preferred_genres: string[] | null;
  bpm_min: number | null;
  bpm_max: number | null;
  avg_energy: number | null;
  avg_darkness: number | null;
  avg_groove: number | null;
  preferred_room_types: string[] | null;
  top_dna_tags: string[] | null;
  saved_track_count: number | null;
  saved_moment_count: number | null;
  playlist_track_count: number | null;
  interaction_count: number | null;
  profile_vector: Record<string, unknown> | null;
  confidence: number | null;
  created_at: string;
  updated_at: string | null;
};

export type ReleaseType = "single" | "ep" | "album" | "set";

export type Release = {
  id: string;
  dj_id: string;
  title: string;
  release_type: ReleaseType;
  description: string | null;
  cover_image: string | null;
  visibility: "public" | "private";
  created_at: string;
  updated_at: string | null;
};

export type ReleaseTrack = {
  id: string;
  release_id: string;
  work_id: string;
  position: number | null;
  created_at: string;
};

export type SavedTrack = {
  id: string;
  user_id: string;
  work_id: string;
  created_at: string;
};

export type SavedMomentStatus = "saved" | "used-in-booking" | "in-case-file";

export type SavedMoment = {
  id: string;
  user_id: string;
  work_id: string;
  dj_id: string | null;
  timestamp_seconds: number;
  timestamp_label: string | null;
  moment_label: string | null;
  energy: string | null;
  room_type: string | null;
  notes: string | null;
  status: SavedMomentStatus;
  created_at: string;
  updated_at: string;
};

export type Playlist = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  visibility: "private" | "public";
  cover_image: string | null;
  created_at: string;
  updated_at: string;
};

export type PlaylistTrack = {
  id: string;
  playlist_id: string;
  work_id: string;
  position: number | null;
  added_at: string;
};

export type ListeningHistoryItem = {
  id: string;
  user_id: string;
  work_id: string;
  played_at: string;
  position_seconds: number | null;
};

export type UserInteractionType =
  | "play"
  | "pause"
  | "complete"
  | "skip"
  | "like"
  | "unlike"
  | "save_track"
  | "remove_saved_track"
  | "save_moment"
  | "remove_moment"
  | "add_to_playlist"
  | "remove_from_playlist"
  | "create_playlist"
  | "add_to_queue"
  | "remove_from_queue"
  | "open_track"
  | "open_artist"
  | "attach_to_event_slot"
  | "start_booking"
  | "booking_sent";

export type UserInteraction = {
  id: string;
  user_id: string;
  work_id: string | null;
  dj_id: string | null;
  event_id: string | null;
  booking_id: string | null;
  interaction_type: UserInteractionType;
  timestamp_seconds: number | null;
  weight: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type BookingMessage = {
  id: string;
  booking_id: string;
  sender_id: string;
  message: string;
  created_at: string;
};

export type LiveStream = {
  id: string;
  owner_id: string | null;
  title: string;
  artist_name: string;
  location: string | null;
  genre: string | null;
  status: "live" | "upcoming" | "archived";
  starts_at: string | null;
  embed_url: string | null;
  stream_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
};

export type EventPost = {
  id: string;
  organizer_id: string | null;
  title: string;
  description: string | null;
  venue_name: string | null;
  city: string | null;
  country: string | null;
  event_date: string | null;
  event_type: string | null;
  status: "draft" | "public" | "hold" | "archived" | null;
  capacity: number | null;
  budget: number | null;
  lineup: string | null;
  poster_url: string | null;
  created_at: string;
};

export type EventLineupSlotType = "opening" | "support" | "peak" | "closing" | "stream";
export type EventLineupSlotStatus = "searching" | "hold" | "accepted" | "optional" | "blocked";

export type EventLineupSlot = {
  id: string;
  event_id: string;
  slot_type: EventLineupSlotType;
  dj_id: string | null;
  saved_moment_id: string | null;
  booking_id: string | null;
  status: EventLineupSlotStatus;
  position: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
};

export type ProfileView = {
  id: string;
  dj_id: string;
  viewer_id: string | null;
  created_at: string;
};

export type TrackPlay = {
  id: string;
  work_id: string;
  dj_id: string;
  listener_id: string | null;
  created_at: string;
};

export type Favorite = {
  id: string;
  user_id: string;
  dj_id: string;
  created_at: string;
};

export type Review = {
  id: string;
  booking_id: string | null;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

export type Notification = {
  id: string;
  user_id: string;
  type: string | null;
  title: string | null;
  body: string | null;
  is_read: boolean;
  created_at: string;
};

export function normalizeRoleAccess(
  fallbackRole: Role | null | undefined,
  accessRows?: Array<Pick<ProfileRoleAccess, "role" | "status">> | null
) {
  const roles = new Set<Role>(["listener"]);

  if (fallbackRole) {
    roles.add(fallbackRole);
  }

  accessRows
    ?.filter((row) => row.status === "active")
    .forEach((row) => roles.add(row.role));

  return Array.from(roles);
}

export function hasRoleAccess(roleInput: Role | Role[] | null | undefined, allowedRoles: Role[]) {
  const roles = Array.isArray(roleInput) ? roleInput : roleInput ? [roleInput] : [];
  return roles.some((role) => allowedRoles.includes(role));
}

export function isBookingClientRole(role: Role | null | undefined): role is BookingClientRole;
export function isBookingClientRole(role: Role[] | null | undefined): boolean;
export function isBookingClientRole(role: Role | Role[] | null | undefined) {
  return hasRoleAccess(role, ["organizer", "venue"]);
}

export function isPublicRegisterRole(role: string | null): role is PublicRegisterRole {
  return role === "dj" || role === "organizer" || role === "listener" || role === "venue";
}

export function getPostAuthPath(role: Role | null | undefined) {
  if (role === "dj" || role === "venue" || role === "admin") {
    return "/dashboard";
  }

  return "/explore";
}
