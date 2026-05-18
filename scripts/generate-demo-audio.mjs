import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SAMPLE_RATE = 4000;
const OUT_DIR = join(process.cwd(), "public", "demo-audio");

const tracks = [
  { file: "moncler.wav", seed: "moncler", duration: 174 },
  { file: "industrial-complex.wav", seed: "industrial-complex", duration: 402 },
  { file: "berlin-warehouse.wav", seed: "berlin-warehouse", duration: 322 },
  { file: "acid-phase.wav", seed: "acid-phase", duration: 435 }
];

mkdirSync(OUT_DIR, { recursive: true });

for (const track of tracks) {
  writeFileSync(join(OUT_DIR, track.file), createDemoWav(track.duration, track.seed));
  console.log(`Generated ${track.file}`);
}

function createDemoWav(durationSeconds, seedText) {
  const sampleCount = durationSeconds * SAMPLE_RATE;
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  const seed = Array.from(seedText).reduce((sum, char) => sum + char.charCodeAt(0), 0) || 9;

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  const baseFreq = 42 + (seed % 34);
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / SAMPLE_RATE;
    const progress = time / durationSeconds;
    const step = (time * 2) % 1;
    const kick = Math.sin(2 * Math.PI * baseFreq * time) * Math.exp(-step * 8);
    const pulse = Math.sin(2 * Math.PI * (baseFreq * 0.5) * time) * 0.12;
    const hat = Math.sin(2 * Math.PI * (baseFreq * 9.5) * time) * 0.045;
    const build = progress > 0.25 && progress < 0.62 ? 0.34 : 0.14;
    const peak = progress > 0.48 && progress < 0.62 ? 0.46 : 0;
    const tail = progress > 0.82 ? 0.55 : 1;
    const sample = Math.max(-1, Math.min(1, (kick * (build + peak) + pulse + hat) * tail));
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + index * 2);
  }

  return buffer;
}
