import type { RawAudioAnalysis } from "@/lib/audioAnalyzer";
import type { TrackAudioFeature, Work } from "@/lib/types";

export type AudioInterpreterMetadata = {
  artist?: string | null;
  genre?: string | null;
  title?: string | null;
};

export type TrackAudioFeatureDraft = Omit<TrackAudioFeature, "created_at" | "id" | "updated_at"> & {
  id?: string;
};

export function interpretRawAudioAnalysis({
  metadata = {},
  raw,
  workId
}: {
  metadata?: AudioInterpreterMetadata;
  raw: RawAudioAnalysis;
  workId: string;
}): TrackAudioFeatureDraft {
  const energy = clampMetric(raw.metrics.energy);
  const darkness = clampMetric(raw.metrics.darkness);
  const groove = clampMetric(raw.metrics.groove);
  const density = clampMetric(raw.metrics.density);
  const intensity = clampMetric(raw.metrics.intensity);
  const roomFit = uniqueStrings([...raw.roomFit, ...inferRoomFit(raw)]);
  const soundDna = uniqueStrings([...raw.soundDna, ...inferSoundDna(raw, metadata)]).slice(0, 8);

  return {
    analyzed_at: null,
    analysis_error: null,
    analysis_requested_at: null,
    analysis_status: raw.source === "fallback" ? "pending" : "complete",
    bpm: raw.bpm,
    confidence: getInterpreterConfidence(raw),
    darkness,
    density,
    energy,
    groove,
    intensity,
    moment_types: inferMomentTypes(raw),
    room_fit: roomFit,
    sound_dna: soundDna,
    source: raw.source === "fallback" ? "metadata" : "audio-analysis",
    vocal_presence: clampMetric(raw.metrics.vocalPresence),
    waveform_profile: {
      audio_analysis: raw,
      beatGridPreview: raw.beatGrid,
      dropTimestamps: raw.dropTimestamps,
      interpreter: "deterministic-room9-v1",
      key: raw.key,
      spectralCentroid: raw.spectralCentroid,
      summary: buildAnalysisSummary(raw, metadata)
    },
    work_id: workId
  };
}

export function buildAnthropicMusicPrompt(raw: RawAudioAnalysis, metadata: AudioInterpreterMetadata = {}) {
  return `You are a music curator AI for ROOM_9, a DJ discovery and booking platform.
Return JSON only. Do not include markdown.

Track metadata:
Title: ${metadata.title ?? "Unknown"}
Artist: ${metadata.artist ?? "Unknown"}
Genre: ${metadata.genre ?? "Unknown"}

Audio features:
BPM: ${raw.bpm ?? "unknown"}
BPM confidence: ${raw.bpmConfidence}
Key: ${raw.key ?? "unknown"}
Spectral centroid: ${raw.spectralCentroid}
RMS energy: ${raw.rmsEnergy}
Drop timestamps: ${raw.dropTimestamps.join(", ") || "none"}
Danceability: ${raw.danceability}
EQ profile: ${JSON.stringify(raw.eqProfile)}
Metrics: ${JSON.stringify(raw.metrics)}

Return exactly:
{
  "energy": 1-10,
  "room_fit": ["warehouse"|"basement club"|"open air"|"main room"|"listening room"],
  "sound_dna": ["up to 4 concise descriptors"],
  "confidence": 0-1,
  "slot_fit": "opening"|"support"|"peak"|"closing"|"stream",
  "dj_note": "one sentence a DJ understands",
  "organizer_note": "one sentence a promoter understands"
}`;
}

export function parseTrackFeatureJson(jsonText: string) {
  const parsed = JSON.parse(jsonText) as {
    confidence?: number;
    energy?: number;
    room_fit?: string[];
    slot_fit?: string;
    sound_dna?: string[];
  };

  return {
    confidence: typeof parsed.confidence === "number" ? clampUnit(parsed.confidence) : null,
    energy: typeof parsed.energy === "number" ? clampMetric(parsed.energy) : null,
    momentTypes: parsed.slot_fit ? [parsed.slot_fit] : [],
    roomFit: Array.isArray(parsed.room_fit) ? parsed.room_fit.filter(Boolean) : [],
    soundDna: Array.isArray(parsed.sound_dna) ? parsed.sound_dna.filter(Boolean).slice(0, 8) : []
  };
}

export function getTrackMetadata(work: Pick<Work, "genre" | "title">, artist?: string | null): AudioInterpreterMetadata {
  return {
    artist,
    genre: work.genre,
    title: work.title
  };
}

function inferRoomFit(raw: RawAudioAnalysis) {
  const rooms = new Set<string>();
  if (raw.metrics.energy >= 7.6 || raw.metrics.intensity >= 7.8 || (raw.bpm ?? 0) >= 134) {
    rooms.add("warehouse");
    rooms.add("main room");
  }
  if (raw.metrics.darkness >= 6.4 || raw.eqProfile.sub >= 6.8) {
    rooms.add("basement club");
  }
  if (raw.metrics.groove >= 7.2 && raw.spectralCentroid >= 2100) {
    rooms.add("open air");
  }
  if (rooms.size === 0) {
    rooms.add("listening room");
  }
  return Array.from(rooms);
}

function inferSoundDna(raw: RawAudioAnalysis, metadata: AudioInterpreterMetadata) {
  const tags = new Set<string>();
  const text = `${metadata.title ?? ""} ${metadata.genre ?? ""}`.toLowerCase();

  if (raw.metrics.darkness >= 6.5) tags.add("dark");
  if (raw.metrics.groove >= 6.7) tags.add("groove");
  if (raw.eqProfile.sub >= 6.8 || raw.eqProfile.low >= 6.7) tags.add("heavy low-end");
  if (raw.eqProfile.presence >= 6.8 || raw.spectralCentroid >= 2600) tags.add("bright pressure");
  if (raw.dropTimestamps.length > 0) tags.add("drop-ready");
  if ((raw.bpm ?? 0) >= 136) tags.add("fast pressure");
  if (raw.danceability >= 0.68) tags.add("dancefloor");
  if (text.includes("acid")) tags.add("acid");
  if (text.includes("industrial")) tags.add("industrial");
  if (text.includes("rap")) tags.add("rap");
  if (text.includes("techno")) tags.add("techno");

  return Array.from(tags);
}

function inferMomentTypes(raw: RawAudioAnalysis) {
  const moments = new Set<string>(["intro", "build"]);
  if (raw.metrics.energy >= 7.2 || raw.dropTimestamps.length > 0) {
    moments.add("peak");
  }
  if (raw.metrics.darkness >= 6.4 || raw.metrics.density >= 6.8) {
    moments.add("closing");
  }
  return Array.from(moments);
}

function buildAnalysisSummary(raw: RawAudioAnalysis, metadata: AudioInterpreterMetadata) {
  const bpm = raw.bpm ? `${Math.round(raw.bpm)} BPM` : "unknown tempo";
  const title = metadata.title ?? "This track";
  const room = inferRoomFit(raw)[0] ?? "listening room";
  const key = raw.key ? ` in ${raw.key}` : "";
  return `${title} reads as ${bpm}${key}, with ${raw.metrics.energy}/10 energy and strongest fit for ${room}.`;
}

function getInterpreterConfidence(raw: RawAudioAnalysis) {
  const sourceBoost = raw.source === "decoded-audio" ? 0.18 : 0;
  const dropBoost = raw.dropTimestamps.length > 0 ? 0.05 : 0;
  const confidence = raw.bpmConfidence * 0.55 + raw.danceability * 0.22 + sourceBoost + dropBoost;
  return clampUnit(confidence);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)));
}

function clampMetric(value: number) {
  return Math.round(Math.max(0, Math.min(10, value)) * 10) / 10;
}

function clampUnit(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}
