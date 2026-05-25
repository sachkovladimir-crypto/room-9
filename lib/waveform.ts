export function createFallbackWaveform(length = 128, seed = "room9") {
  const seedValue = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0) || 9;

  return Array.from({ length }, (_, index) => {
    const position = index / Math.max(1, length - 1);
    const build = position > 0.2 && position < 0.42 ? 0.25 : 0;
    const peak = position > 0.42 && position < 0.62 ? 0.52 : 0;
    const closing = position > 0.68 && position < 0.88 ? 0.18 : 0;
    const noise =
      Math.sin(index * 0.91 + seedValue) * 0.11 +
      Math.sin(index * 2.17 + seedValue * 0.1) * 0.07 +
      ((index * seedValue) % 11) / 110;

    return Math.max(0.08, Math.min(1, 0.18 + build + peak + closing + noise));
  });
}

export type AudioFingerprint = {
  bpmConfidence: number;
  beatGridPreview: number[];
  durationSeconds: number | null;
  estimatedBpm: number | null;
  eqProfile: {
    air: number;
    low: number;
    mid: number;
    presence: number;
    sub: number;
  };
  metrics: {
    darkness: number;
    density: number;
    energy: number;
    groove: number;
    intensity: number;
    vocalPresence: number;
  };
  roomFit: string[];
  soundDna: string[];
  source: "decoded-audio" | "fallback";
  waveformPeaks: number[];
};

export async function extractWaveformPeaks(src: string, length = 128) {
  const fingerprint = await extractAudioFingerprint(src, length);
  return fingerprint.waveformPeaks;
}

export async function extractAudioFingerprint(src: string, length = 156): Promise<AudioFingerprint> {
  if (typeof window === "undefined" || !src) {
    return createFallbackAudioFingerprint(length, src);
  }

  const AudioContextConstructor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextConstructor) {
    return createFallbackAudioFingerprint(length, src);
  }

  try {
    const response = await fetch(src);
    const arrayBuffer = await response.arrayBuffer();
    const audioContext = new AudioContextConstructor();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    await audioContext.close();

    const channel = audioBuffer.getChannelData(0);
    const waveformPeaks = buildWaveformPeaks(channel, length);
    const envelope = buildEnergyEnvelope(channel, audioBuffer.sampleRate);
    const tempo = estimateTempo(envelope, audioBuffer.sampleRate);
    const eqProfile = estimateEqProfile(channel, audioBuffer.sampleRate);
    const metrics = estimateAudioMetrics({ envelope, eqProfile, waveformPeaks });
    const roomFit = inferRoomFitFromFingerprint({ estimatedBpm: tempo.bpm, metrics });
    const soundDna = inferSoundDnaFromFingerprint({ eqProfile, estimatedBpm: tempo.bpm, metrics, roomFit });

    return {
      beatGridPreview: buildBeatGridPreview(tempo.bpm, audioBuffer.duration),
      bpmConfidence: tempo.confidence,
      durationSeconds: Math.max(1, Math.round(audioBuffer.duration)),
      eqProfile,
      estimatedBpm: tempo.bpm,
      metrics,
      roomFit,
      soundDna,
      source: "decoded-audio",
      waveformPeaks
    };
  } catch {
    return createFallbackAudioFingerprint(length, src);
  }
}

function createFallbackAudioFingerprint(length: number, seed: string): AudioFingerprint {
  const waveformPeaks = createFallbackWaveform(length, seed);
  return {
    beatGridPreview: [],
    bpmConfidence: 0.34,
    durationSeconds: null,
    eqProfile: {
      air: 4.8,
      low: 6.2,
      mid: 5.2,
      presence: 5.6,
      sub: 6.8
    },
    estimatedBpm: null,
    metrics: {
      darkness: 6.2,
      density: 6.1,
      energy: 6.8,
      groove: 5.8,
      intensity: 6.6,
      vocalPresence: 2.4
    },
    roomFit: ["warehouse", "basement club"],
    soundDna: ["raw", "hypnotic", "pressure"],
    source: "fallback",
    waveformPeaks
  };
}

function buildWaveformPeaks(channel: Float32Array, length: number) {
  const samplesPerPeak = Math.max(1, Math.floor(channel.length / length));
  const peaks = Array.from({ length }, (_, peakIndex) => {
    const start = peakIndex * samplesPerPeak;
    const end = Math.min(channel.length, start + samplesPerPeak);
    let sum = 0;
    let max = 0;

    for (let index = start; index < end; index += 1) {
      const value = Math.abs(channel[index] ?? 0);
      sum += value * value;
      if (value > max) {
        max = value;
      }
    }

    const rms = Math.sqrt(sum / Math.max(1, end - start));
    return Math.max(rms, max * 0.72);
  });

  const maxPeak = Math.max(...peaks, 0.01);
  return peaks.map((peak) => Math.max(0.04, Math.min(1, peak / maxPeak)));
}

function buildEnergyEnvelope(channel: Float32Array, sampleRate: number) {
  const windowSize = Math.max(256, Math.round(sampleRate * 0.046));
  const hopSize = Math.max(128, Math.round(windowSize / 2));
  const values: number[] = [];

  for (let start = 0; start < channel.length; start += hopSize) {
    const end = Math.min(channel.length, start + windowSize);
    let sum = 0;
    for (let index = start; index < end; index += 1) {
      const value = channel[index] ?? 0;
      sum += value * value;
    }
    values.push(Math.sqrt(sum / Math.max(1, end - start)));
  }

  const max = Math.max(...values, 0.0001);
  return values.map((value) => value / max);
}

function estimateTempo(envelope: number[], sampleRate: number) {
  if (envelope.length < 32) {
    return { bpm: null, confidence: 0 };
  }

  const hopSeconds = Math.max(0.01, Math.round(sampleRate * 0.046) / 2 / sampleRate);
  const minBpm = 80;
  const maxBpm = 180;
  let bestBpm: number | null = null;
  let bestScore = 0;
  let totalScore = 0;

  for (let bpm = minBpm; bpm <= maxBpm; bpm += 1) {
    const lag = Math.round((60 / bpm) / hopSeconds);
    if (lag < 2 || lag >= envelope.length) {
      continue;
    }

    let score = 0;
    for (let index = lag; index < envelope.length; index += 1) {
      score += envelope[index] * envelope[index - lag];
    }

    totalScore += score;
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }

  const normalizedConfidence = totalScore > 0 ? Math.min(0.96, Math.max(0.18, bestScore / (totalScore / 18))) : 0.18;
  return { bpm: bestBpm, confidence: Math.round(normalizedConfidence * 100) / 100 };
}

function estimateEqProfile(channel: Float32Array, sampleRate: number) {
  const bands = [
    ["sub", 55],
    ["low", 160],
    ["mid", 900],
    ["presence", 3800],
    ["air", 9000]
  ] as const;
  const totals: Record<(typeof bands)[number][0], number> = {
    air: 0,
    low: 0,
    mid: 0,
    presence: 0,
    sub: 0
  };
  const windowSize = 2048;
  const windows = 28;
  const step = Math.max(windowSize, Math.floor((channel.length - windowSize) / Math.max(1, windows)));

  for (let start = 0; start < channel.length - windowSize; start += step) {
    for (const [band, frequency] of bands) {
      totals[band] += goertzelMagnitude(channel, start, windowSize, sampleRate, frequency);
    }
  }

  const max = Math.max(...Object.values(totals), 0.0001);
  return {
    air: scaleBand(totals.air, max),
    low: scaleBand(totals.low, max),
    mid: scaleBand(totals.mid, max),
    presence: scaleBand(totals.presence, max),
    sub: scaleBand(totals.sub, max)
  };
}

function goertzelMagnitude(channel: Float32Array, start: number, size: number, sampleRate: number, frequency: number) {
  const normalizedFrequency = frequency / sampleRate;
  const coefficient = 2 * Math.cos(2 * Math.PI * normalizedFrequency);
  let q0 = 0;
  let q1 = 0;
  let q2 = 0;

  for (let index = 0; index < size; index += 1) {
    q0 = coefficient * q1 - q2 + (channel[start + index] ?? 0);
    q2 = q1;
    q1 = q0;
  }

  return Math.sqrt(q1 * q1 + q2 * q2 - q1 * q2 * coefficient);
}

function estimateAudioMetrics({
  envelope,
  eqProfile,
  waveformPeaks
}: {
  envelope: number[];
  eqProfile: AudioFingerprint["eqProfile"];
  waveformPeaks: number[];
}): AudioFingerprint["metrics"] {
  const energy = roundOne(clampTen(average(waveformPeaks) * 11.5));
  const density = roundOne(clampTen(waveformPeaks.filter((peak) => peak > 0.42).length / Math.max(1, waveformPeaks.length) * 10));
  const groove = roundOne(clampTen(getPulseStability(envelope) * 10));
  const darkness = roundOne(clampTen(4 + (eqProfile.sub + eqProfile.low - eqProfile.air) / 3));
  const intensity = roundOne(clampTen(energy * 0.52 + density * 0.25 + eqProfile.presence * 0.23));
  const vocalPresence = roundOne(clampTen(eqProfile.presence * 0.62 + eqProfile.mid * 0.22 - eqProfile.sub * 0.12));

  return { darkness, density, energy, groove, intensity, vocalPresence };
}

function inferRoomFitFromFingerprint({
  estimatedBpm,
  metrics
}: {
  estimatedBpm: number | null;
  metrics: AudioFingerprint["metrics"];
}) {
  const rooms = new Set<string>();
  if (metrics.energy >= 7.2 || (estimatedBpm ?? 0) >= 134) {
    rooms.add("warehouse");
  }
  if (metrics.darkness >= 6.5) {
    rooms.add("basement club");
  }
  if (metrics.groove >= 6.6 && metrics.energy < 8.4) {
    rooms.add("open air");
  }
  if (rooms.size === 0) {
    rooms.add(metrics.energy >= 6 ? "main room" : "listening room");
  }
  return Array.from(rooms);
}

function inferSoundDnaFromFingerprint({
  eqProfile,
  estimatedBpm,
  metrics,
  roomFit
}: {
  eqProfile: AudioFingerprint["eqProfile"];
  estimatedBpm: number | null;
  metrics: AudioFingerprint["metrics"];
  roomFit: string[];
}) {
  const dna = new Set<string>();
  if (metrics.darkness >= 6.4) dna.add("dark");
  if (metrics.energy >= 7.6) dna.add("peak pressure");
  if (metrics.groove >= 6.8) dna.add("groove");
  if (eqProfile.presence >= 6.8) dna.add("driving");
  if (eqProfile.sub >= 7) dna.add("heavy low-end");
  if ((estimatedBpm ?? 0) >= 136) dna.add("fast pressure");
  roomFit.forEach((room) => dna.add(room));
  return Array.from(dna).slice(0, 8);
}

function buildBeatGridPreview(bpm: number | null, durationSeconds: number) {
  if (!bpm || !Number.isFinite(durationSeconds)) {
    return [];
  }

  const beatSeconds = 60 / bpm;
  const preview: number[] = [];
  for (let second = 0; second < durationSeconds && preview.length < 96; second += beatSeconds * 4) {
    preview.push(Math.round(second * 10) / 10);
  }
  return preview;
}

function getPulseStability(envelope: number[]) {
  if (envelope.length < 4) {
    return 0.5;
  }

  const deltas = envelope.slice(1).map((value, index) => Math.abs(value - envelope[index]));
  const pulse = average(deltas);
  return Math.max(0.28, Math.min(0.94, pulse * 1.8));
}

function scaleBand(value: number, max: number) {
  return roundOne(Math.max(1, Math.min(10, 2 + (value / max) * 8)));
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampTen(value: number) {
  return Math.max(0, Math.min(10, value));
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}
