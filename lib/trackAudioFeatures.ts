import type { DjProfile, TrackAudioFeature, Work } from "@/lib/types";

export type TrackAudioFeatureInput = Pick<Work, "bpm" | "description" | "genre" | "id" | "title"> &
  Partial<Pick<Work, "duration_seconds" | "waveform_peaks">>;

export type DerivedTrackAudioFeature = Omit<
  TrackAudioFeature,
  "created_at" | "id" | "updated_at" | "work_id"
> & {
  work_id: string;
};

const dnaKeywords = [
  "acid",
  "ambient",
  "breaks",
  "deep",
  "distorted",
  "driving",
  "groove",
  "hard",
  "hypnotic",
  "industrial",
  "raw",
  "rap",
  "techno",
  "warehouse"
];

export function deriveTrackAudioFeatures(
  work: TrackAudioFeatureInput,
  dj?: Pick<DjProfile, "bpm_range" | "genres" | "profile_theme"> | null
): DerivedTrackAudioFeature {
  const bpm = parseBpm(work.bpm ?? dj?.bpm_range ?? null);
  const text = normalizeText([work.title, work.description, work.genre, work.bpm, dj?.genres, dj?.profile_theme]);
  const waveform = normalizeWaveform(work.waveform_peaks);
  const waveformEnergy = waveform.length > 0 ? average(waveform) * 10 : null;
  const waveformDensity = waveform.length > 0 ? getWaveformDensity(waveform) * 10 : null;
  const energy = clampFeature(
    weightedAverage([
      [inferBpmEnergy(bpm), 0.42],
      [keywordScore(text, ["peak", "hard", "industrial", "warehouse", "driving"], 7.8, 0), 0.22],
      [waveformEnergy ?? 6, waveformEnergy ? 0.22 : 0.08],
      [text.includes("warm") || text.includes("deep") ? 4.8 : 6.2, 0.14]
    ])
  );
  const darkness = clampFeature(
    4.8 +
      keywordScore(text, ["dark", "basement", "industrial", "raw", "distorted"], 2.3, 0) -
      keywordScore(text, ["open air", "summer", "warm", "lounge"], 1.4, 0)
  );
  const groove = clampFeature(
    4.6 +
      keywordScore(text, ["groove", "house", "funk", "rap", "breaks"], 2.4, 0) +
      (bpm && bpm >= 118 && bpm <= 138 ? 1.1 : 0)
  );
  const intensity = clampFeature((energy * 0.68 + darkness * 0.22 + (bpm ? Math.min(10, bpm / 15) : 5) * 0.1));
  const density = clampFeature(waveformDensity ?? (text.includes("live") || text.includes("set") ? 7.1 : 5.8));
  const vocalPresence = clampFeature(
    keywordScore(text, ["vocal", "voice", "rap", "mc", "lyrics"], 6.8, text.includes("instrumental") ? 1.6 : 2.4)
  );
  const roomFit = inferRoomFit({ darkness, energy, groove, text });
  const momentTypes = inferMomentTypes({ energy, text });
  const soundDna = inferSoundDna({ bpm, energy, roomFit, text });

  return {
    analyzed_at: null,
    analysis_error: null,
    analysis_requested_at: null,
    analysis_status: waveform.length > 0 ? "complete" : "pending",
    bpm,
    confidence: waveform.length > 0 ? 0.66 : 0.52,
    darkness: roundOne(darkness),
    density: roundOne(density),
    energy: roundOne(energy),
    groove: roundOne(groove),
    intensity: roundOne(intensity),
    moment_types: momentTypes,
    room_fit: roomFit,
    sound_dna: soundDna,
    source: "metadata",
    vocal_presence: roundOne(vocalPresence),
    waveform_profile: {
      average_peak: waveform.length > 0 ? roundOne(average(waveform)) : null,
      density: waveform.length > 0 ? roundOne(getWaveformDensity(waveform)) : null,
      sample_count: waveform.length
    },
    work_id: work.id
  };
}

export function getFeatureTags(feature: Pick<TrackAudioFeature, "energy" | "room_fit" | "sound_dna">, limit = 4) {
  return [
    ...(feature.sound_dna ?? []),
    ...(feature.room_fit ?? []),
    feature.energy && feature.energy >= 8 ? "high energy" : null
  ]
    .filter((value): value is string => Boolean(value))
    .slice(0, limit);
}

export function getFeatureRoomScore(
  feature: Pick<TrackAudioFeature, "room_fit">,
  preferredRoomTypes: string[] = []
) {
  const roomFit = (feature.room_fit ?? []).map((item) => item.toLowerCase());
  if (preferredRoomTypes.length === 0) {
    return roomFit.length > 0 ? 0.78 : 0.62;
  }

  const matches = preferredRoomTypes.filter((room) => roomFit.includes(room.toLowerCase())).length;
  return matches > 0 ? Math.min(1, 0.74 + matches * 0.18) : 0.42;
}

function inferRoomFit({ darkness, energy, groove, text }: { darkness: number; energy: number; groove: number; text: string }) {
  const rooms = new Set<string>();
  if (text.includes("warehouse") || text.includes("industrial") || energy >= 8.1) {
    rooms.add("warehouse");
  }
  if (text.includes("basement") || darkness >= 6.6 || text.includes("hypnotic")) {
    rooms.add("basement club");
  }
  if (text.includes("open air") || groove >= 7.4 || text.includes("festival")) {
    rooms.add("open air");
  }
  if (rooms.size === 0) {
    rooms.add(energy >= 7 ? "main room" : "listening room");
  }

  return Array.from(rooms);
}

function inferMomentTypes({ energy, text }: { energy: number; text: string }) {
  const moments = new Set<string>();
  if (text.includes("intro") || energy <= 5.4) {
    moments.add("intro");
  }
  if (text.includes("build") || (energy > 5.4 && energy < 7.8)) {
    moments.add("build");
  }
  if (text.includes("peak") || energy >= 7.8) {
    moments.add("peak");
  }
  if (text.includes("closing") || text.includes("hypnotic")) {
    moments.add("closing");
  }
  return Array.from(moments);
}

function inferSoundDna({ bpm, energy, roomFit, text }: { bpm: number | null; energy: number; roomFit: string[]; text: string }) {
  const dna = new Set<string>();
  dnaKeywords.forEach((keyword) => {
    if (text.includes(keyword)) {
      dna.add(keyword);
    }
  });
  if (bpm && bpm >= 136) {
    dna.add("fast pressure");
  }
  if (bpm && bpm < 122) {
    dna.add("slow burn");
  }
  if (energy >= 8) {
    dna.add("high energy");
  }
  roomFit.forEach((room) => dna.add(room));
  return Array.from(dna).slice(0, 8);
}

function parseBpm(value?: string | number | null) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const match = String(value ?? "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function inferBpmEnergy(bpm: number | null) {
  if (!bpm) {
    return 6;
  }
  return clampFeature(4.4 + Math.max(0, bpm - 112) / 10);
}

function keywordScore(text: string, keywords: string[], hitValue: number, fallback: number) {
  return keywords.some((keyword) => text.includes(keyword)) ? hitValue : fallback;
}

function normalizeWaveform(peaks?: number[] | null) {
  return (peaks ?? [])
    .filter((peak) => Number.isFinite(peak))
    .map((peak) => Math.max(0, Math.min(1, Number(peak))));
}

function getWaveformDensity(peaks: number[]) {
  if (peaks.length === 0) {
    return 0;
  }
  return peaks.filter((peak) => peak > 0.42).length / peaks.length;
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

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampFeature(value: number) {
  return Math.max(0, Math.min(10, value));
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}
