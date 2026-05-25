import { extractAudioFingerprint, type AudioFingerprint } from "@/lib/waveform";

export type RawAudioAnalysis = {
  analysisMode?: "browser" | "server" | "metadata";
  beatGrid: number[];
  bpm: number | null;
  bpmConfidence: number;
  danceability: number;
  decoder?: "browser-web-audio" | "metadata-fallback" | "mp3-wasm" | "wav-pcm" | string;
  dropTimestamps: number[];
  dynamicRange?: number;
  durationSeconds: number | null;
  eqProfile: AudioFingerprint["eqProfile"];
  energyProfile?: number[];
  estimatedBpm: number | null;
  key: string | null;
  metrics: AudioFingerprint["metrics"];
  peakSegment?: number | null;
  rmsEnergy: number;
  roomFit: string[];
  soundDna: string[];
  source: AudioFingerprint["source"];
  spectralCentroid: number;
  waveformPeaks: number[];
};

export async function analyzeAudioSource(src: string, length = 156): Promise<RawAudioAnalysis> {
  const fingerprint = await extractAudioFingerprint(src, length);
  return rawAnalysisFromFingerprint(fingerprint);
}

export function rawAnalysisFromFingerprint(fingerprint: AudioFingerprint): RawAudioAnalysis {
  return {
    analysisMode: fingerprint.source === "decoded-audio" ? "browser" : "metadata",
    beatGrid: fingerprint.beatGridPreview,
    bpm: fingerprint.estimatedBpm,
    bpmConfidence: fingerprint.bpmConfidence,
    danceability: estimateDanceability(fingerprint),
    decoder: fingerprint.source === "decoded-audio" ? "browser-web-audio" : "metadata-fallback",
    dropTimestamps: detectDropTimestamps(fingerprint),
    durationSeconds: fingerprint.durationSeconds,
    eqProfile: fingerprint.eqProfile,
    estimatedBpm: fingerprint.estimatedBpm,
    key: estimateMusicalKey(fingerprint),
    metrics: fingerprint.metrics,
    rmsEnergy: Math.round((fingerprint.metrics.energy / 10) * 1000) / 1000,
    roomFit: fingerprint.roomFit,
    soundDna: fingerprint.soundDna,
    source: fingerprint.source,
    spectralCentroid: estimateSpectralCentroid(fingerprint.eqProfile),
    waveformPeaks: fingerprint.waveformPeaks
  };
}

function detectDropTimestamps(fingerprint: AudioFingerprint) {
  const { durationSeconds, waveformPeaks } = fingerprint;
  if (!durationSeconds || waveformPeaks.length < 12) {
    return [];
  }

  const threshold = Math.max(0.68, average(waveformPeaks) + 0.18);
  const minDistance = Math.max(4, durationSeconds * 0.08);
  const drops: number[] = [];

  waveformPeaks.forEach((peak, index) => {
    const previous = waveformPeaks[index - 1] ?? peak;
    const next = waveformPeaks[index + 1] ?? peak;
    const isLocalPeak = peak >= previous && peak >= next && peak >= threshold;
    const timestamp = Math.round((index / Math.max(1, waveformPeaks.length - 1)) * durationSeconds);
    const farEnough = drops.every((drop) => Math.abs(drop - timestamp) >= minDistance);

    if (isLocalPeak && farEnough) {
      drops.push(timestamp);
    }
  });

  return drops.slice(0, 5);
}

function estimateDanceability(fingerprint: AudioFingerprint) {
  const bpm = fingerprint.estimatedBpm ?? 124;
  const tempoFit = 1 - Math.min(1, Math.abs(bpm - 128) / 42);
  const groove = fingerprint.metrics.groove / 10;
  const density = fingerprint.metrics.density / 10;
  const beatConfidence = fingerprint.bpmConfidence;
  return roundUnit(tempoFit * 0.28 + groove * 0.34 + density * 0.18 + beatConfidence * 0.2);
}

function estimateSpectralCentroid(eqProfile: AudioFingerprint["eqProfile"]) {
  const bands = [
    [55, eqProfile.sub],
    [160, eqProfile.low],
    [900, eqProfile.mid],
    [3800, eqProfile.presence],
    [9000, eqProfile.air]
  ];
  const total = bands.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) {
    return 0;
  }

  const centroid = bands.reduce((sum, [frequency, value]) => sum + frequency * value, 0) / total;
  return Math.round(centroid);
}

function estimateMusicalKey(fingerprint: AudioFingerprint) {
  const { darkness, groove, vocalPresence } = fingerprint.metrics;
  const { air, low, mid, presence, sub } = fingerprint.eqProfile;
  const minor = darkness + sub + low >= groove + air + presence;
  const rootIndex = Math.abs(Math.round((sub * 3 + low * 5 + mid * 7 + presence * 11 + vocalPresence) % 12));
  const roots = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${roots[rootIndex]}${minor ? "m" : ""}`;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function roundUnit(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}
