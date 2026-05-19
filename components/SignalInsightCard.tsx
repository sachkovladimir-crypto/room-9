import Link from "next/link";
import type { ReactNode } from "react";
import { formatSignalScore, type TrackSignalScore } from "@/lib/signalEngine";
import { ButtonLink, Panel, StatusBadge, cx } from "@/components/room9-ui";

type SignalInsightCardProps = {
  action?: ReactNode;
  className?: string;
  compact?: boolean;
  href?: string;
  label?: string;
  signal: TrackSignalScore;
  subtitle?: string;
  title?: string;
};

export function SignalInsightCard({
  action,
  className,
  compact = false,
  href,
  label = "Signal Engine",
  signal,
  subtitle,
  title = "Recommended Signal"
}: SignalInsightCardProps) {
  const content = (
    <Panel className={cx("min-w-0 overflow-hidden p-4", compact ? "space-y-3" : "space-y-4", className)}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="room-tiny text-acidGreen">{label}</p>
          <h3 className="room-clamp-2 mt-2 font-display text-xl uppercase leading-none text-paperWhite">
            {title}
          </h3>
          {subtitle ? <p className="room-clamp-2 mt-2 text-xs leading-5 text-mutedText">{subtitle}</p> : null}
        </div>
        <StatusBadge status="selected">{formatSignalScore(signal.soundMatch)}</StatusBadge>
      </div>

      <div className="grid grid-cols-3 gap-px bg-roomBorder">
        <SignalMetric label="Sound" value={formatSignalScore(signal.soundMatch)} />
        <SignalMetric label="Booking" value={formatSignalScore(signal.bookingFit)} />
        <SignalMetric label="Energy" value={String(signal.energy)} />
      </div>

      <div className="space-y-2">
        {signal.reasons.slice(0, compact ? 2 : 3).map((reason, index) => (
          <p className="room-clamp-2 border border-roomBorder bg-black p-2 text-xs leading-5 text-mutedText" key={`${reason}-${index}`}>
            {reason}
          </p>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {[...signal.tags, ...signal.soundDna, ...signal.roomFit].slice(0, compact ? 4 : 7).map((tag, index) => (
          <span className="room-one-line max-w-full border border-roomBorder px-2 py-1 font-mono text-[9px] uppercase text-ash" key={`${tag}-${index}`}>
            {tag}
          </span>
        ))}
      </div>

      {action ? <div>{action}</div> : null}
    </Panel>
  );

  if (!href) {
    return content;
  }

  return (
    <Link className="block transition hover:border-paperWhite" href={href}>
      {content}
    </Link>
  );
}

export function SignalActionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <ButtonLink className="w-full" href={href} size="sm" variant="secondary">
      {children}
    </ButtonLink>
  );
}

function SignalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-panelBlack p-3">
      <p className="room-one-line font-mono text-[9px] uppercase text-mutedText">{label}</p>
      <p className="room-one-line mt-2 font-display text-lg uppercase leading-none text-paperWhite">{value}</p>
    </div>
  );
}
