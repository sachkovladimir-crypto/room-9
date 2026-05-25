import { parseBpm } from "@/lib/signalEngine";
import { deriveTrackAudioFeatures } from "@/lib/trackAudioFeatures";
import type { DjProfile, TrackAudioFeature, Work } from "@/lib/types";

export type AudioIntelligenceFeature = Pick<
  TrackAudioFeature,
  "bpm" | "confidence" | "density" | "energy" | "groove" | "intensity" | "room_fit" | "sound_dna" | "waveform_profile"
>;

export type EventSlotFit = {
  fit: number;
  reasons: string[];
  slot: "Opening" | "Support" | "Peak" | "Closing" | "Stream";
};

export type AudioIntelligenceModel = {
  bestSlot: EventSlotFit;
  bpm: number | null;
  bpmConfidence: number;
  djReadout: string;
  energyBand: "warmup" | "building" | "peak" | "closing-pressure";
  eventSlotFit: EventSlotFit[];
  keySignals: string[];
  organizerBrief: string;
  promoterReadout: string;
  setRole: string;
  soundDna: string[];
  roomFit: string[];
  structure: {
    beatGridPreview: number[];
    closingSeconds: number;
    introSeconds: number;
    peakSeconds: number;
  };
  transitionProfile: {
    compatibleBpmRange: [number, number] | null;
    mixIn: string;
    mixOut: string;
    risk: "low" | "medium" | "high";
  };
};

export type AudioSimilarityResult = {
  reasons: string[];
  score: number;
  target: Work;
  targetModel: AudioIntelligenceModel;
};

type AudioModelInput = {
  dj?: DjProfile | null;
  feature?: AudioIntelligenceFeature | null;
  work: Work;
};

export function buildAudioIntelligenceModel({ dj, feature, work }: AudioModelInput): AudioIntelligenceModel {
  const derived = deriveTrackAudioFeatures(work, dj);
  const merged = feature ?? derived;
  const bpm = parseBpm(merged.bpm ?? work.bpm ?? dj?.bpm_range ?? null);
  const energy = getNumber(merged.energy) ?? derived.energy ?? 6;
  const density = getNumber(merged.density) ?? derived.density ?? 5;
  const groove = getNumber(merged.groove) ?? derived.groove ?? 5;
  const intensity = getNumber(merged.intensity) ?? derived.intensity ?? 5;
  const soundDna = uniqueStrings([...(merged.sound_dna ?? []), ...(derived.sound_dna ?? [])]).slice(0, 8);
  const roomFit = uniqueStrings([...(merged.room_fit ?? []), ...(derived.room_fit ?? [])]).slice(0, 5);
  const duration = work.duration_seconds ?? readProfileNumber(merged.waveform_profile, "durationSeconds") ?? 360;
  const energyBand = getEnergyBand({ bpm, energy, intensity });
  const eventSlotFit = buildEventSlotFit({ bpm, density, energy, energyBand, groove, roomFit, soundDna });
  const bestSlot = eventSlotFit[0];
  const setRole = getSetRole({ bestSlot, bpm, energyBand, roomFit, soundDna });
  const transitionProfile = getTransitionProfile({ bpm, density, energy, groove });
  const keySignals = buildKeySignals({ bestSlot, bpm, energy, groove, roomFit, soundDna, transitionProfile });
  const structure = {
    beatGridPreview: readBeatGrid(merged.waveform_profile),
    closingSeconds: Math.round(duration * 0.82),
    introSeconds: 0,
    peakSeconds: Math.round(duration * getPeakRatio(energyBand))
  };

  return {
    bestSlot,
    bpm,
    bpmConfidence: getNumber(merged.confidence) ?? readProfileNumber(merged.waveform_profile, "bpmConfidence") ?? 0.54,
    djReadout: buildDjReadout({ bpm, setRole, transitionProfile }),
    energyBand,
    eventSlotFit,
    keySignals,
    organizerBrief: buildOrganizerBrief({ bestSlot, bpm, energyBand, roomFit, setRole, soundDna, work }),
    promoterReadout: buildPromoterReadout({ bestSlot, bpm, energyBand, roomFit, setRole }),
    roomFit,
    setRole,
    soundDna,
    structure,
    transitionProfile
  };
}

export function compareAudioIntelligence(source: AudioIntelligenceModel, target: AudioIntelligenceModel) {
  const bpmScore = getBpmCompatibility(source.bpm, target.bpm);
  const dnaScore = getOverlapScore(source.soundDna, target.soundDna);
  const roomScore = getOverlapScore(source.roomFit, target.roomFit);
  const slotScore = source.bestSlot.slot === target.bestSlot.slot ? 1 : 0.62;
  const transitionScore = source.transitionProfile.risk === "low" && target.transitionProfile.risk === "low" ? 0.92 : 0.66;
  const score = Math.round(
    (bpmScore * 0.28 + dnaScore * 0.22 + roomScore * 0.2 + slotScore * 0.18 + transitionScore * 0.12) * 100
  );
  const reasons = [
    bpmScore > 0.75 ? "tempo-compatible" : "tempo needs adjustment",
    dnaScore > 0.55 ? "shared Sound DNA" : "different sound identity",
    roomScore > 0.55 ? "same room logic" : "different room fit",
    source.bestSlot.slot === target.bestSlot.slot ? `same ${source.bestSlot.slot} role` : "different set role"
  ];

  return { reasons, score };
}

export function rankSimilarAudioTracks({
  djLookup = {},
  featureLookup = {},
  limit = 4,
  source,
  works
}: {
  djLookup?: Record<string, DjProfile | undefined>;
  featureLookup?: Record<string, AudioIntelligenceFeature | undefined>;
  limit?: number;
  source: Work;
  works: Work[];
}) {
  const sourceModel = buildAudioIntelligenceModel({
    dj: djLookup[source.dj_id],
    feature: featureLookup[source.id],
    work: source
  });

  return works
    .filter((work) => work.id !== source.id)
    .map<AudioSimilarityResult>((target) => {
      const targetModel = buildAudioIntelligenceModel({
        dj: djLookup[target.dj_id],
        feature: featureLookup[target.id],
        work: target
      });
      const comparison = compareAudioIntelligence(sourceModel, targetModel);
      return {
        reasons: comparison.reasons,
        score: comparison.score,
        target,
        targetModel
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function buildEventSlotFit({
  bpm,
  density,
  energy,
  energyBand,
  groove,
  roomFit,
  soundDna
}: {
  bpm: number | null;
  density: number;
  energy: number;
  energyBand: AudioIntelligenceModel["energyBand"];
  groove: number;
  roomFit: string[];
  soundDna: string[];
}) {
  const has = (value: string) => [...roomFit, ...soundDna].some((item) => item.includes(value));
  const slots: EventSlotFit[] = [
    {
      fit: scoreSlot([10 - energy, groove, bpm && bpm < 124 ? 2 : 0]),
      reasons: ["controlled entry", "low pressure", "first-room calibration"],
      slot: "Opening"
    },
    {
      fit: scoreSlot([groove, 10 - Math.abs(energy - 6.5), density]),
      reasons: ["keeps movement", "supports main act", "does not overtake the night"],
      slot: "Support"
    },
    {
      fit: scoreSlot([energy, density, bpm && bpm >= 128 ? 2 : 0, has("warehouse") ? 1.4 : 0]),
      reasons: ["high intent moment", "main-room pressure", "strong booking reference"],
      slot: "Peak"
    },
    {
      fit: scoreSlot([energyBand === "closing-pressure" ? 9 : energy * 0.8, has("hypnotic") ? 2 : 0, density]),
      reasons: ["late-night control", "longer pressure curve", "works after peak hour"],
      slot: "Closing"
    },
    {
      fit: scoreSlot([groove, 10 - Math.abs(energy - 6), has("open air") ? 1.6 : 0]),
      reasons: ["stream-safe pacing", "readable online energy", "works without room pressure"],
      slot: "Stream"
    }
  ];

  return slots.sort((a, b) => b.fit - a.fit);
}

function getEnergyBand({
  bpm,
  energy,
  intensity
}: {
  bpm: number | null;
  energy: number;
  intensity: number;
}): AudioIntelligenceModel["energyBand"] {
  if (energy >= 8.2 || intensity >= 8.4 || (bpm ?? 0) >= 140) return "peak";
  if (energy >= 7.1 || intensity >= 7.2) return "closing-pressure";
  if (energy >= 5.6) return "building";
  return "warmup";
}

function getSetRole({
  bestSlot,
  bpm,
  energyBand,
  roomFit,
  soundDna
}: {
  bestSlot: EventSlotFit;
  bpm: number | null;
  energyBand: AudioIntelligenceModel["energyBand"];
  roomFit: string[];
  soundDna: string[];
}) {
  if (bestSlot.slot === "Peak" && energyBand === "peak") return "Peak weapon";
  if (bestSlot.slot === "Closing") return "Closing pressure";
  if (bestSlot.slot === "Opening") return "Opening control";
  if (roomFit.some((room) => room.includes("open air"))) return "Open-air bridge";
  if ((bpm ?? 0) >= 132 && soundDna.some((tag) => tag.includes("groove"))) return "Main-room bridge";
  return `${bestSlot.slot} tool`;
}

function getTransitionProfile({
  bpm,
  density,
  energy,
  groove
}: {
  bpm: number | null;
  density: number;
  energy: number;
  groove: number;
}) {
  const compatibleBpmRange: [number, number] | null = bpm ? [Math.max(70, Math.round(bpm - 4)), Math.min(190, Math.round(bpm + 4))] : null;
  const risk = energy >= 8.8 || density >= 8.5 ? "medium" : groove >= 6.2 ? "low" : "high";
  return {
    compatibleBpmRange,
    mixIn: groove >= 6 ? "16-32 bar blend" : "short cue-in",
    mixOut: energy >= 8 ? "drop-to-drop or pressure hold" : "standard phrase exit",
    risk
  } as const;
}

function buildKeySignals({
  bestSlot,
  bpm,
  energy,
  groove,
  roomFit,
  soundDna,
  transitionProfile
}: {
  bestSlot: EventSlotFit;
  bpm: number | null;
  energy: number;
  groove: number;
  roomFit: string[];
  soundDna: string[];
  transitionProfile: AudioIntelligenceModel["transitionProfile"];
}) {
  return uniqueStrings([
    bpm ? `${Math.round(bpm)} BPM lock` : "tempo pending",
    `${bestSlot.slot} slot fit`,
    energy >= 8 ? "high-pressure moment" : groove >= 7 ? "groove-led" : "controlled energy",
    transitionProfile.risk === "low" ? "low transition risk" : `${transitionProfile.risk} transition risk`,
    ...roomFit.slice(0, 2),
    ...soundDna.slice(0, 2)
  ]).slice(0, 8);
}

function buildOrganizerBrief({
  bestSlot,
  bpm,
  energyBand,
  roomFit,
  setRole,
  soundDna,
  work
}: {
  bestSlot: EventSlotFit;
  bpm: number | null;
  energyBand: AudioIntelligenceModel["energyBand"];
  roomFit: string[];
  setRole: string;
  soundDna: string[];
  work: Work;
}) {
  const room = roomFit[0] ?? "room";
  const dna = soundDna.slice(0, 2).join(" / ") || "defined sound";
  return `${work.title || "This track"} reads as a ${setRole.toLowerCase()} for ${bestSlot.slot.toLowerCase()} programming: ${energyBand.replace("-", " ")}, ${bpm ? `${Math.round(bpm)} BPM, ` : ""}${room} fit, ${dna}.`;
}

function buildPromoterReadout({
  bestSlot,
  bpm,
  energyBand,
  roomFit,
  setRole
}: {
  bestSlot: EventSlotFit;
  bpm: number | null;
  energyBand: AudioIntelligenceModel["energyBand"];
  roomFit: string[];
  setRole: string;
}) {
  return `${setRole}. Best used around ${bestSlot.slot.toLowerCase()} time for ${roomFit[0] ?? "matching rooms"}${bpm ? ` near ${Math.round(bpm)} BPM` : ""}. Energy curve: ${energyBand.replace("-", " ")}.`;
}

function buildDjReadout({
  bpm,
  setRole,
  transitionProfile
}: {
  bpm: number | null;
  setRole: string;
  transitionProfile: AudioIntelligenceModel["transitionProfile"];
}) {
  const tempo = transitionProfile.compatibleBpmRange
    ? `${transitionProfile.compatibleBpmRange[0]}-${transitionProfile.compatibleBpmRange[1]} BPM`
    : bpm
      ? `${Math.round(bpm)} BPM`
      : "BPM pending";
  return `${setRole}. Mix range ${tempo}; ${transitionProfile.mixIn}; ${transitionProfile.mixOut}.`;
}

function getPeakRatio(energyBand: AudioIntelligenceModel["energyBand"]) {
  if (energyBand === "peak") return 0.58;
  if (energyBand === "closing-pressure") return 0.68;
  if (energyBand === "building") return 0.52;
  return 0.42;
}

function getBpmCompatibility(source: number | null, target: number | null) {
  if (!source || !target) return 0.56;
  const diff = Math.abs(source - target);
  if (diff <= 2) return 1;
  if (diff <= 5) return 0.86;
  if (diff <= 9) return 0.66;
  return 0.34;
}

function getOverlapScore(source: string[], target: string[]) {
  if (source.length === 0 || target.length === 0) return 0.45;
  const targetSet = new Set(target.map((item) => item.toLowerCase()));
  const matches = source.filter((item) => targetSet.has(item.toLowerCase())).length;
  return Math.min(1, 0.34 + matches / Math.max(source.length, target.length));
}

function scoreSlot(values: Array<number | null | false>) {
  const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return Math.round(Math.max(0, Math.min(100, (usable.reduce((sum, value) => sum + value, 0) / Math.max(1, usable.length)) * 10)));
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readProfileNumber(profile: unknown, key: string) {
  if (!profile || typeof profile !== "object") return null;
  const value = (profile as Record<string, unknown>)[key];
  return getNumber(value);
}

function readBeatGrid(profile: unknown) {
  if (!profile || typeof profile !== "object") return [];
  const value = (profile as Record<string, unknown>).beatGridPreview;
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number").slice(0, 96) : [];
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return values
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value))
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}
