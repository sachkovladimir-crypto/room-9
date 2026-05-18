import { deriveTrackAudioFeatures } from "@/lib/trackAudioFeatures";
import type { TrackAudioFeature, UserInteraction, UserSoundProfile, Work } from "@/lib/types";
import type { SignalIntent, SignalMomentLike, SignalPlaylistLike } from "@/lib/signalEngine";
import { parseBpm } from "@/lib/signalEngine";

type ProfileWork = Pick<
  Work,
  "bpm" | "description" | "duration_seconds" | "genre" | "id" | "title" | "waveform_peaks"
>;

type ProfileFeature = Pick<
  TrackAudioFeature,
  "bpm" | "darkness" | "energy" | "groove" | "room_fit" | "sound_dna"
>;

export type UserSoundProfileDraft = Omit<
  UserSoundProfile,
  "created_at" | "id" | "updated_at" | "user_id"
> & {
  headline: string;
  signalIntent: SignalIntent;
};

type BuildUserSoundProfileInput = {
  featureLookup?: Record<string, ProfileFeature | undefined>;
  interactions?: Array<Pick<UserInteraction, "interaction_type" | "metadata" | "weight" | "work_id">>;
  playlists?: SignalPlaylistLike[];
  savedMoments?: SignalMomentLike[];
  savedTrackIds?: string[];
  works: ProfileWork[];
};

const interactionWeights: Partial<Record<UserInteraction["interaction_type"], number>> = {
  add_to_playlist: 1.5,
  add_to_queue: 0.8,
  attach_to_event_slot: 3.4,
  booking_sent: 4,
  complete: 1.8,
  like: 2.2,
  open_artist: 1.2,
  open_track: 1,
  play: 0.7,
  save_moment: 3,
  save_track: 2.4,
  start_booking: 3.6
};

export function buildUserSoundProfileModel({
  featureLookup = {},
  interactions = [],
  playlists = [],
  savedMoments = [],
  savedTrackIds = [],
  works
}: BuildUserSoundProfileInput): UserSoundProfileDraft {
  const weights = new Map<string, number>();
  const playlistTrackIds = playlists.flatMap((playlist) => playlist.trackIds ?? []);

  savedTrackIds.forEach((id) => addWeight(weights, id, 2.4));
  playlistTrackIds.forEach((id) => addWeight(weights, id, 1.5));
  savedMoments.forEach((moment) => {
    if (moment.trackId) {
      addWeight(weights, moment.trackId, moment.momentLabel?.toLowerCase().includes("peak") ? 3.8 : 3);
    }
  });
  interactions.forEach((interaction) => {
    if (!interaction.work_id) {
      return;
    }
    const base = interactionWeights[interaction.interaction_type] ?? 0.5;
    addWeight(weights, interaction.work_id, base * (interaction.weight ?? 1));
  });

  const workLookup = new Map(works.map((work) => [work.id, work]));
  const weightedWorks = Array.from(weights.entries())
    .map(([workId, weight]) => ({ feature: getFeature(workLookup.get(workId), featureLookup[workId]), weight, work: workLookup.get(workId) }))
    .filter((entry): entry is { feature: ProfileFeature; weight: number; work: ProfileWork } => Boolean(entry.work && entry.feature));

  const preferredGenres = topValues([
    ...weightedWorks.flatMap(({ weight, work }) => repeatToken(splitTokens(work.genre), weight)),
    ...savedMoments.flatMap((moment) => repeatToken(splitTokens(getMomentGenreHint(moment)), 1.8))
  ], 5);
  const preferredRoomTypes = topValues([
    ...weightedWorks.flatMap(({ feature, weight }) => repeatToken(feature.room_fit ?? [], weight)),
    ...savedMoments.flatMap((moment) => repeatToken(splitTokens(moment.roomType), 2.2))
  ], 4);
  const topDnaTags = topValues(
    weightedWorks.flatMap(({ feature, weight }) => repeatToken(feature.sound_dna ?? [], weight)),
    8
  );

  const bpmValues = weightedWorks
    .map(({ feature, work }) => numberOrNull(feature.bpm) ?? parseBpm(work.bpm))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const avgEnergy = weightedAverage(weightedWorks.map(({ feature, weight }) => [numberOrNull(feature.energy) ?? 5.8, weight]));
  const avgDarkness = weightedAverage(weightedWorks.map(({ feature, weight }) => [numberOrNull(feature.darkness) ?? 5.4, weight]));
  const avgGroove = weightedAverage(weightedWorks.map(({ feature, weight }) => [numberOrNull(feature.groove) ?? 5.6, weight]));
  const bpmRange = bpmValues.length ? getPaddedRange(bpmValues, 5) : null;
  const interactionCount = interactions.length;
  const evidenceCount = savedTrackIds.length + savedMoments.length + playlistTrackIds.length + interactionCount;
  const confidence = clamp(0.28 + Math.min(0.62, evidenceCount * 0.035) + Math.min(0.1, weightedWorks.length * 0.01), 0.28, 0.94);
  const headline = [
    preferredGenres[0] ?? "adaptive",
    bpmRange ? `${Math.round(bpmRange[0])}-${Math.round(bpmRange[1])} BPM` : "open BPM",
    preferredRoomTypes[0] ?? "multi-room"
  ].join(" / ");

  return {
    avg_darkness: roundOne(avgDarkness),
    avg_energy: roundOne(avgEnergy),
    avg_groove: roundOne(avgGroove),
    bpm_max: bpmRange?.[1] ?? null,
    bpm_min: bpmRange?.[0] ?? null,
    confidence: roundTwo(confidence),
    headline,
    interaction_count: interactionCount,
    playlist_track_count: playlistTrackIds.length,
    preferred_genres: preferredGenres,
    preferred_room_types: preferredRoomTypes,
    profile_vector: {
      evidence_count: evidenceCount,
      model: "room9-deterministic-v1",
      top_dna_tags: topDnaTags,
      weighted_track_count: weightedWorks.length
    },
    saved_moment_count: savedMoments.length,
    saved_track_count: savedTrackIds.length,
    signalIntent: userSoundProfileToSignalIntent({
      bpm_max: bpmRange?.[1] ?? null,
      bpm_min: bpmRange?.[0] ?? null,
      preferred_genres: preferredGenres,
      preferred_room_types: preferredRoomTypes
    }),
    top_dna_tags: topDnaTags
  };
}

export function userSoundProfileToSignalIntent(
  profile: Pick<UserSoundProfile, "bpm_max" | "bpm_min" | "preferred_genres" | "preferred_room_types">,
  fallback: SignalIntent = {}
): SignalIntent {
  return {
    ...fallback,
    bpmRange:
      typeof profile.bpm_min === "number" && typeof profile.bpm_max === "number"
        ? [profile.bpm_min, profile.bpm_max]
        : fallback.bpmRange ?? null,
    preferredGenres: profile.preferred_genres?.length ? profile.preferred_genres : fallback.preferredGenres ?? [],
    roomTypes: profile.preferred_room_types?.length ? profile.preferred_room_types : fallback.roomTypes ?? []
  };
}

export function blendUserSoundProfileWithIntent(
  profile: Pick<UserSoundProfile, "bpm_max" | "bpm_min" | "preferred_genres" | "preferred_room_types"> | null | undefined,
  intent: SignalIntent = {}
): SignalIntent {
  if (!profile) {
    return intent;
  }

  const profileIntent = userSoundProfileToSignalIntent(profile);

  return {
    ...profileIntent,
    ...intent,
    bpmRange: intent.bpmRange ?? profileIntent.bpmRange ?? null,
    preferredGenres: intent.preferredGenres?.length ? intent.preferredGenres : profileIntent.preferredGenres ?? [],
    roomTypes: intent.roomTypes?.length ? intent.roomTypes : profileIntent.roomTypes ?? []
  };
}

export function getUserSoundProfileHeadline(
  profile?: Pick<UserSoundProfile, "bpm_max" | "bpm_min" | "confidence" | "preferred_genres" | "preferred_room_types"> | null
) {
  if (!profile) {
    return "Adaptive signal";
  }

  const genre = profile.preferred_genres?.[0] ?? "adaptive";
  const bpm =
    typeof profile.bpm_min === "number" && typeof profile.bpm_max === "number"
      ? `${Math.round(profile.bpm_min)}-${Math.round(profile.bpm_max)} BPM`
      : "open BPM";
  const room = profile.preferred_room_types?.[0] ?? "multi-room";
  const confidence = typeof profile.confidence === "number" ? ` / ${Math.round(profile.confidence * 100)}% confidence` : "";

  return `${genre} / ${bpm} / ${room}${confidence}`;
}

function getFeature(work?: ProfileWork, persistedFeature?: ProfileFeature) {
  if (persistedFeature) {
    return persistedFeature;
  }
  if (!work) {
    return null;
  }
  return deriveTrackAudioFeatures(work);
}

function getMomentGenreHint(moment: SignalMomentLike) {
  return [moment.trackTitle, moment.momentLabel, moment.roomType].join(" ").match(/techno|house|rap|acid|industrial|hypnotic|groove/i)?.[0] ?? null;
}

function splitTokens(value?: string | number | null) {
  return String(value ?? "")
    .split(/[,/|]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function repeatToken(tokens: string[], weight: number) {
  return tokens.flatMap((token) => Array.from({ length: Math.max(1, Math.round(weight)) }, () => token));
}

function topValues(values: string[], limit: number) {
  const counts = values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value]) => value);
}

function addWeight(map: Map<string, number>, id: string, weight: number) {
  map.set(id, (map.get(id) ?? 0) + weight);
}

function weightedAverage(entries: Array<[number, number]>) {
  const validEntries = entries.filter(([value, weight]) => Number.isFinite(value) && weight > 0);
  const totalWeight = validEntries.reduce((sum, [, weight]) => sum + weight, 0);
  if (totalWeight <= 0) {
    return 0;
  }
  return validEntries.reduce((sum, [value, weight]) => sum + value * weight, 0) / totalWeight;
}

function getPaddedRange(values: number[], padding: number): [number, number] {
  return [Math.max(60, Math.min(...values) - padding), Math.min(220, Math.max(...values) + padding)];
}

function numberOrNull(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function roundTwo(value: number) {
  return Math.round(value * 100) / 100;
}
