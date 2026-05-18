"use client";

import Link from "next/link";
import {
  ButtonLink,
  MetricCard,
  Panel,
  SectionHeader,
  StatusBadge,
  TrackRow,
  type TrackDisplay,
  Text,
  cx
} from "@/components/room9-ui";
import { formatDate, formatPrice } from "@/lib/format";
import { getWorkCoverUrl } from "@/lib/media";
import { getMomentDisplayLabel, getPrimaryTrackMoment } from "@/lib/trackMoments";
import { hasRoleAccess, type Booking, type DjProfile, type EventPost, type Profile, type Role, type Work } from "@/lib/types";

export type WorkspaceAnalytics = {
  profileViews: number;
  trackPlays: number;
  uploadedTracks: number;
  savedCount: number;
  acceptedBookings: number;
};

type WorkspaceHeaderProps = {
  role: Profile["role"];
  title: string;
  subtitle: string;
  pendingCount: number;
  verifiedLabel?: string;
  actionHref?: string;
  actionLabel?: string;
  secondaryActionHref?: string;
  secondaryActionLabel?: string;
};

export function WorkspaceHeader({
  role,
  title,
  subtitle,
  pendingCount,
  verifiedLabel = "Verified workspace",
  actionHref = "/dashboard/bookings",
  actionLabel = "Open Bookings",
  secondaryActionHref,
  secondaryActionLabel
}: WorkspaceHeaderProps) {
  return (
    <header className="border-b border-roomBorder px-room-3 py-room-3 xl:px-room-4">
      <div className="grid gap-room-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <div className="min-w-0 max-w-3xl">
          <div className="flex flex-wrap items-center gap-room-2">
            <Text variant="uiLabel">Workspace / {role}</Text>
            <StatusBadge status="verified">{verifiedLabel}</StatusBadge>
            {pendingCount > 0 ? <StatusBadge status="pending">{pendingCount} pending</StatusBadge> : null}
          </div>
          <Text as="h1" className="mt-room-2 max-w-4xl text-[30px] leading-none md:text-[40px]" variant="title">
            {title}
          </Text>
          <Text className="mt-room-2 max-w-2xl" variant="small">
            {subtitle}
          </Text>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-room-2 xl:justify-end">
          <ButtonLink className="whitespace-nowrap" href={actionHref} variant="primary">
            {actionLabel}
          </ButtonLink>
          {secondaryActionHref && secondaryActionLabel ? (
            <ButtonLink className="whitespace-nowrap" href={secondaryActionHref} variant="secondary">
              {secondaryActionLabel}
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export function MetricStrip({
  metrics
}: {
  metrics: Array<{ label: string; value: string | number; note?: string; active?: boolean }>;
}) {
  return (
    <div className="grid gap-room-2 md:grid-cols-2 xl:grid-cols-6">
      {metrics.map((metric) => (
        <MetricCard
          active={metric.active}
          key={metric.label}
          label={metric.label}
          note={metric.note}
          value={metric.value}
        />
      ))}
    </div>
  );
}

export function DJWorkspaceOverview({
  profile,
  djProfile,
  bookings,
  works,
  analytics
}: {
  profile: Profile;
  djProfile: DjProfile | null;
  bookings: Booking[];
  works: Work[];
  analytics: WorkspaceAnalytics;
}) {
  const pendingOffers = bookings.filter((booking) => booking.status === "pending").length;
  const acceptedBookings = bookings.filter((booking) => booking.status === "accepted");
  const confirmedFees = acceptedBookings.reduce((total) => total + (djProfile?.price ?? 0), 0);
  const readiness = getProfileReadiness(djProfile, works);
  const missingCovers = works.filter((work) => !work.cover_image).length;
  const privateTracks = works.filter((work) => work.visibility === "private").length;
  const liveListeners = Math.max(0, Math.round((analytics.trackPlays + analytics.profileViews) / 6));

  const metrics = [
    { label: "Pending offers", value: pendingOffers, note: "Needs reply", active: pendingOffers > 0 },
    { label: "Confirmed fees", value: formatPrice(confirmedFees), note: `${acceptedBookings.length} accepted` },
    { label: "Profile fit", value: `${readiness}%`, note: "Readiness score" },
    { label: "Live listeners", value: liveListeners, note: "Current signal" },
    { label: "Book clicks", value: bookings.length, note: "Total requests" },
    { label: "Saves / Plays", value: `${analytics.savedCount}/${analytics.trackPlays}`, note: "Music demand" }
  ];

  const actions = [
    {
      label: "Reply to booking request",
      reason: pendingOffers > 0 ? `${pendingOffers} offer${pendingOffers === 1 ? "" : "s"} waiting` : "No urgent offers",
      status: pendingOffers > 0 ? "pending" : "done",
      href: "/dashboard/bookings",
      action: "Review"
    },
    {
      label: "Complete profile",
      reason: readiness < 80 ? "More booking trust needed" : "Profile is ready",
      status: readiness < 80 ? "waiting" : "verified",
      href: "#profile",
      action: "Edit"
    },
    {
      label: "Upload cover art",
      reason: missingCovers > 0 ? `${missingCovers} track${missingCovers === 1 ? "" : "s"} missing cover` : "Library covers ready",
      status: missingCovers > 0 ? "blocked" : "verified",
      href: "/library",
      action: "Open"
    },
    {
      label: "Schedule stream",
      reason: "Keep live proof connected to bookings",
      status: "draft",
      href: "/dashboard/streams",
      action: "Plan"
    },
    {
      label: "Resolve calendar conflict",
      reason: acceptedBookings.length > 0 ? "Check confirmed dates" : "No confirmed conflicts",
      status: acceptedBookings.length > 0 ? "waiting" : "done",
      href: "/dashboard/calendar",
      action: "Calendar"
    }
  ];

  return (
    <div className="space-y-room-4">
      <MetricStrip metrics={metrics} />
      <div className="grid gap-room-4 xl:grid-cols-[1.05fr_0.95fr]">
        <NextBestActions actions={actions} />
        <BookingPipeline bookings={bookings} role="dj" />
      </div>
      <div className="grid gap-room-4 xl:grid-cols-[1fr_1fr_0.85fr]">
        <SoundPerformance artistName={djProfile?.stage_name || profile.email || "ROOM_9"} works={works} />
        <LibraryHealth
          missingCovers={missingCovers}
          privateTracks={privateTracks}
          readiness={readiness}
          works={works}
        />
        <StreamStatusPanel />
      </div>
    </div>
  );
}

function StreamStatusPanel() {
  return (
    <Panel className="p-room-3">
      <SectionHeader eyebrow="What is live now?" title="Stream Status" />
      <div className="mt-room-3 space-y-room-2">
        <div className="border border-roomBorder p-room-2">
          <StatusBadge status="draft">draft</StatusBadge>
          <Text as="h3" className="mt-room-2 text-lg" variant="title">
            No active stream
          </Text>
          <Text className="mt-room-1" variant="small">
            Schedule a stream to connect listening proof with booking trust.
          </Text>
        </div>
        <ButtonLink href="/dashboard/streams" size="sm" variant="secondary">
          Schedule Stream
        </ButtonLink>
      </div>
    </Panel>
  );
}

export function OrganizerWorkspaceOverview({
  profile,
  bookings,
  events,
  djLookup,
  mode = "organizer",
  activeRoles
}: {
  profile: Profile;
  bookings: Booking[];
  events: EventPost[];
  djLookup: Record<string, DjProfile>;
  mode?: "organizer" | "venue";
  activeRoles?: Role[];
}) {
  const pendingRequests = bookings.filter((booking) => booking.status === "pending").length;
  const acceptedBookings = bookings.filter((booking) => booking.status === "accepted").length;
  const soundMomentCount = bookings.filter((booking) => booking.source_work_id || booking.source_timestamp_label).length;
  const budgetLeft = Math.max(0, 6000 - acceptedBookings * 900);
  const title = mode === "venue" ? "Venue Desk" : "Lineup Desk";
  const subtitle =
    mode === "venue"
      ? "Manage public events, booking requests, and recurring room programming."
      : "Build lineups, manage requests, and turn saved sound references into bookings.";
  const roleLabel = activeRoles?.filter((role) => role !== "listener").join(" + ") || profile.role;

  const metrics = [
    { label: "Active events", value: events.length, note: "Published / draft" },
    { label: "Pending requests", value: pendingRequests, note: "Awaiting DJ", active: pendingRequests > 0 },
    { label: "Accepted bookings", value: acceptedBookings, note: "Confirmed artists" },
    { label: "Budget left", value: formatPrice(budgetLeft), note: "Demo planning budget" },
    { label: "Sound refs", value: soundMomentCount, note: "Bookable briefs" }
  ];

  return (
    <div className="space-y-room-4">
      <Panel className="p-room-4">
        <div className="flex flex-wrap items-start justify-between gap-room-3">
          <div>
            <div className="flex flex-wrap items-center gap-room-2">
              <Text variant="uiLabel">{roleLabel} workspace</Text>
              <StatusBadge status="verified">Verified access</StatusBadge>
            </div>
            <Text as="h2" className="mt-room-2 text-4xl" variant="title">
              {title}
            </Text>
            <Text className="mt-room-2 max-w-2xl" variant="small">
              {subtitle}
            </Text>
          </div>
          <ButtonLink href="/explore" variant="primary">
            Find DJs
          </ButtonLink>
        </div>
      </Panel>

      <MetricStrip metrics={metrics} />
      <div className="grid gap-room-4 xl:grid-cols-[1fr_1fr]">
        <ActiveEventsPanel events={events} bookings={bookings} />
        <LineupBuilder bookings={bookings} djLookup={djLookup} />
      </div>
      <div className="grid gap-room-4 xl:grid-cols-[1fr_1fr]">
        <SentRequestsPanel bookings={bookings} djLookup={djLookup} />
        <SavedSoundMoments bookings={bookings} djLookup={djLookup} />
      </div>
    </div>
  );
}

export function RoleAccessPanel({ role }: { role: Profile["role"] | Role[] }) {
  return (
    <Panel className="p-room-3">
      <SectionHeader eyebrow="Access" title="Role Tools" />
      <div className="mt-room-3 grid gap-room-2 md:grid-cols-3">
        {[
          { label: "Listener", active: true, note: "Music, saves, streams" },
          { label: "DJ", active: hasRoleAccess(role, ["dj"]), note: "Profile, offers, library" },
          { label: "Organizer", active: hasRoleAccess(role, ["organizer", "venue"]), note: "Events, lineup, cases" }
        ].map((item) => (
          <div
            className={cx(
              "border p-room-2",
              item.active ? "border-acidGreen bg-inkPanel" : "border-roomBorder"
            )}
            key={item.label}
          >
            <StatusBadge status={item.active ? "selected" : "waiting"}>
              {item.active ? "unlocked" : "locked"}
            </StatusBadge>
            <Text as="h3" className="mt-room-2" variant="title">
              {item.label}
            </Text>
            <Text className="mt-room-1" variant="small">
              {item.note}
            </Text>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function NextBestActions({
  actions
}: {
  actions: Array<{ label: string; reason: string; status: string; href: string; action: string }>;
}) {
  return (
    <Panel className="p-room-3">
      <SectionHeader eyebrow="What should I do next?" title="Next Best Actions" />
      <div className="mt-room-3 space-y-room-2">
        {actions.map((item) => (
          <Link
            className="grid gap-room-2 border border-roomBorder p-room-2 transition hover:border-paperWhite md:grid-cols-[1fr_auto] md:items-center"
            href={item.href}
            key={item.label}
          >
            <div>
              <div className="flex flex-wrap items-center gap-room-2">
                <StatusBadge status={item.status}>{item.status}</StatusBadge>
                <Text as="h3" className="text-lg" variant="title">
                  {item.label}
                </Text>
              </div>
              <Text className="mt-room-1" variant="small">
                {item.reason}
              </Text>
            </div>
            <span className="font-mono text-[10px] font-black uppercase text-paperWhite">{item.action}</span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

function BookingPipeline({ bookings, role }: { bookings: Booking[]; role: "dj" | "organizer" }) {
  const pending = bookings.filter((booking) => booking.status === "pending").length;
  const accepted = bookings.filter((booking) => booking.status === "accepted").length;
  const declined = bookings.filter((booking) => booking.status === "declined").length;
  const stages = [
    { label: role === "dj" ? "New requests" : "Sent requests", count: pending, status: pending > 0 ? "current" : "waiting" },
    { label: "Negotiating", count: pending, status: pending > 0 ? "current" : "waiting" },
    { label: "Rider check", count: accepted, status: accepted > 0 ? "waiting" : "draft" },
    { label: "Escrow ready", count: accepted, status: accepted > 0 ? "escrowReady" : "blocked" },
    { label: "Confirmed", count: accepted, status: accepted > 0 ? "accepted" : declined > 0 ? "declined" : "waiting" }
  ];

  return (
    <Panel className="p-room-3">
      <SectionHeader eyebrow="What changed?" title="Booking Pipeline" />
      <div className="mt-room-3 grid gap-room-2">
        {stages.map((stage) => (
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-room-2 border border-roomBorder p-room-2" key={stage.label}>
            <Text as="h3" className="text-lg" variant="title">
              {stage.label}
            </Text>
            <StatusBadge status={stage.status}>{stage.status}</StatusBadge>
            <span className="min-w-10 text-right font-display text-2xl text-paperWhite">{stage.count}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SoundPerformance({ works, artistName }: { works: Work[]; artistName: string }) {
  const topTracks = [...works]
    .sort((a, b) => (b.play_count ?? 0) - (a.play_count ?? 0))
    .slice(0, 4);

  return (
    <Panel className="p-room-3">
      <SectionHeader
        action={<ButtonLink href="/library" size="sm" variant="secondary">Open Vault</ButtonLink>}
        eyebrow="How does music affect bookings?"
        title="Sound Performance"
      />
      <div className="mt-room-3 space-y-room-2">
        {topTracks.length === 0 ? (
          <Text variant="small">Upload your first track to connect music demand with booking requests.</Text>
        ) : (
          topTracks.map((work) => {
            const track: TrackDisplay = {
              id: work.id,
              title: work.title || "Untitled track",
              artist: artistName,
              href: `/track/${work.id}`,
              coverUrl: getWorkCoverUrl(work),
              genre: work.genre,
              bpm: work.bpm,
              plays: work.play_count,
              saves: work.like_count
            };
            const moment = getPrimaryTrackMoment(null);
            return (
              <TrackRow
                action={
                  <span className="hidden font-mono text-[10px] uppercase text-acidGreen lg:block">
                    {getMomentDisplayLabel(moment)}
                  </span>
                }
                key={work.id}
                track={track}
              />
            );
          })
        )}
      </div>
    </Panel>
  );
}

function LibraryHealth({
  works,
  missingCovers,
  privateTracks,
  readiness
}: {
  works: Work[];
  missingCovers: number;
  privateTracks: number;
  readiness: number;
}) {
  const missingNotes = works.filter((work) => !work.description && !work.lyrics).length;
  const latestUpload = works[0]?.title || "No uploads yet";

  return (
    <Panel className="p-room-3">
      <SectionHeader eyebrow="What is blocked?" title="Library Health" />
      <div className="mt-room-3 space-y-room-3">
        <div>
          <div className="flex items-center justify-between gap-room-2">
            <Text variant="uiLabel">Profile readiness</Text>
            <span className="font-mono text-xs text-paperWhite">{readiness}%</span>
          </div>
          <div className="mt-room-1 h-2 border border-roomBorder bg-voidBlack">
            <div className="h-full bg-acidGreen" style={{ width: `${readiness}%` }} />
          </div>
        </div>
        <div className="grid gap-room-2 md:grid-cols-2">
          <HealthCell label="Tracks missing covers" status={missingCovers > 0 ? "blocked" : "verified"} value={missingCovers} />
          <HealthCell label="Private tracks ready" status={privateTracks > 0 ? "waiting" : "draft"} value={privateTracks} />
          <HealthCell label="Notes missing" status={missingNotes > 0 ? "waiting" : "verified"} value={missingNotes} />
          <HealthCell label="Latest upload" status={works.length > 0 ? "sent" : "draft"} value={latestUpload} />
        </div>
      </div>
    </Panel>
  );
}

function HealthCell({ label, value, status }: { label: string; value: string | number; status: string }) {
  return (
    <div className="border border-roomBorder p-room-2">
      <StatusBadge status={status}>{status}</StatusBadge>
      <Text className="mt-room-2" variant="uiLabel">
        {label}
      </Text>
      <p className="mt-room-1 font-display text-2xl uppercase text-paperWhite">{value}</p>
    </div>
  );
}

function ActiveEventsPanel({ events, bookings }: { events: EventPost[]; bookings: Booking[] }) {
  return (
    <Panel className="p-room-3">
      <SectionHeader
        action={<ButtonLink href="/dashboard/events" size="sm" variant="secondary">Create Event</ButtonLink>}
        eyebrow="What is live now?"
        title="Active Events"
      />
      <div className="mt-room-3 space-y-room-2">
        {events.length === 0 ? (
          <Text variant="small">No event pages yet. Create an event, then attach booking requests to lineup slots.</Text>
        ) : (
          events.slice(0, 4).map((event) => {
            const requestCount = bookings.filter((booking) => sameCity(booking.city, event.city)).length;
            return (
              <Link className="grid gap-room-2 border border-roomBorder p-room-2 transition hover:border-paperWhite md:grid-cols-[1fr_auto] md:items-center" href={`/events/${event.id}`} key={event.id}>
                <div>
                  <Text as="h3" className="text-lg" variant="title">{event.title}</Text>
                  <Text className="mt-room-1" variant="mono">
                    {[formatDate(event.event_date), event.venue_name, event.city].filter(Boolean).join(" / ")}
                  </Text>
                </div>
                <div className="flex items-center gap-room-2">
                  <StatusBadge status={event.poster_url ? "public" : "draft"}>{event.poster_url ? "public" : "draft"}</StatusBadge>
                  <span className="font-mono text-[10px] uppercase text-mutedText">{requestCount} requests</span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </Panel>
  );
}

function LineupBuilder({ bookings, djLookup }: { bookings: Booking[]; djLookup: Record<string, DjProfile> }) {
  const slots = ["Opening", "Support", "Peak", "Closing", "Stream"].map((slot, index) => {
    const booking = bookings[index];
    const dj = booking ? djLookup[booking.dj_id] : undefined;
    return {
      slot,
      artist: dj?.stage_name || (booking ? "DJ profile" : "Searching"),
      status: booking?.status ?? (slot === "Peak" ? "waiting" : "draft"),
      sound: booking?.source_timestamp_label
        ? `${booking.source_track_title || "Attached track"} / ${booking.source_timestamp_label}`
        : "No sound reference attached",
      href: booking ? `/booking/details/${booking.id}` : "/explore"
    };
  });

  return (
    <Panel className="p-room-3">
      <SectionHeader eyebrow="What is blocked?" title="Lineup Builder" />
      <div className="mt-room-3 space-y-room-2">
        {slots.map((slot) => (
          <Link className="grid gap-room-2 border border-roomBorder p-room-2 transition hover:border-paperWhite md:grid-cols-[110px_1fr_auto] md:items-center" href={slot.href} key={slot.slot}>
            <Text variant="uiLabel">{slot.slot}</Text>
            <div>
              <Text as="h3" className="text-lg" variant="title">{slot.artist}</Text>
              <Text className="mt-room-1" variant="small">{slot.sound}</Text>
            </div>
            <StatusBadge status={slot.status}>{slot.status}</StatusBadge>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

function SentRequestsPanel({ bookings, djLookup }: { bookings: Booking[]; djLookup: Record<string, DjProfile> }) {
  return (
    <Panel className="p-room-3">
      <SectionHeader eyebrow="What changed?" title="Sent Requests" />
      <div className="mt-room-3 space-y-room-2">
        {bookings.length === 0 ? (
          <Text variant="small">No outgoing booking requests yet. Start from a track moment or artist dossier.</Text>
        ) : (
          bookings.slice(0, 5).map((booking) => {
            const dj = djLookup[booking.dj_id];
            return (
              <Link className="grid gap-room-2 border border-roomBorder p-room-2 transition hover:border-paperWhite md:grid-cols-[1fr_auto] md:items-center" href={`/booking/details/${booking.id}`} key={booking.id}>
                <div>
                  <Text as="h3" className="text-lg" variant="title">{dj?.stage_name || "DJ profile"}</Text>
                  <Text className="mt-room-1" variant="mono">
                    {[booking.venue_name, formatDate(booking.event_date), booking.city].join(" / ")}
                  </Text>
                  {booking.source_timestamp_label ? (
                    <Text className="mt-room-1 text-acidGreen" variant="small">
                      {booking.source_track_title || "Attached track"} / {booking.source_timestamp_label}
                    </Text>
                  ) : null}
                </div>
                <StatusBadge status={booking.status}>{booking.status}</StatusBadge>
              </Link>
            );
          })
        )}
      </div>
    </Panel>
  );
}

function SavedSoundMoments({ bookings, djLookup }: { bookings: Booking[]; djLookup: Record<string, DjProfile> }) {
  const moments = bookings.filter((booking) => booking.source_work_id || booking.source_timestamp_label);

  return (
    <Panel className="p-room-3">
      <SectionHeader
        action={<ButtonLink href="/explore" size="sm" variant="secondary">Find Sound</ButtonLink>}
        eyebrow="How listening becomes booking"
        title="Saved Sound Moments"
      />
      <div className="mt-room-3 space-y-room-2">
        {moments.length === 0 ? (
          <Text variant="small">No saved sound references yet. Open a track, select a peak, then create an atmosphere brief from that sound.</Text>
        ) : (
          moments.slice(0, 4).map((booking) => {
            const dj = djLookup[booking.dj_id];
            return (
              <Link className="grid gap-room-2 border border-roomBorder p-room-2 transition hover:border-paperWhite md:grid-cols-[1fr_auto] md:items-center" href={`/booking/details/${booking.id}`} key={booking.id}>
                <div>
                  <Text as="h3" className="text-lg" variant="title">
                    {booking.source_track_title || "Attached track"}
                  </Text>
                  <Text className="mt-room-1" variant="mono">
                    {[dj?.stage_name, booking.source_timestamp_label || "0:00", booking.city].filter(Boolean).join(" / ")}
                  </Text>
                  {booking.source_moment_note ? (
                    <Text className="mt-room-1" variant="small">{booking.source_moment_note}</Text>
                  ) : null}
                </div>
                <StatusBadge status="selected">Create booking</StatusBadge>
              </Link>
            );
          })
        )}
      </div>
    </Panel>
  );
}

function getProfileReadiness(profile: DjProfile | null, works: Work[]) {
  const fields = [
    profile?.stage_name,
    profile?.bio,
    profile?.city,
    profile?.country,
    profile?.genres,
    profile?.bpm_range,
    profile?.price,
    profile?.avatar_url,
    profile?.cover_image_url,
    works.length > 0
  ];
  const completed = fields.filter(Boolean).length;
  return Math.round((completed / fields.length) * 100);
}

function sameCity(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) {
    return false;
  }

  return left.trim().toLowerCase() === right.trim().toLowerCase();
}
