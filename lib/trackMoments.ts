export type TrackMomentId = "intro" | "build" | "peak" | "closing";

export type TrackMoment = {
  id: TrackMomentId;
  label: string;
  ratio: number;
  seconds: number;
  timestamp: string;
  timestampKnown: boolean;
  energy: string;
  roomType: string;
  soundDna: string;
  description: string;
};

export type TrackMomentOverride = Partial<
  Pick<TrackMoment, "description" | "energy" | "label" | "roomType" | "soundDna">
> & {
  id: TrackMomentId;
  seconds?: number | null;
};

const momentProfiles: Record<
  TrackMomentId,
  {
    label: string;
    ratio: number;
    energy: string;
    roomType: string;
    soundDna: string;
    description: string;
  }
> = {
  intro: {
    label: "Intro",
    ratio: 0,
    energy: "4.8/10",
    roomType: "Opening room / Low ceiling",
    soundDna: "Atmospheric / Pressure / Minimal",
    description:
      "Atmospheric pressure build. Useful when an organizer wants a slow entry into a darker room."
  },
  build: {
    label: "Build",
    ratio: 0.25,
    energy: "7.2/10",
    roomType: "Club room / Late warmup",
    soundDna: "Percussive / Tension / Hypnotic",
    description:
      "Percussion enters and the tension rises. This moment shows how the set moves bodies without rushing the floor."
  },
  peak: {
    label: "Peak Moment",
    ratio: 0.61,
    energy: "9.4/10",
    roomType: "Warehouse / Basement",
    soundDna: "Industrial / Hypnotic / Hard Groove",
    description:
      "This is the strongest atmosphere reference. Use it as a brief for the live set so the room energy is precise, not vaguely described."
  },
  closing: {
    label: "Closing",
    ratio: 0.82,
    energy: "6.3/10",
    roomType: "Transition / After-hours",
    soundDna: "Release / Metallic / Rolling",
    description: "Pressure releases into a transition. Best for proving that the DJ can hand over the floor cleanly."
  }
};

export function normalizeTrackDuration(value?: number | null) {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return null;
  }

  return Math.max(1, Math.round(value));
}

export function formatTrackTime(value?: number | null) {
  const seconds = normalizeTrackDuration(value) ?? 0;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function clampTrackTimestamp(value: number, durationSeconds?: number | null) {
  const rounded = Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
  const duration = normalizeTrackDuration(durationSeconds);

  if (!duration) {
    return rounded;
  }

  return Math.min(rounded, duration);
}

export function getTrackMoments(durationSeconds?: number | null, overrides: TrackMomentOverride[] = []) {
  const duration = normalizeTrackDuration(durationSeconds);
  const timestampKnown = Boolean(duration);

  return (Object.keys(momentProfiles) as TrackMomentId[]).map((id) => {
    const profile = momentProfiles[id];
    const override = overrides.find((item) => item.id === id);
    const seconds = duration
      ? clampTrackTimestamp(override?.seconds ?? duration * profile.ratio, duration)
      : clampTrackTimestamp(override?.seconds ?? 0, null);

    return {
      id,
      label: override?.label || profile.label,
      ratio: profile.ratio,
      seconds,
      timestamp: formatTrackTime(seconds),
      timestampKnown,
      energy: override?.energy || profile.energy,
      roomType: override?.roomType || profile.roomType,
      soundDna: override?.soundDna || profile.soundDna,
      description: override?.description || profile.description
    };
  });
}

export function getPrimaryTrackMoment(durationSeconds?: number | null) {
  return getTrackMoments(durationSeconds).find((moment) => moment.id === "peak") ?? getTrackMoments(durationSeconds)[0];
}

export function getMomentDisplayLabel(moment: TrackMoment) {
  return moment.timestampKnown ? `${moment.timestamp} ${moment.label.replace(" Moment", "")}` : moment.label;
}

export function getMomentOverridesFromWaveformProfile(profile: unknown): TrackMomentOverride[] {
  if (!profile || typeof profile !== "object") {
    return [];
  }

  const cues = (profile as { lab_cues?: unknown }).lab_cues;
  if (!Array.isArray(cues)) {
    return [];
  }

  const overrides: TrackMomentOverride[] = [];

  cues.forEach((cue) => {
    if (!cue || typeof cue !== "object") {
      return;
    }

    const item = cue as Record<string, unknown>;
    const id = item.id;
    if (id !== "intro" && id !== "build" && id !== "peak" && id !== "closing") {
      return;
    }

    const seconds = Number(item.seconds);
    overrides.push({
        id,
        description: typeof item.description === "string" ? item.description : undefined,
        energy: typeof item.energy === "string" ? item.energy : undefined,
        label: typeof item.label === "string" ? item.label : undefined,
        roomType: typeof item.roomType === "string" ? item.roomType : undefined,
        seconds: Number.isFinite(seconds) ? seconds : null,
        soundDna: typeof item.soundDna === "string" ? item.soundDna : undefined
    });
  });

  return overrides;
}
