import { deriveTrackAudioFeatures, getFeatureRoomScore, getFeatureTags } from "@/lib/trackAudioFeatures";
import type { DjProfile, EventLineupSlotType, TrackAudioFeature, Work } from "@/lib/types";

export type SignalIntent = {
  bpmRange?: [number, number] | null;
  city?: string | null;
  feeBand?: string | null;
  mode?: SignalAudienceMode;
  playlistTrackIds?: string[];
  preferredGenres?: string[];
  roomTypes?: string[];
  savedMomentTrackIds?: string[];
  savedTrackIds?: string[];
  slotType?: EventLineupSlotType | null;
};

export type SignalAudienceMode = "listener" | "organizer";

export type TrackSignalInput = {
  dj?: Pick<DjProfile, "bpm_range" | "city" | "country" | "genres" | "is_available" | "price" | "profile_theme" | "stage_name"> | null;
  features?: Pick<TrackAudioFeature, "bpm" | "confidence" | "energy" | "room_fit" | "sound_dna"> | null;
  work: Pick<Work, "bpm" | "description" | "duration_seconds" | "genre" | "id" | "like_count" | "play_count" | "title" | "waveform_peaks">;
};

export type TrackSignalScore = {
  bookingFit: number;
  energy: number;
  featureConfidence: number;
  listenerFit: number;
  mode: SignalAudienceMode;
  organizerFit: number;
  primaryLabel: string;
  reasons: string[];
  roomFit: string[];
  soundMatch: number;
  soundDna: string[];
  sortScore: number;
  tags: string[];
};

export type SignalMomentLike = {
  artist?: string | null;
  bpm?: string | number | null;
  djId?: string | null;
  energy?: string | number | null;
  id: string;
  momentLabel?: string | null;
  roomType?: string | null;
  status?: string | null;
  timestamp?: number | null;
  timestampLabel?: string | null;
  trackId?: string | null;
  trackTitle?: string | null;
};

export type SignalPlaylistLike = {
  trackIds?: string[];
};

export type UserSoundProfileSummary = {
  archiveSize: number;
  bpmRange: [number, number] | null;
  bookingReadyCount: number;
  headline: string;
  highIntentCount: number;
  preferredGenres: string[];
  roomTypes: string[];
};

export type RankedTrackSignal = {
  dj?: DjProfile;
  signal: TrackSignalScore;
  work: Work;
};

export type SignalRecommendationGroup = {
  description: string;
  id: "similar-saved" | "peak-slot" | "sound-zone" | "booking-fit";
  items: Array<RankedTrackSignal & { reason: string }>;
  title: string;
};

export type MomentSlotSignal = {
  fit: number;
  reasons: string[];
  slotLabel: string;
};

const roomTypeKeywords: Record<string, string[]> = {
  "basement club": ["basement", "dark", "low ceiling", "hypnotic", "industrial"],
  "open air": ["open air", "festival", "warm", "groove", "house"],
  warehouse: ["warehouse", "industrial", "hard", "pressure", "peak", "main room"]
};

export function parseBpm(value?: string | number | null) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const match = String(value ?? "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function parseBpmRangeLabel(value?: string | null): [number, number] | null {
  const label = value?.trim();
  if (!label || label.toLowerCase() === "all") {
    return null;
  }

  const range = label.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (range) {
    return [Number(range[1]), Number(range[2])];
  }

  const plus = label.match(/(\d+(?:\.\d+)?)\s*\+/);
  if (plus) {
    return [Number(plus[1]), 220];
  }

  const single = parseBpm(label);
  return single ? [single - 4, single + 4] : null;
}

export function createSignalIntentFromFilters({
  bpmFilter,
  city,
  feeBand,
  genre,
  mode = "listener",
  playlistTrackIds = [],
  roomTypes = [],
  savedMomentTrackIds = [],
  savedTrackIds = []
}: {
  bpmFilter?: string | null;
  city?: string | null;
  feeBand?: string | null;
  genre?: string | null;
  mode?: SignalAudienceMode;
  playlistTrackIds?: string[];
  roomTypes?: string[];
  savedMomentTrackIds?: string[];
  savedTrackIds?: string[];
}): SignalIntent {
  return {
    bpmRange: parseBpmRangeLabel(bpmFilter),
    city: city && city !== "All" ? city : null,
    feeBand: feeBand && feeBand !== "Any" ? feeBand : null,
    mode,
    playlistTrackIds,
    preferredGenres: genre && genre !== "All" ? [genre] : [],
    roomTypes,
    savedMomentTrackIds,
    savedTrackIds
  };
}

export function scoreTrackSignal(input: TrackSignalInput, intent: SignalIntent = {}): TrackSignalScore {
  return scoreTrackSignalWithFeatures(input, intent);
}

export function scoreTrackForListener(input: TrackSignalInput, intent: SignalIntent = {}) {
  return scoreTrackSignalWithFeatures(input, { ...intent, mode: "listener" });
}

export function scoreTrackForOrganizer(input: TrackSignalInput, intent: SignalIntent = {}) {
  return scoreTrackSignalWithFeatures(input, { ...intent, mode: "organizer" });
}

export function scoreTrackSignalWithFeatures({ dj, features, work }: TrackSignalInput, intent: SignalIntent = {}): TrackSignalScore {
  const audioFeatures = features ?? deriveTrackAudioFeatures(work, dj);
  const text = normalizeText([
    work.title,
    work.description,
    work.genre,
    work.bpm,
    dj?.stage_name,
    dj?.genres,
    dj?.city,
    dj?.country,
    dj?.profile_theme,
    ...(audioFeatures.sound_dna ?? []),
    ...(audioFeatures.room_fit ?? [])
  ]);
  const bpm = parseBpm(audioFeatures.bpm ?? work.bpm ?? dj?.bpm_range ?? null);
  const genreScore = getGenreScore(text, intent.preferredGenres);
  const bpmScore = getBpmScore(bpm, intent.bpmRange);
  const energy = getFeatureNumber(audioFeatures.energy) ?? inferEnergy({ bpm, text, work });
  const roomFit = getRoomFitScore(text, intent.roomTypes, audioFeatures);
  const behavior = getBehaviorScore(work.id, intent);
  const trust = getBookingTrustScore(dj, intent);
  const popularity = getPopularityScore(work);
  const saveIntent = getSaveIntentScore(work.id, intent);
  const slotFit = getSlotFitScore({ bpm, energy, features: audioFeatures, intent, text });

  const soundMatch = weightedAverage([
    [genreScore, 0.2],
    [bpmScore, 0.16],
    [energy / 10, 0.18],
    [roomFit, 0.16],
    [behavior, 0.2],
    [trust, 0.1]
  ]);
  const listenerFit = weightedAverage([
    [genreScore, 0.24],
    [bpmScore, 0.14],
    [behavior, 0.2],
    [saveIntent, 0.14],
    [popularity, 0.1],
    [energy / 10, 0.1],
    [(audioFeatures.confidence ?? 0.52), 0.08]
  ]);
  const bookingFit = weightedAverage([
    [soundMatch, 0.24],
    [slotFit, 0.24],
    [dj?.is_available ? 1 : 0.45, 0.15],
    [trust, 0.18],
    [getFeeFitScore(dj?.price ?? null, intent.feeBand), 0.1],
    [getCityFitScore(dj, intent.city), 0.09]
  ]);
  const mode = intent.mode ?? "listener";
  const reasons =
    mode === "organizer"
      ? buildOrganizerSignalReasons({ bpm, bookingFit, features: audioFeatures, intent, roomFit, slotFit, trust })
      : buildListenerSignalReasons({ behavior, bpm, bpmScore, features: audioFeatures, genreScore, listenerFit, popularity, saveIntent });
  const tags = buildSignalTags({ bpm, energy, features: audioFeatures, text });
  const sortScore = Math.round((mode === "organizer" ? bookingFit : listenerFit) * 100);

  return {
    bookingFit: Math.round(bookingFit * 100),
    energy: roundOne(energy),
    featureConfidence: Math.round((audioFeatures.confidence ?? 0.52) * 100),
    listenerFit: Math.round(listenerFit * 100),
    mode,
    organizerFit: Math.round(bookingFit * 100),
    primaryLabel: mode === "organizer" ? "booking fit" : "taste match",
    reasons,
    roomFit: audioFeatures.room_fit ?? [],
    soundMatch: Math.round(soundMatch * 100),
    soundDna: audioFeatures.sound_dna ?? [],
    sortScore,
    tags
  };
}

export function formatSignalScore(score: number) {
  return `${Math.max(0, Math.min(100, Math.round(score)))}%`;
}

export function buildSignalIntentFromArchive({
  works,
  savedTrackIds = [],
  savedMoments = [],
  playlists = []
}: {
  playlists?: SignalPlaylistLike[];
  savedMoments?: SignalMomentLike[];
  savedTrackIds?: string[];
  works: Work[];
}): SignalIntent {
  const savedMomentTrackIds = savedMoments.map((moment) => moment.trackId).filter((id): id is string => Boolean(id));
  const playlistTrackIds = playlists.flatMap((playlist) => playlist.trackIds ?? []);
  const relevantIds = new Set([...savedTrackIds, ...savedMomentTrackIds, ...playlistTrackIds]);
  const relevantWorks = works.filter((work) => relevantIds.has(work.id));
  const preferredGenres = getTopValues(
    [
      ...relevantWorks.map((work) => work.genre),
      ...savedMoments.map((moment) => getMomentGenreHint(moment))
    ],
    4
  );
  const bpmValues = [
    ...relevantWorks.map((work) => parseBpm(work.bpm)),
    ...savedMoments.map((moment) => parseBpm(moment.bpm))
  ].filter((value): value is number => Boolean(value));
  const bpmRange = bpmValues.length > 0 ? getPaddedRange(bpmValues, 5) : null;
  const roomTypes = getTopValues(savedMoments.map((moment) => moment.roomType), 3);

  return {
    bpmRange,
    playlistTrackIds,
    preferredGenres,
    roomTypes,
    savedMomentTrackIds,
    savedTrackIds
  };
}

export function getUserSoundProfileSummary({
  savedMoments = [],
  savedTrackIds = [],
  works
}: {
  savedMoments?: SignalMomentLike[];
  savedTrackIds?: string[];
  works: Work[];
}): UserSoundProfileSummary {
  const intent = buildSignalIntentFromArchive({ savedMoments, savedTrackIds, works });
  const highIntentCount = savedMoments.filter((moment) => parseMomentEnergy(moment.energy) >= 7.5 || /peak|high/i.test(moment.momentLabel ?? "")).length;
  const bookingReadyCount = savedMoments.filter((moment) => moment.status !== "in-case-file").length;
  const archiveSize = new Set([
    ...savedTrackIds,
    ...savedMoments.map((moment) => moment.trackId).filter(Boolean)
  ]).size;
  const bpmLabel = intent.bpmRange ? `${Math.round(intent.bpmRange[0])}-${Math.round(intent.bpmRange[1])} BPM` : "adaptive BPM";
  const genreLabel = intent.preferredGenres?.[0] ?? "mixed";

  return {
    archiveSize,
    bpmRange: intent.bpmRange ?? null,
    bookingReadyCount,
    headline: `${genreLabel} / ${bpmLabel}`,
    highIntentCount,
    preferredGenres: intent.preferredGenres ?? [],
    roomTypes: intent.roomTypes ?? []
  };
}

export function rankTracksBySignal({
  djLookup,
  featureLookup,
  intent,
  works
}: {
  djLookup?: Record<string, DjProfile | undefined>;
  featureLookup?: Record<string, TrackAudioFeature | undefined>;
  intent?: SignalIntent;
  works: Work[];
}): RankedTrackSignal[] {
  return works
    .map((work) => {
      const dj = djLookup?.[work.dj_id];
      return {
        dj,
        signal: scoreTrackSignal({ dj, features: featureLookup?.[work.id] ?? null, work }, intent),
        work
      };
    })
    .sort((a, b) => b.signal.sortScore - a.signal.sortScore);
}

export function buildSignalRecommendationGroups({
  limit = 3,
  rankedTracks,
  savedMoments = [],
  savedTrackIds = []
}: {
  limit?: number;
  rankedTracks: RankedTrackSignal[];
  savedMoments?: SignalMomentLike[];
  savedTrackIds?: string[];
}): SignalRecommendationGroup[] {
  const savedMomentTrackIds = new Set(savedMoments.map((moment) => moment.trackId).filter((id): id is string => Boolean(id)));
  const savedIds = new Set([...savedTrackIds, ...savedMomentTrackIds]);
  const momentWords = new Set(
    savedMoments
      .flatMap((moment) => [moment.momentLabel, moment.roomType, moment.trackTitle])
      .filter(Boolean)
      .flatMap((value) => String(value).toLowerCase().split(/[\s/,.]+/))
      .filter((value) => value.length > 3)
  );

  const similarSaved = rankedTracks
    .filter(({ signal, work }) => !savedIds.has(work.id) && hasSignalWordOverlap(signal, momentWords))
    .slice(0, limit)
    .map((item) => ({
      ...item,
      reason: item.signal.reasons[0] ?? "Similar to your saved sound references"
    }));

  const peakSlot = rankedTracks
    .filter(({ signal }) => signal.energy >= 7.8 || signal.tags.some((tag) => /peak|high|warehouse|pressure/i.test(tag)))
    .slice(0, limit)
    .map((item) => ({
      ...item,
      reason: `${item.signal.energy}/10 energy for peak or late-night pressure`
    }));

  const soundZone = rankedTracks
    .filter(({ work }) => !savedIds.has(work.id))
    .slice(0, limit)
    .map((item) => ({
      ...item,
      reason: item.signal.reasons.find((reason) => /profile|dna|bpm|room/i.test(reason)) ?? "New in your current Sound Zone"
    }));

  const bookingFit = rankedTracks
    .filter(({ signal }) => signal.bookingFit >= 68)
    .slice(0, limit)
    .map((item) => ({
      ...item,
      reason: `${formatSignalScore(item.signal.bookingFit)} booking fit with artist trust and sound evidence`
    }));

  const groups: SignalRecommendationGroup[] = [
    {
      description: "Tracks close to moments you already saved.",
      id: "similar-saved",
      items: similarSaved,
      title: "Similar to saved moments"
    },
    {
      description: "High-pressure tracks for Peak or Closing slots.",
      id: "peak-slot",
      items: peakSlot,
      title: "Fits your peak slot"
    },
    {
      description: "Fresh tracks ranked by your Sound Profile.",
      id: "sound-zone",
      items: soundZone,
      title: "New in your Sound Zone"
    },
    {
      description: "Artist signals that can become booking cases.",
      id: "booking-fit",
      items: bookingFit,
      title: "High booking-fit artists"
    }
  ];

  return groups.filter((group) => group.items.length > 0);
}

export function scoreMomentForSlot(moment: SignalMomentLike, slotType: EventLineupSlotType, intent: SignalIntent = {}): MomentSlotSignal {
  const preferred = getSlotPreference(slotType);
  const bpm = parseBpm(moment.bpm);
  const energy = parseMomentEnergy(moment.energy, moment.momentLabel);
  const bpmScore = getBpmScore(bpm, preferred.bpmRange);
  const energyScore = Math.max(0.25, 1 - Math.abs(energy - preferred.energy) / 5);
  const roomText = normalizeText([moment.roomType, moment.momentLabel, moment.trackTitle]);
  const roomScore = preferred.keywords.some((keyword) => roomText.includes(keyword)) ? 1 : 0.56;
  const profileBpmScore = getBpmScore(bpm, intent.bpmRange);
  const profileRoomScore = getRoomFitScore(roomText, intent.roomTypes);
  const profileGenreScore = getGenreScore(roomText, intent.preferredGenres);
  const hasProfileSignal = Boolean(intent.bpmRange || intent.preferredGenres?.length || intent.roomTypes?.length);
  const profileScore = hasProfileSignal
    ? weightedAverage([
        [profileBpmScore, 0.34],
        [profileGenreScore, 0.28],
        [profileRoomScore, 0.38]
      ])
    : 0.68;
  const statusScore = moment.status === "in-case-file" ? 0.42 : 0.82;
  const fit = Math.round(weightedAverage([
    [bpmScore, 0.23],
    [energyScore, 0.29],
    [roomScore, 0.2],
    [statusScore, 0.12],
    [profileScore, 0.16]
  ]) * 100);
  const reasons = [
    ...(hasProfileSignal && profileScore > 0.78 ? ["Matches your Sound Profile"] : []),
    bpm ? `${bpm} BPM slot fit` : "BPM inferred from brief",
    energy >= preferred.energy ? "Enough pressure for this slot" : "Controlled energy for this slot",
    preferred.copy
  ];

  return {
    fit,
    reasons: reasons.slice(0, 3),
    slotLabel: preferred.label
  };
}

export function recommendMomentsForSlot(
  moments: SignalMomentLike[],
  slotType: EventLineupSlotType,
  limit = 3,
  intent: SignalIntent = {}
): Array<{ moment: SignalMomentLike; signal: MomentSlotSignal }> {
  return moments
    .map((moment) => ({ moment, signal: scoreMomentForSlot(moment, slotType, intent) }))
    .sort((a, b) => b.signal.fit - a.signal.fit)
    .slice(0, limit);
}

function hasSignalWordOverlap(signal: TrackSignalScore, words: Set<string>) {
  if (words.size === 0) {
    return signal.soundMatch >= 68;
  }

  return [...signal.tags, ...signal.soundDna, ...signal.roomFit]
    .flatMap((value) => value.toLowerCase().split(/[\s/,.]+/))
    .some((value) => words.has(value));
}

function getGenreScore(text: string, genres: string[] = []) {
  if (genres.length === 0) {
    return 0.72;
  }

  return genres.some((genre) => text.includes(genre.toLowerCase())) ? 1 : 0.42;
}

function getTopValues(values: Array<string | number | null | undefined>, limit: number) {
  const counts = values.reduce<Record<string, number>>((acc, value) => {
    const normalized = String(value ?? "")
      .split(/[,/]/)
      .map((part) => part.trim())
      .filter(Boolean);

    normalized.forEach((item) => {
      const key = item.toLowerCase();
      acc[key] = (acc[key] ?? 0) + 1;
    });
    return acc;
  }, {});

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value]) => value);
}

function getPaddedRange(values: number[], padding: number): [number, number] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return [Math.max(60, min - padding), Math.min(220, max + padding)];
}

function getMomentGenreHint(moment: SignalMomentLike) {
  return normalizeText([moment.trackTitle, moment.momentLabel, moment.roomType]).match(/techno|house|rap|acid|industrial|hypnotic|groove/)?.[0] ?? null;
}

function parseMomentEnergy(energy?: string | number | null, label?: string | null) {
  if (typeof energy === "number" && Number.isFinite(energy)) {
    return Math.max(1, Math.min(10, energy));
  }

  const numeric = parseBpm(energy);
  if (numeric) {
    return Math.max(1, Math.min(10, numeric));
  }

  const text = normalizeText([energy, label]);
  if (text.includes("peak") || text.includes("high")) {
    return 8.8;
  }
  if (text.includes("warm") || text.includes("intro")) {
    return 5.2;
  }
  if (text.includes("closing")) {
    return 7.1;
  }

  return 6.6;
}

function getSlotPreference(slotType: EventLineupSlotType) {
  const map: Record<EventLineupSlotType, { bpmRange: [number, number]; copy: string; energy: number; keywords: string[]; label: string }> = {
    closing: {
      bpmRange: [122, 142],
      copy: "Closing needs pressure with enough control to land the room.",
      energy: 7.3,
      keywords: ["closing", "hypnotic", "pressure", "basement"],
      label: "Closing signal"
    },
    opening: {
      bpmRange: [112, 130],
      copy: "Opening favors warm tension and room control.",
      energy: 5.1,
      keywords: ["intro", "warm", "deep", "open"],
      label: "Opening signal"
    },
    peak: {
      bpmRange: [128, 150],
      copy: "Peak slot favors maximum room-fit and bookable pressure.",
      energy: 8.8,
      keywords: ["peak", "warehouse", "industrial", "hard"],
      label: "Peak signal"
    },
    stream: {
      bpmRange: [118, 146],
      copy: "Stream slot favors identifiable sound identity and broadcast energy.",
      energy: 7.6,
      keywords: ["live", "stream", "hypnotic", "groove"],
      label: "Stream signal"
    },
    support: {
      bpmRange: [120, 138],
      copy: "Support should raise tension without exhausting the peak.",
      energy: 6.8,
      keywords: ["build", "groove", "support", "tension"],
      label: "Support signal"
    }
  };

  return map[slotType];
}

function getBpmScore(bpm: number | null, range?: [number, number] | null) {
  if (!bpm) {
    return range ? 0.45 : 0.68;
  }

  if (!range) {
    return 0.76;
  }

  const [min, max] = range;
  if (bpm >= min && bpm <= max) {
    return 1;
  }

  const distance = bpm < min ? min - bpm : bpm - max;
  return Math.max(0.25, 1 - distance / 24);
}

function getRoomFitScore(
  text: string,
  roomTypes: string[] = [],
  features?: Pick<TrackAudioFeature, "room_fit"> | null
) {
  return getRoomFitScoreWithFeatures(text, roomTypes, features);
}

function getRoomFitScoreWithFeatures(
  text: string,
  roomTypes: string[] = [],
  features?: Pick<TrackAudioFeature, "room_fit"> | null
) {
  if (features?.room_fit?.length) {
    return getFeatureRoomScore(features, roomTypes);
  }

  if (roomTypes.length === 0) {
    return text.includes("warehouse") || text.includes("basement") ? 0.82 : 0.64;
  }

  const matches = roomTypes.filter((roomType) =>
    (roomTypeKeywords[roomType.toLowerCase()] ?? [roomType.toLowerCase()]).some((keyword) => text.includes(keyword))
  ).length;
  return matches > 0 ? Math.min(1, 0.72 + matches * 0.18) : 0.38;
}

function getBehaviorScore(trackId: string, intent: SignalIntent) {
  if (intent.savedMomentTrackIds?.includes(trackId)) {
    return 1;
  }

  if (intent.playlistTrackIds?.includes(trackId)) {
    return 0.92;
  }

  if (intent.savedTrackIds?.includes(trackId)) {
    return 0.86;
  }

  return 0.42;
}

function getSaveIntentScore(trackId: string, intent: SignalIntent) {
  let score = 0.34;
  if (intent.savedTrackIds?.includes(trackId)) {
    score += 0.28;
  }
  if (intent.playlistTrackIds?.includes(trackId)) {
    score += 0.24;
  }
  if (intent.savedMomentTrackIds?.includes(trackId)) {
    score += 0.18;
  }
  return Math.min(1, score);
}

function getPopularityScore(work: Pick<Work, "like_count" | "play_count">) {
  const plays = Math.log10(Math.max(1, work.play_count ?? 0) + 1) / 5;
  const likes = Math.log10(Math.max(1, work.like_count ?? 0) + 1) / 4;
  return Math.max(0.28, Math.min(1, plays * 0.58 + likes * 0.42));
}

function getSlotFitScore({
  bpm,
  energy,
  features,
  intent,
  text
}: {
  bpm: number | null;
  energy: number;
  features: Pick<TrackAudioFeature, "room_fit" | "sound_dna">;
  intent: SignalIntent;
  text: string;
}) {
  if (!intent.slotType) {
    return intent.roomTypes?.length ? getRoomFitScore(text, intent.roomTypes, features) : 0.68;
  }

  const preferred = getSlotPreference(intent.slotType);
  const bpmScore = getBpmScore(bpm, preferred.bpmRange);
  const energyScore = Math.max(0.25, 1 - Math.abs(energy - preferred.energy) / 5);
  const roomText = normalizeText([text, ...(features.room_fit ?? []), ...(features.sound_dna ?? [])]);
  const keywordScore = preferred.keywords.some((keyword) => roomText.includes(keyword)) ? 1 : 0.52;

  return weightedAverage([
    [bpmScore, 0.3],
    [energyScore, 0.36],
    [keywordScore, 0.34]
  ]);
}

function getBookingTrustScore(
  dj?: Pick<DjProfile, "city" | "country" | "genres" | "is_available" | "price" | "profile_theme" | "stage_name"> | null,
  intent: SignalIntent = {}
) {
  if (!dj) {
    return 0.44;
  }

  let score = 0.58;
  if (dj.is_available) {
    score += 0.18;
  }
  if (Number(dj.price) > 0) {
    score += 0.08;
  }
  if (intent.city && normalizeText([dj.city, dj.country]).includes(intent.city.toLowerCase())) {
    score += 0.1;
  }
  if (dj.profile_theme || dj.genres) {
    score += 0.06;
  }

  return Math.min(1, score);
}

function getFeeFitScore(price: number | null, feeBand?: string | null) {
  if (!feeBand || !price) {
    return 0.72;
  }

  if (feeBand === "Under 500") {
    return price < 500 ? 1 : 0.35;
  }
  if (feeBand === "500-1000") {
    return price >= 500 && price <= 1000 ? 1 : 0.45;
  }
  if (feeBand === "1000+") {
    return price >= 1000 ? 1 : 0.5;
  }

  return 0.72;
}

function getCityFitScore(
  dj?: Pick<DjProfile, "city" | "country" | "genres" | "is_available" | "price" | "profile_theme" | "stage_name"> | null,
  city?: string | null
) {
  if (!city) {
    return 0.7;
  }

  return normalizeText([dj?.city, dj?.country]).includes(city.toLowerCase()) ? 1 : 0.38;
}

function inferEnergy({
  bpm,
  text,
  work
}: {
  bpm: number | null;
  text: string;
  work: Pick<Work, "like_count" | "play_count">;
}) {
  let energy = 5.2;
  if (bpm) {
    energy += Math.min(2.2, Math.max(0, (bpm - 118) / 16));
  }
  if (text.includes("hard") || text.includes("industrial") || text.includes("peak")) {
    energy += 1.1;
  }
  if (text.includes("deep") || text.includes("lounge") || text.includes("warmup")) {
    energy -= 0.7;
  }
  if ((work.play_count ?? 0) > 10000) {
    energy += 0.4;
  }
  if ((work.like_count ?? 0) > 500) {
    energy += 0.3;
  }

  return Math.max(1, Math.min(10, energy));
}

function getFeatureNumber(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildListenerSignalReasons({
  behavior,
  bpm,
  bpmScore,
  features,
  genreScore,
  listenerFit,
  popularity,
  saveIntent
}: {
  behavior: number;
  bpm: number | null;
  bpmScore: number;
  features?: Pick<TrackAudioFeature, "confidence" | "room_fit" | "sound_dna"> | null;
  genreScore: number;
  listenerFit: number;
  popularity: number;
  saveIntent: number;
}) {
  const reasons: string[] = [];
  if (genreScore > 0.9) {
    reasons.push("Matches your listening taste");
  }
  if (bpm && bpmScore > 0.9) {
    reasons.push(`${bpm} BPM fits your current tempo zone`);
  }
  if (behavior > 0.8 || saveIntent > 0.7) {
    reasons.push("Close to your saved tracks, moments or playlists");
  }
  if (popularity > 0.58) {
    reasons.push("Strong listener response signal");
  }
  if ((features?.confidence ?? 0) >= 0.6 && features?.sound_dna?.length) {
    reasons.push(`Sound DNA: ${features.sound_dna.slice(0, 2).join(" / ")}`);
  }

  return reasons.length > 0 ? reasons.slice(0, 3) : [`${formatSignalScore(listenerFit * 100)} listener taste match`];
}

function buildOrganizerSignalReasons({
  bpm,
  bookingFit,
  features,
  intent,
  roomFit,
  slotFit,
  trust
}: {
  bpm: number | null;
  bookingFit: number;
  features?: Pick<TrackAudioFeature, "confidence" | "room_fit" | "sound_dna"> | null;
  intent: SignalIntent;
  roomFit: number;
  slotFit: number;
  trust: number;
}) {
  const reasons: string[] = [];
  if (intent.slotType && slotFit > 0.75) {
    reasons.push(`Fits ${getSlotPreference(intent.slotType).label.replace(" signal", "")} programming`);
  }
  if (bpm && intent.bpmRange && getBpmScore(bpm, intent.bpmRange) > 0.9) {
    reasons.push(`${bpm} BPM fits the event range`);
  }
  if (roomFit > 0.8) {
    reasons.push("Strong room-fit for the event context");
  }
  if (trust > 0.74 || bookingFit > 0.78) {
    reasons.push("Booking-ready artist signal");
  }
  if ((features?.confidence ?? 0) >= 0.6 && features?.sound_dna?.length) {
    reasons.push(`Briefable Sound DNA: ${features.sound_dna.slice(0, 2).join(" / ")}`);
  }

  return reasons.length > 0 ? reasons.slice(0, 3) : ["Balanced event fit from audio, room and artist signals"];
}

function buildSignalTags({
  bpm,
  energy,
  features,
  text
}: {
  bpm: number | null;
  energy: number;
  features?: Pick<TrackAudioFeature, "energy" | "room_fit" | "sound_dna"> | null;
  text: string;
}) {
  const tags = new Set<string>();
  if (bpm) {
    tags.add(`${bpm} BPM`);
  }
  getFeatureTags(features ?? { energy, room_fit: [], sound_dna: [] }, 3).forEach((tag) => tags.add(tag));
  if (energy >= 8) {
    tags.add("High energy");
  } else if (energy <= 5) {
    tags.add("Warmup fit");
  } else {
    tags.add("Balanced pressure");
  }
  if (text.includes("warehouse") || text.includes("industrial")) {
    tags.add("Warehouse fit");
  }
  if (text.includes("hypnotic")) {
    tags.add("Hypnotic");
  }

  return Array.from(tags).slice(0, 4);
}

function normalizeText(parts: Array<string | number | null | undefined>) {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function weightedAverage(entries: Array<[number, number]>) {
  const weight = entries.reduce((sum, [, entryWeight]) => sum + entryWeight, 0);
  if (weight <= 0) {
    return 0;
  }

  return entries.reduce((sum, [value, entryWeight]) => sum + value * entryWeight, 0) / weight;
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}
