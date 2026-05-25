import Meyda from "meyda";
import { parseBuffer } from "music-metadata";
import type { RawAudioAnalysis } from "@/lib/audioAnalyzer";
import { createFallbackWaveform } from "@/lib/waveform";

type DecodedPcm = {
  channel: Float32Array;
  decoder: "mp3-wasm" | "wav-pcm";
  durationSeconds: number;
  sampleRate: number;
};

type AnalyzeAudioBufferInput = {
  arrayBuffer: ArrayBuffer;
  fallbackSeed?: string;
  fileName?: string;
  length?: number;
  mimeType?: string | null;
};

const MAX_ANALYSIS_SECONDS = 240;

export async function analyzeAudioBuffer({
  arrayBuffer,
  fallbackSeed = "room9",
  length = 156,
  mimeType
}: AnalyzeAudioBufferInput): Promise<RawAudioAnalysis> {
  const uint8 = new Uint8Array(arrayBuffer);
  const metadata = await parseAudioMetadata(uint8, mimeType);
  const durationFromMetadata = metadata.duration ? Math.round(metadata.duration) : null;
  const tagBpm = typeof metadata.bpm === "number" && Number.isFinite(metadata.bpm) ? metadata.bpm : null;
  const tagKey = metadata.key || null;
  const decoded = decodeWavPcm(uint8, durationFromMetadata) ?? (await decodeMp3Pcm(uint8, durationFromMetadata, mimeType));

  if (!decoded) {
    return buildMetadataFallback({
      bpm: tagBpm,
      durationSeconds: durationFromMetadata,
      fallbackSeed,
      key: tagKey,
      length
    });
  }

  const usable = trimDecodedPcm(decoded);
  const waveformPeaks = buildWaveformPeaks(usable.channel, length);
  const energyProfile = buildEnergyEnvelope(usable.channel, 96);
  const tempo = estimateTempoFromEnvelope(energyProfile, usable.durationSeconds, tagBpm);
  const meydaStats = extractMeydaStats(usable.channel, usable.sampleRate);
  const eqProfile = estimateEqProfileFromStats(meydaStats, energyProfile);
  const metrics = estimateMetrics({ bpm: tempo.bpm, bpmConfidence: tempo.confidence, energyProfile, eqProfile, meydaStats, waveformPeaks });
  const spectralCentroid = Math.round(meydaStats.spectralCentroid);
  const dropTimestamps = detectDropTimestamps(energyProfile, usable.durationSeconds);
  const roomFit = inferRoomFit({ bpm: tempo.bpm, eqProfile, metrics });
  const soundDna = inferSoundDna({ bpm: tempo.bpm, dropTimestamps, eqProfile, metrics, spectralCentroid });
  const rmsEnergy = roundUnit(meydaStats.rms);

  return {
    analysisMode: "server",
    beatGrid: buildBeatGrid(tempo.bpm, usable.durationSeconds),
    bpm: tempo.bpm,
    bpmConfidence: tempo.confidence,
    danceability: estimateDanceability({ bpm: tempo.bpm, confidence: tempo.confidence, metrics }),
    decoder: usable.decoder,
    dropTimestamps,
    dynamicRange: estimateDynamicRange(energyProfile),
    durationSeconds: Math.max(1, Math.round(usable.durationSeconds)),
    energyProfile,
    eqProfile,
    estimatedBpm: tempo.bpm,
    key: tagKey ?? estimateMusicalKey(eqProfile, metrics),
    metrics,
    peakSegment: getPeakSegment(energyProfile, usable.durationSeconds),
    rmsEnergy,
    roomFit,
    soundDna,
    source: "decoded-audio",
    spectralCentroid,
    waveformPeaks
  };
}

async function parseAudioMetadata(uint8: Uint8Array, mimeType?: string | null) {
  try {
    const metadata = await parseBuffer(uint8, mimeType ? { mimeType } : undefined, { duration: true, skipCovers: true });
    return {
      bpm: metadata.common.bpm ?? null,
      duration: metadata.format.duration ?? null,
      key: readMetadataKey(metadata.common.key)
    };
  } catch {
    return {
      bpm: null,
      duration: null,
      key: null
    };
  }
}

function decodeWavPcm(uint8: Uint8Array, durationFallback: number | null): DecodedPcm | null {
  if (readAscii(uint8, 0, 4) !== "RIFF" || readAscii(uint8, 8, 4) !== "WAVE") {
    return null;
  }

  let offset = 12;
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataStart = -1;
  let dataSize = 0;

  while (offset + 8 <= uint8.length) {
    const chunkId = readAscii(uint8, offset, 4);
    const chunkSize = readUint32LE(uint8, offset + 4);
    const nextOffset = offset + 8 + chunkSize + (chunkSize % 2);

    if (chunkId === "fmt ") {
      audioFormat = readUint16LE(uint8, offset + 8);
      channels = readUint16LE(uint8, offset + 10);
      sampleRate = readUint32LE(uint8, offset + 12);
      bitsPerSample = readUint16LE(uint8, offset + 22);
    }

    if (chunkId === "data") {
      dataStart = offset + 8;
      dataSize = chunkSize;
      break;
    }

    offset = nextOffset;
  }

  if (dataStart < 0 || !channels || !sampleRate || !bitsPerSample || (audioFormat !== 1 && audioFormat !== 3)) {
    return null;
  }

  const bytesPerSample = Math.max(1, bitsPerSample / 8);
  const frameSize = bytesPerSample * channels;
  const frameCount = Math.floor(dataSize / frameSize);
  const channel = new Float32Array(frameCount);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const sampleOffset = dataStart + frame * frameSize;
    channel[frame] = readPcmSample(uint8, sampleOffset, bitsPerSample, audioFormat);
  }

  return {
    channel,
    decoder: "wav-pcm",
    durationSeconds: durationFallback ?? frameCount / sampleRate,
    sampleRate
  };
}

async function decodeMp3Pcm(uint8: Uint8Array, durationFallback: number | null, mimeType?: string | null): Promise<DecodedPcm | null> {
  if (!isLikelyMp3(uint8, mimeType)) {
    return null;
  }

  try {
    const { default: decode } = await import("@audio/decode-mp3");
    const decoded = await decode(uint8);
    const channels = decoded.channelData.filter((channel) => channel.length > 0);
    const sampleRate = decoded.sampleRate;

    if (!channels.length || !sampleRate) {
      return null;
    }

    const frameCount = Math.min(...channels.map((channel) => channel.length));
    const maxFrames = Math.min(frameCount, Math.max(1, Math.floor(sampleRate * MAX_ANALYSIS_SECONDS)));
    const channel = new Float32Array(maxFrames);

    for (let frame = 0; frame < maxFrames; frame += 1) {
      let sum = 0;
      for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
        sum += channels[channelIndex][frame] ?? 0;
      }
      channel[frame] = Math.max(-1, Math.min(1, sum / channels.length));
    }

    const fullDuration = frameCount / sampleRate;
    return {
      channel,
      decoder: "mp3-wasm",
      durationSeconds: durationFallback ?? fullDuration,
      sampleRate
    };
  } catch {
    return null;
  }
}

function trimDecodedPcm(decoded: DecodedPcm): DecodedPcm {
  const maxSamples = Math.floor(decoded.sampleRate * MAX_ANALYSIS_SECONDS);
  if (decoded.channel.length <= maxSamples) {
    return decoded;
  }

  return {
    channel: decoded.channel.slice(0, maxSamples),
    decoder: decoded.decoder,
    durationSeconds: Math.min(decoded.durationSeconds, MAX_ANALYSIS_SECONDS),
    sampleRate: decoded.sampleRate
  };
}

function buildMetadataFallback({
  bpm,
  durationSeconds,
  fallbackSeed,
  key,
  length
}: {
  bpm: number | null;
  durationSeconds: number | null;
  fallbackSeed: string;
  key: string | null;
  length: number;
}): RawAudioAnalysis {
  const waveformPeaks = createFallbackWaveform(length, fallbackSeed);
  const energyProfile = buildEnergyEnvelopeFromPeaks(waveformPeaks);
  const metrics = {
    darkness: 6.1,
    density: 5.9,
    energy: 6.2,
    groove: bpm ? 6.4 : 5.4,
    intensity: 6.1,
    vocalPresence: 2.2
  };
  const eqProfile = {
    air: 4.8,
    low: 6.2,
    mid: 5.2,
    presence: 5.6,
    sub: 6.8
  };

  return {
    analysisMode: "metadata",
    beatGrid: buildBeatGrid(bpm, durationSeconds ?? 0),
    bpm,
    bpmConfidence: bpm ? 0.58 : 0.28,
    danceability: bpm ? 0.58 : 0.36,
    decoder: "metadata-fallback",
    dropTimestamps: durationSeconds ? detectDropTimestamps(energyProfile, durationSeconds) : [],
    dynamicRange: estimateDynamicRange(energyProfile),
    durationSeconds,
    energyProfile,
    eqProfile,
    estimatedBpm: bpm,
    key,
    metrics,
    peakSegment: durationSeconds ? getPeakSegment(energyProfile, durationSeconds) : null,
    rmsEnergy: 0.42,
    roomFit: ["warehouse", "basement club"],
    soundDna: ["metadata-derived", "pressure", "needs waveform decode"],
    source: "fallback",
    spectralCentroid: 1450,
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
      max = Math.max(max, value);
    }

    const rms = Math.sqrt(sum / Math.max(1, end - start));
    return Math.max(0.04, Math.min(1, rms * 2.2 + max * 0.38));
  });

  const highest = Math.max(...peaks, 0.01);
  return peaks.map((value) => Math.round((value / highest) * 100) / 100);
}

function buildEnergyEnvelope(channel: Float32Array, length: number) {
  const samplesPerSegment = Math.max(1, Math.floor(channel.length / length));
  const envelope = Array.from({ length }, (_, segmentIndex) => {
    const start = segmentIndex * samplesPerSegment;
    const end = Math.min(channel.length, start + samplesPerSegment);
    let sum = 0;

    for (let index = start; index < end; index += 1) {
      const value = channel[index] ?? 0;
      sum += value * value;
    }

    return Math.sqrt(sum / Math.max(1, end - start));
  });

  const highest = Math.max(...envelope, 0.01);
  return envelope.map((value) => Math.round((value / highest) * 100) / 100);
}

function buildEnergyEnvelopeFromPeaks(peaks: number[]) {
  const highest = Math.max(...peaks, 0.01);
  return peaks.map((value) => Math.round((value / highest) * 100) / 100);
}

function estimateTempoFromEnvelope(envelope: number[], durationSeconds: number, metadataBpm: number | null) {
  if (metadataBpm && metadataBpm >= 60 && metadataBpm <= 210) {
    return {
      bpm: Math.round(metadataBpm * 10) / 10,
      confidence: 0.74
    };
  }

  if (!durationSeconds || envelope.length < 18) {
    return {
      bpm: null,
      confidence: 0.22
    };
  }

  const samplesPerSecond = envelope.length / durationSeconds;
  const centered = envelope.map((value) => value - average(envelope));
  let bestBpm = 124;
  let bestScore = Number.NEGATIVE_INFINITY;
  let secondScore = Number.NEGATIVE_INFINITY;

  for (let bpm = 80; bpm <= 180; bpm += 1) {
    const lag = Math.max(1, Math.round((60 / bpm) * samplesPerSecond));
    let score = 0;
    for (let index = lag; index < centered.length; index += 1) {
      score += centered[index] * centered[index - lag];
    }
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestBpm = bpm;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  const confidence = Math.max(0.32, Math.min(0.92, (bestScore - secondScore) / Math.max(1, Math.abs(bestScore)) + 0.44));
  return {
    bpm: bestBpm,
    confidence: Math.round(confidence * 100) / 100
  };
}

function extractMeydaStats(channel: Float32Array, sampleRate: number) {
  const frameSize = 1024;
  const frames = 32;
  const step = Math.max(frameSize, Math.floor((channel.length - frameSize) / Math.max(1, frames - 1)));
  Meyda.sampleRate = sampleRate;
  Meyda.bufferSize = frameSize;
  const values = {
    rms: [] as number[],
    spectralCentroid: [] as number[],
    zcr: [] as number[]
  };

  for (let offset = 0; offset + frameSize <= channel.length && values.rms.length < frames; offset += step) {
    const frame = channel.slice(offset, offset + frameSize);
    const extracted = Meyda.extract(["rms", "spectralCentroid", "zcr"], frame) as { rms?: number; spectralCentroid?: number; zcr?: number } | null;

    if (extracted) {
      values.rms.push(extracted.rms ?? 0);
      values.spectralCentroid.push(normalizeCentroid(extracted.spectralCentroid ?? 0, sampleRate, frameSize));
      values.zcr.push(extracted.zcr ?? 0);
    }
  }

  return {
    rms: average(values.rms),
    rmsPeak: percentile(values.rms, 0.9),
    spectralCentroid: average(values.spectralCentroid),
    zcr: average(values.zcr)
  };
}

function estimateEqProfileFromStats(
  stats: { rms: number; rmsPeak: number; spectralCentroid: number; zcr: number },
  energyProfile: number[]
) {
  const brightness = Math.max(0, Math.min(1, stats.spectralCentroid / 6500));
  const pressure = Math.max(0, Math.min(1, stats.rmsPeak * 2.4));
  const movement = estimateDynamicRange(energyProfile) / 10;

  return {
    air: roundMetric(3.8 + brightness * 4.8),
    low: roundMetric(4.7 + pressure * 3.4 + (1 - brightness) * 1.1),
    mid: roundMetric(4.8 + movement * 2.2 + brightness * 0.8),
    presence: roundMetric(4.3 + brightness * 3.9 + movement * 0.8),
    sub: roundMetric(5 + pressure * 3.2 + (1 - brightness) * 1.2)
  };
}

function estimateMetrics({
  bpm,
  bpmConfidence,
  energyProfile,
  eqProfile,
  meydaStats,
  waveformPeaks
}: {
  bpm: number | null;
  bpmConfidence: number;
  energyProfile: number[];
  eqProfile: RawAudioAnalysis["eqProfile"];
  meydaStats: { rms: number; rmsPeak: number; spectralCentroid: number; zcr: number };
  waveformPeaks: number[];
}) {
  const avgEnergy = average(energyProfile);
  const peakEnergy = percentile(energyProfile, 0.9);
  const tempoPressure = bpm ? Math.max(0, Math.min(1, (bpm - 95) / 70)) : 0.48;
  const movement = estimateDynamicRange(energyProfile) / 10;
  const brightness = Math.max(0, Math.min(1, meydaStats.spectralCentroid / 6500));

  return {
    darkness: roundMetric(7.4 - brightness * 3.4 + eqProfile.sub * 0.18),
    density: roundMetric(3.9 + avgEnergy * 3.2 + movement * 1.8 + tempoPressure),
    energy: roundMetric(3.6 + peakEnergy * 3.7 + meydaStats.rmsPeak * 2.4),
    groove: roundMetric(3.8 + bpmConfidence * 2.6 + movement * 2.2 + tempoPressure * 1.2),
    intensity: roundMetric(3.4 + peakEnergy * 3.1 + tempoPressure * 1.8 + eqProfile.presence * 0.16),
    vocalPresence: roundMetric(1.2 + Math.min(1, meydaStats.zcr / 90) * 2 + brightness * 1.4 + estimateVariation(waveformPeaks))
  };
}

function inferRoomFit({
  bpm,
  eqProfile,
  metrics
}: {
  bpm: number | null;
  eqProfile: RawAudioAnalysis["eqProfile"];
  metrics: RawAudioAnalysis["metrics"];
}) {
  const rooms = new Set<string>();
  if ((bpm ?? 0) >= 132 || metrics.energy >= 7.2 || metrics.intensity >= 7.3) rooms.add("warehouse");
  if (metrics.darkness >= 6.2 || eqProfile.sub >= 6.8) rooms.add("basement club");
  if (metrics.groove >= 6.8 && eqProfile.air >= 5.4) rooms.add("open air");
  if (metrics.energy >= 7.5 && metrics.density >= 6.2) rooms.add("main room");
  if (rooms.size === 0) rooms.add("listening room");
  return Array.from(rooms);
}

function inferSoundDna({
  bpm,
  dropTimestamps,
  eqProfile,
  metrics,
  spectralCentroid
}: {
  bpm: number | null;
  dropTimestamps: number[];
  eqProfile: RawAudioAnalysis["eqProfile"];
  metrics: RawAudioAnalysis["metrics"];
  spectralCentroid: number;
}) {
  const tags = new Set<string>();
  if (metrics.darkness >= 6.4) tags.add("dark");
  if (metrics.groove >= 6.8) tags.add("groove");
  if (metrics.intensity >= 7) tags.add("pressure");
  if (eqProfile.sub >= 7 || eqProfile.low >= 7) tags.add("heavy low-end");
  if (spectralCentroid >= 2600) tags.add("bright pressure");
  if (dropTimestamps.length > 0) tags.add("drop-ready");
  if ((bpm ?? 0) >= 136) tags.add("fast pressure");
  if (tags.size < 3) tags.add("hypnotic");
  return Array.from(tags);
}

function detectDropTimestamps(envelope: number[], durationSeconds: number) {
  const threshold = Math.max(0.72, average(envelope) + 0.22);
  const minDistance = Math.max(5, durationSeconds * 0.08);
  const drops: number[] = [];

  envelope.forEach((value, index) => {
    const previous = envelope[index - 1] ?? value;
    const next = envelope[index + 1] ?? value;
    const timestamp = Math.round((index / Math.max(1, envelope.length - 1)) * durationSeconds);
    const farEnough = drops.every((drop) => Math.abs(drop - timestamp) >= minDistance);
    if (value >= threshold && value >= previous && value >= next && farEnough) {
      drops.push(timestamp);
    }
  });

  return drops.slice(0, 6);
}

function buildBeatGrid(bpm: number | null, durationSeconds: number) {
  if (!bpm || !durationSeconds) {
    return [];
  }

  const step = 60 / bpm;
  const beats: number[] = [];
  for (let time = 0; time <= durationSeconds && beats.length < 128; time += step) {
    beats.push(Math.round(time * 100) / 100);
  }
  return beats;
}

function estimateDanceability({
  bpm,
  confidence,
  metrics
}: {
  bpm: number | null;
  confidence: number;
  metrics: RawAudioAnalysis["metrics"];
}) {
  const tempoFit = bpm ? 1 - Math.min(1, Math.abs(bpm - 128) / 54) : 0.45;
  return roundUnit(tempoFit * 0.28 + (metrics.groove / 10) * 0.36 + (metrics.density / 10) * 0.18 + confidence * 0.18);
}

function estimateDynamicRange(values: number[]) {
  return roundMetric((percentile(values, 0.92) - percentile(values, 0.18)) * 10);
}

function getPeakSegment(values: number[], durationSeconds: number) {
  const index = values.reduce((bestIndex, value, currentIndex) => (value > values[bestIndex] ? currentIndex : bestIndex), 0);
  return Math.round((index / Math.max(1, values.length - 1)) * durationSeconds);
}

function estimateMusicalKey(eqProfile: RawAudioAnalysis["eqProfile"], metrics: RawAudioAnalysis["metrics"]) {
  const roots = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const rootIndex = Math.abs(Math.round((eqProfile.sub * 3 + eqProfile.low * 5 + eqProfile.mid * 7 + eqProfile.presence * 11) % 12));
  const minor = metrics.darkness + eqProfile.sub >= metrics.groove + eqProfile.air;
  return `${roots[rootIndex]}${minor ? "m" : ""}`;
}

function readPcmSample(uint8: Uint8Array, offset: number, bitsPerSample: number, audioFormat: number) {
  const view = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);
  if (audioFormat === 3 && bitsPerSample === 32) {
    return Math.max(-1, Math.min(1, view.getFloat32(offset, true)));
  }
  if (bitsPerSample === 8) {
    return (uint8[offset] - 128) / 128;
  }
  if (bitsPerSample === 16) {
    return view.getInt16(offset, true) / 32768;
  }
  if (bitsPerSample === 24) {
    const value = (uint8[offset] | (uint8[offset + 1] << 8) | (uint8[offset + 2] << 16));
    const signed = value & 0x800000 ? value | 0xff000000 : value;
    return signed / 8388608;
  }
  if (bitsPerSample === 32) {
    return view.getInt32(offset, true) / 2147483648;
  }
  return 0;
}

function readAscii(uint8: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...uint8.slice(offset, offset + length));
}

function readUint16LE(uint8: Uint8Array, offset: number) {
  return new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength).getUint16(offset, true);
}

function readUint32LE(uint8: Uint8Array, offset: number) {
  return new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength).getUint32(offset, true);
}

function normalizeCentroid(value: number, sampleRate: number, frameSize: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const hz = value <= frameSize ? (value / frameSize) * (sampleRate / 2) : value;
  return Math.min(sampleRate / 2, hz);
}

function readMetadataKey(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function isLikelyMp3(uint8: Uint8Array, mimeType?: string | null) {
  const normalizedMime = mimeType?.toLowerCase() ?? "";
  if (normalizedMime.includes("mpeg") || normalizedMime.includes("mp3")) {
    return true;
  }

  const hasId3 = readAscii(uint8, 0, 3) === "ID3";
  const hasFrameSync = uint8.length > 2 && uint8[0] === 0xff && (uint8[1] & 0xe0) === 0xe0;
  return hasId3 || hasFrameSync;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)))] ?? 0;
}

function estimateVariation(values: number[]) {
  const avg = average(values);
  return Math.min(2.4, average(values.map((value) => Math.abs(value - avg))) * 4);
}

function roundMetric(value: number) {
  return Math.round(Math.max(0, Math.min(10, value)) * 10) / 10;
}

function roundUnit(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}
