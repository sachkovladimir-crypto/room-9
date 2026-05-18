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

export async function extractWaveformPeaks(src: string, length = 128) {
  if (typeof window === "undefined" || !src) {
    return createFallbackWaveform(length, src);
  }

  const AudioContextConstructor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextConstructor) {
    return createFallbackWaveform(length, src);
  }

  try {
    const response = await fetch(src);
    const arrayBuffer = await response.arrayBuffer();
    const audioContext = new AudioContextConstructor();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    await audioContext.close();

    const channel = audioBuffer.getChannelData(0);
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
  } catch {
    return createFallbackWaveform(length, src);
  }
}
