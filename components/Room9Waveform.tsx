import { cx } from "@/components/room9-ui";

export function Room9Waveform({
  active = false,
  barCount = 72,
  className,
  markerLabel,
  peaks,
  progressRatio = null,
  reactive = false,
  seed,
  selectedRatio = 0.58
}: {
  active?: boolean;
  barCount?: number;
  className?: string;
  markerLabel?: string;
  peaks?: number[] | null;
  progressRatio?: number | null;
  reactive?: boolean;
  seed: string;
  selectedRatio?: number;
}) {
  const safeRatio = Math.max(0, Math.min(1, selectedRatio));
  const safeProgressRatio =
    progressRatio === null || !Number.isFinite(progressRatio) ? null : Math.max(0, Math.min(1, progressRatio));
  const numericSeed = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) || 17;
  const normalizedPeaks = getWaveformPeaks({ barCount, numericSeed, peaks });
  const selectedIndex = Math.round(safeRatio * (normalizedPeaks.length - 1));
  const progressIndex =
    safeProgressRatio === null ? null : Math.round(safeProgressRatio * (normalizedPeaks.length - 1));

  return (
    <div
      className={cx(
        "relative flex h-10 items-end gap-[3px] border-b border-roomBorder bg-voidBlack px-2 pb-1",
        reactive && active && "room-waveform-reactive",
        className
      )}
    >
      {markerLabel ? (
        <span
          className="room-one-line absolute bottom-full mb-1 max-w-[14rem] -translate-x-1/2 whitespace-nowrap bg-acidGreen px-2 py-1 font-mono text-[9px] font-black uppercase text-black"
          style={{ left: `min(max(3.5rem, ${safeRatio * 100}%), calc(100% - 3.5rem))` }}
        >
          {markerLabel}
        </span>
      ) : null}
      {normalizedPeaks.map((peak, index) => {
        const distance = Math.abs(index - selectedIndex);
        const height = `${14 + Math.round(peak * 78)}%`;
        const selected = distance <= 1;
        const played = progressIndex === null ? index <= selectedIndex : index <= progressIndex;

        return (
          <span
            aria-hidden="true"
            className={cx(
              "w-[2px] shrink-0 transition-[background-color,transform] duration-300 will-change-transform",
              selected ? "bg-acidGreen" : active && played ? "bg-acidGreen" : played ? "bg-paperWhite" : "bg-strongBorder"
            )}
            key={index}
            style={{
              animationDelay: `${-((index % 17) * 0.055)}s`,
              height,
              minHeight: 6
            }}
          />
        );
      })}
    </div>
  );
}

function getWaveformPeaks({
  barCount,
  numericSeed,
  peaks
}: {
  barCount: number;
  numericSeed: number;
  peaks?: number[] | null;
}) {
  const cleanPeaks = Array.isArray(peaks)
    ? peaks
        .map((peak) => Number(peak))
        .filter((peak) => Number.isFinite(peak))
        .map((peak) => Math.max(0, Math.min(1, peak)))
    : [];

  if (cleanPeaks.length > 0) {
    return resamplePeaks(cleanPeaks, barCount);
  }

  return Array.from({ length: barCount }, (_, index) => {
    const synthetic =
      0.16 +
      Math.abs(Math.sin(index * 0.53 + numericSeed)) * 0.44 +
      Math.abs(Math.sin(index * 0.17 + numericSeed * 0.3)) * 0.4;
    return Math.max(0.14, Math.min(1, synthetic));
  });
}

function resamplePeaks(peaks: number[], targetCount: number) {
  if (peaks.length === targetCount) {
    return peaks;
  }

  return Array.from({ length: targetCount }, (_, index) => {
    const sourceIndex = Math.round((index / Math.max(1, targetCount - 1)) * (peaks.length - 1));
    return peaks[sourceIndex] ?? 0.2;
  });
}
