import { StatusBadge, cx } from "@/components/room9-ui";

export type AudioAnalysisStatusValue = "pending" | "analyzing" | "complete" | "failed";

const statusCopy: Record<AudioAnalysisStatusValue, { helper: string; label: string; variant: string }> = {
  analyzing: {
    helper: "Server analysis is reading waveform, metadata, tempo and energy profile.",
    label: "Analyzing",
    variant: "current"
  },
  complete: {
    helper: "Feature row is ready for Signal Engine, Track Page and Event Desk.",
    label: "Complete",
    variant: "complete"
  },
  failed: {
    helper: "Retry from Music Lab. Large or unsupported files can fall back to metadata.",
    label: "Failed",
    variant: "blocked"
  },
  pending: {
    helper: "Run analysis after upload to generate BPM, cue evidence and Sound DNA.",
    label: "Pending",
    variant: "pending"
  }
};

export function AudioAnalysisStatus({
  analyzedAt,
  className,
  error,
  source,
  status
}: {
  analyzedAt?: string | null;
  className?: string;
  error?: string | null;
  source?: string | null;
  status: AudioAnalysisStatusValue;
}) {
  const copy = statusCopy[status];

  return (
    <div className={cx("border border-roomBorder bg-voidBlack p-room-2", className)}>
      <div className="flex min-w-0 items-center justify-between gap-room-2">
        <span className="room-label text-mutedText">Audio analysis</span>
        <StatusBadge status={copy.variant}>{copy.label}</StatusBadge>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-mutedText">{copy.helper}</p>
      {source ? <p className="room-one-line mt-2 font-mono text-[10px] uppercase text-mutedText">Decoder {source}</p> : null}
      {error ? <p className="mt-2 text-xs leading-relaxed text-errorRed">{error}</p> : null}
      {analyzedAt ? (
        <p className="room-one-line mt-2 font-mono text-[10px] uppercase text-mutedText">Analyzed {new Date(analyzedAt).toLocaleString()}</p>
      ) : null}
    </div>
  );
}
