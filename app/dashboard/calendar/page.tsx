"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { MissingConfigNotice } from "@/components/AuthNotice";
import { ButtonLink, MetricCard, Panel, SectionHeader, StatusBadge, Text, cx } from "@/components/room9-ui";
import {
  WorkspaceCommandGrid,
  WorkspaceCommandPanel,
  WorkspaceMetricGrid,
  WorkspaceNotice,
  WorkspaceOpsHeader,
  WorkspacePageFrame,
  canAccessWorkspaceSection,
  getWorkspaceUnlockHref
} from "@/components/workspace/WorkspaceShell";
import { formatDate } from "@/lib/format";
import { loadRoleAccess } from "@/lib/roleAccess";
import {
  formatSupabaseError,
  getSupabase,
  hasSupabaseConfig,
  isMissingAuthSession,
  logSupabaseError
} from "@/lib/supabase";
import {
  hasRoleAccess,
  isBookingClientRole,
  type Booking,
  type DjProfile,
  type EventPost,
  type LiveStream,
  type Profile,
  type Role
} from "@/lib/types";

type ScheduleItem = {
  id: string;
  type: "booking" | "event" | "stream" | "deadline";
  date: string | null;
  title: string;
  meta: string;
  context: string;
  action: string;
  status: string;
  href: string;
};

export default function DashboardCalendarPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeRoles, setActiveRoles] = useState<Role[]>(["listener"]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [events, setEvents] = useState<EventPost[]>([]);
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [djLookup, setDjLookup] = useState<Record<string, DjProfile>>({});
  const [ownedDj, setOwnedDj] = useState<DjProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      return;
    }

    async function loadCalendar() {
      setIsLoading(true);
      setError("");

      try {
        const supabase = getSupabase();
        const { data: sessionData, error: userError } = await supabase.auth.getSession();

        if (userError) {
          if (isMissingAuthSession(userError)) {
            router.push("/login?next=/dashboard/calendar");
            return;
          }

          logSupabaseError("Dashboard calendar auth failed", userError);
          setError(formatSupabaseError(userError, "Could not load calendar."));
          return;
        }

        const user = sessionData.session?.user ?? null;
        if (!user) {
          router.push("/login?next=/dashboard/calendar");
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError || !profileData) {
          logSupabaseError("Dashboard calendar profile failed", profileError);
          setError(formatSupabaseError(profileError, "Could not load profile."));
          return;
        }

        const loadedProfile = profileData as Profile;
        setProfile(loadedProfile);
        const loadedRoles = await loadRoleAccess(supabase, loadedProfile.id, loadedProfile.role);
        setActiveRoles(loadedRoles);

        if (!canAccessWorkspaceSection("calendar", loadedRoles)) {
          router.replace(getWorkspaceUnlockHref("calendar"));
          return;
        }

        const { data: streamData, error: streamError } = await supabase
          .from("live_streams")
          .select("*")
          .or(`owner_id.eq.${loadedProfile.id},owner_id.is.null`)
          .order("starts_at", { ascending: true })
          .limit(8);

        if (streamError) {
          logSupabaseError("Dashboard calendar streams failed", streamError);
        } else {
          setStreams((streamData as LiveStream[]) ?? []);
        }

        if (hasRoleAccess(loadedRoles, ["dj"])) {
          const { data: djData, error: djError } = await supabase
            .from("dj_profiles")
            .select("*")
            .eq("user_id", loadedProfile.id)
            .maybeSingle();

          if (djError) {
            logSupabaseError("Dashboard calendar DJ load failed", djError);
            return;
          }

          const dj = (djData as DjProfile | null) ?? null;
          setOwnedDj(dj);
          if (dj) {
            setDjLookup({ [dj.id]: dj });
            const { data: bookingData, error: bookingError } = await supabase
              .from("bookings")
              .select("*")
              .eq("dj_id", dj.id)
              .order("event_date", { ascending: true })
              .limit(120);

            if (bookingError) {
              logSupabaseError("Dashboard calendar DJ bookings failed", bookingError);
            } else {
              setBookings((bookingData as Booking[]) ?? []);
            }
          }
        } else {
          const [{ data: bookingData, error: bookingError }, { data: eventData, error: eventError }] =
            await Promise.all([
              supabase
                .from("bookings")
                .select("*")
                .eq("organizer_id", loadedProfile.id)
                .order("event_date", { ascending: true })
                .limit(120),
              isBookingClientRole(loadedRoles)
                ? supabase.from("events").select("*").eq("organizer_id", loadedProfile.id).order("event_date", { ascending: true }).limit(80)
                : supabase.from("events").select("*").order("event_date", { ascending: true }).limit(8)
            ]);

          if (bookingError) {
            logSupabaseError("Dashboard calendar bookings failed", bookingError);
          } else {
            const loadedBookings = (bookingData as Booking[]) ?? [];
            setBookings(loadedBookings);
            const ids = Array.from(new Set(loadedBookings.map((booking) => booking.dj_id)));
            if (ids.length > 0) {
              const { data: djs } = await supabase.from("dj_profiles").select("*").in("id", ids.slice(0, 80));
              setDjLookup(
                ((djs as DjProfile[]) ?? []).reduce<Record<string, DjProfile>>((acc, dj) => {
                  acc[dj.id] = dj;
                  return acc;
                }, {})
              );
            }
          }

          if (eventError) {
            logSupabaseError("Dashboard calendar events failed", eventError);
          } else {
            setEvents((eventData as EventPost[]) ?? []);
          }
        }
      } catch (caughtError) {
        logSupabaseError("Dashboard calendar unexpected failure", caughtError);
        setError(formatSupabaseError(caughtError, "Could not load calendar."));
      } finally {
        setIsLoading(false);
      }
    }

    loadCalendar();
  }, [router]);

  const schedule = useMemo<ScheduleItem[]>(() => {
    const bookingItems = bookings.map((booking) => ({
      id: booking.id,
      type: "booking" as const,
      date: booking.event_date,
      title: booking.venue_name,
      meta: [booking.city, booking.event_type, djLookup[booking.dj_id]?.stage_name].filter(Boolean).join(" / "),
      context: getBookingTimelineContext(booking),
      action: getBookingTimelineAction(booking),
      status: booking.status,
      href: `/booking/details/${booking.id}`
    }));

    const deadlineItems = bookings.flatMap((booking) => {
      if (!booking.event_date || booking.status === "declined" || booking.status === "cancelled") {
        return [];
      }

      const href = `/booking/details/${booking.id}`;
      const isAccepted = booking.status === "accepted" || booking.status === "paid" || booking.status === "completed";

      return [
        {
          id: `${booking.id}-rider`,
          type: "deadline" as const,
          date: offsetDate(booking.event_date, -14),
          title: `Rider deadline / ${booking.venue_name}`,
          meta: [booking.city, "technical rider", booking.event_type].filter(Boolean).join(" / "),
          context: "Case production gate",
          action: isAccepted ? "Upload or confirm the technical rider before contract lock." : "Prepare rider once the request moves forward.",
          status: isAccepted ? "blocked" : "waiting",
          href
        },
        {
          id: `${booking.id}-deposit`,
          type: "deadline" as const,
          date: offsetDate(booking.event_date, -7),
          title: `Deposit preview / ${booking.venue_name}`,
          meta: [booking.city, "escrow preview", booking.status].filter(Boolean).join(" / "),
          context: "Escrow preview",
          action: isAccepted ? "Confirm deposit plan and provider handoff." : "Deposit stays locked until offer is accepted.",
          status: isAccepted ? "pending" : "waiting",
          href
        }
      ];
    });

    const eventItems = events.map((event) => ({
      id: event.id,
      type: "event" as const,
      date: event.event_date,
      title: event.title,
      meta: [event.venue_name, event.city, event.event_type].filter(Boolean).join(" / "),
      context: "Event Desk",
      action: event.poster_url ? "Public event page is live. Check lineup and stream readiness." : "Draft event needs lineup, artwork, and booking slots.",
      status: event.poster_url ? "public" : "draft",
      href: `/events/${event.id}`
    }));

    const streamItems = streams.map((stream) => ({
      id: stream.id,
      type: "stream" as const,
      date: stream.starts_at,
      title: stream.title,
      meta: [stream.artist_name, stream.location, stream.genre].filter(Boolean).join(" / "),
      context: "Stream schedule",
      action: stream.status === "live" ? "Live now. Monitor audience and archive signal." : "Prepare stream page, reminder, and archive metadata.",
      status: stream.status,
      href: "/streams"
    }));

    return [...bookingItems, ...deadlineItems, ...eventItems, ...streamItems].sort((left, right) => {
      const leftTime = left.date ? new Date(left.date).getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right.date ? new Date(right.date).getTime() : Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    });
  }, [bookings, djLookup, events, streams]);

  const conflictDates = useMemo(() => {
    const counts = schedule.reduce<Record<string, number>>((acc, item) => {
      if (!item.date) {
        return acc;
      }
      const key = toDateKey(item.date);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).filter(([, count]) => count > 1);
  }, [schedule]);

  const conflictDateSet = useMemo(() => new Set(conflictDates.map(([date]) => date)), [conflictDates]);
  const conflictGroups = useMemo(
    () =>
      conflictDates.map(([date, count]) => ({
        date,
        count,
        items: schedule.filter((item) => item.date && toDateKey(item.date) === date)
      })),
    [conflictDates, schedule]
  );
  const timelineSections = useMemo(
    () => buildOperationalTimelineSections(schedule, conflictDateSet),
    [conflictDateSet, schedule]
  );
  const decisionQueue = useMemo(
    () =>
      schedule
        .filter((item) => ["pending", "hold", "accepted", "blocked", "live", "upcoming"].includes(item.status))
        .slice(0, 6),
    [schedule]
  );
  const pendingCount = bookings.filter((booking) => booking.status === "pending").length;
  const acceptedCount = bookings.filter((booking) => booking.status === "accepted").length;
  const deadlineCount = schedule.filter((item) => item.type === "deadline").length;
  const nextItem = schedule.find((item) => Boolean(item.date) && new Date(item.date as string).getTime() >= Date.now()) ?? schedule[0];

  if (!hasSupabaseConfig()) {
    return <MissingConfigNotice />;
  }

  if (isLoading) {
    return (
      <main className="room-page">
        <section className="room-shell py-12">
          <div className="room-card min-h-[620px] animate-pulse" />
        </section>
      </main>
    );
  }

  if (error && !profile) {
    return (
      <main className="room-page">
        <section className="room-shell py-12">
          <EmptyState title="Calendar unavailable" message={error} href="/dashboard" action="Dashboard" />
        </section>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="room-page">
        <section className="room-shell py-12">
          <EmptyState title="Calendar unavailable" message="Log in again to continue." href="/login?next=/dashboard/calendar" action="Login" />
        </section>
      </main>
    );
  }

  if (!hasRoleAccess(activeRoles, ["dj", "organizer", "venue", "admin"])) {
    return (
      <WorkspacePageFrame
        active="calendar"
        email={profile.email}
        pendingCount={0}
        profileLabel={profile.email || "ROOM_9"}
        readiness={58}
        role={activeRoles}
      >
        <div className="px-room-3 py-room-3 xl:px-room-4">
          <WorkspaceOpsHeader
            description="Timeline opens when a profile becomes DJ, organizer or venue. Listener mode keeps public events and streams in the main music platform."
            eyebrow="Workspace / Locked Tool"
            title="Operational Timeline Locked"
            actions={
              <>
                <ButtonLink href="/dashboard/settings?unlock=calendar" variant="primary">
                  Unlock Timeline
                </ButtonLink>
                <ButtonLink href="/events" variant="secondary">
                  Public Events
                </ButtonLink>
              </>
            }
          />
          <ListenerTimelineUnlock />
        </div>
      </WorkspacePageFrame>
    );
  }

  return (
    <WorkspacePageFrame
      active="calendar"
      email={profile?.email}
      pendingCount={pendingCount}
      profileLabel={ownedDj?.stage_name || profile?.email || "ROOM_9"}
      readiness={76}
      role={activeRoles}
    >
      <div className="px-room-3 py-room-3 xl:px-room-4">
        <WorkspaceOpsHeader
          description="A date-first view for pending bookings, accepted holds, event pages, stream dates, and conflicts."
          eyebrow="Workspace / Calendar"
          title="Operational Timeline"
          actions={
            <>
            <ButtonLink href="/dashboard/bookings" variant="primary">
              Booking Ops
            </ButtonLink>
            <ButtonLink href="/dashboard/events" variant="secondary">
              Event Desk
            </ButtonLink>
            </>
          }
        />

        {error ? <WorkspaceNotice tone="error">{error}</WorkspaceNotice> : null}

        <WorkspaceMetricGrid columns={6}>
          <MetricCard active={pendingCount > 0} label="Pending holds" note="Need decision" value={pendingCount} />
          <MetricCard label="Confirmed" note="Accepted bookings" value={acceptedCount} />
          <MetricCard label="Events" note="Public or draft" value={events.length} />
          <MetricCard label="Streams" note="Live dates" value={streams.length} />
          <MetricCard active={deadlineCount > 0} label="Deadlines" note="Rider / deposit" value={deadlineCount} />
          <MetricCard label="Conflicts" note="Same date collisions" value={conflictDates.length} />
        </WorkspaceMetricGrid>

        <CalendarCommandStrip
          acceptedCount={acceptedCount}
          conflictCount={conflictDates.length}
          nextItem={nextItem}
          pendingCount={pendingCount}
        />

        <div className="mt-room-4 grid gap-room-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Panel className="p-room-3">
            <SectionHeader
              eyebrow="Date lanes"
              title="Today / This Week / Upcoming / Conflicts"
              action={<Text variant="uiLabel">{schedule.length} items</Text>}
            />
            <div className="mt-room-3 space-y-room-2">
              {schedule.length === 0 ? (
                <div className="border border-dashed border-roomBorder bg-black p-room-3">
                  <StatusBadge status="draft">no dates</StatusBadge>
                  <Text as="h3" className="mt-room-3 text-xl" variant="title">
                    Timeline starts after an event, stream, or booking exists.
                  </Text>
                  <Text className="mt-room-2" variant="small">
                    Create an event in Event Desk or send a booking request from a saved sound reference. Accepted bookings,
                    pending holds, stream dates, and conflicts will appear here.
                  </Text>
                  <div className="mt-room-3 flex flex-wrap gap-room-2">
                    <ButtonLink href="/dashboard/events" size="sm" variant="primary">
                      Event Desk
                    </ButtonLink>
                    <ButtonLink href="/explore" size="sm" variant="secondary">
                      Find Sound
                    </ButtonLink>
                  </div>
                </div>
              ) : (
                timelineSections.map((section) => (
                  <TimelineSectionBlock key={section.id} section={section} />
                ))
              )}
            </div>
          </Panel>

          <div className="space-y-room-4">
            <Panel className="p-room-3">
              <SectionHeader eyebrow="Conflict desk" title="Needs Attention" />
              <div className="mt-room-3 space-y-room-2">
                {conflictGroups.length === 0 ? (
                  <div className="border border-roomBorder bg-black p-room-2">
                    <StatusBadge status="done">clear</StatusBadge>
                    <Text as="h3" className="mt-room-2 text-lg" variant="title">
                      No same-day conflicts detected.
                    </Text>
                    <Text className="mt-room-1" variant="small">
                      Pending holds, accepted bookings, public events and streams currently do not collide by date.
                    </Text>
                  </div>
                ) : (
                  conflictGroups.map((group) => (
                    <div className="border border-warningOrange p-room-2" key={group.date}>
                      <StatusBadge status="waiting">conflict</StatusBadge>
                      <Text as="h3" className="mt-room-2 text-lg" variant="title">
                        {formatDate(group.date)}
                      </Text>
                      <Text className="mt-room-1" variant="small">
                        {group.count} items share this date. Resolve before confirming contracts or publishing lineup.
                      </Text>
                      <div className="mt-room-2 space-y-1">
                        {group.items.map((item) => (
                          <Link
                            className="block border border-roomBorder bg-black px-room-2 py-1 font-mono text-[10px] uppercase text-mutedText hover:text-paperWhite"
                            href={item.href}
                            key={`${item.type}-${item.id}`}
                          >
                            {item.type} / {item.title}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Panel>

            <Panel className="p-room-3">
              <SectionHeader eyebrow="Decision queue" title="Next Moves" />
              <div className="mt-room-3 space-y-room-2">
                {decisionQueue.length === 0 ? (
                  <Text variant="small">No active holds. Create an event or booking request to start the timeline.</Text>
                ) : (
                  decisionQueue.map((item) => (
                    <Link
                      className="block border border-roomBorder bg-black p-room-2 hover:border-paperWhite"
                      href={item.href}
                      key={`${item.type}-${item.id}`}
                    >
                      <div className="flex items-center justify-between gap-room-2">
                        <Text variant="uiLabel">{item.type}</Text>
                        <StatusBadge status={item.status}>{item.status}</StatusBadge>
                      </div>
                      <Text as="h3" className="mt-room-2 text-base" variant="title">
                        {item.title}
                      </Text>
                      <Text className="mt-room-1" variant="small">
                        {getOperationalAction(item)}
                      </Text>
                    </Link>
                  ))
                )}
              </div>
            </Panel>

            <Panel className="p-room-3">
              <SectionHeader eyebrow="Legend" title="Operational States" />
              <div className="mt-room-3 space-y-room-2">
                {[
                  ["pending", "Booking request waiting for decision."],
                  ["accepted", "Confirmed booking or locked date."],
                  ["blocked", "Rider or production deadline needs attention."],
                  ["public", "Published event page."],
                  ["live", "Stream date or active stream."],
                  ["waiting", "Conflict or unresolved hold."]
                ].map(([status, copy]) => (
                  <div className="grid grid-cols-[auto_1fr] items-center gap-room-2 border border-roomBorder p-room-2" key={status}>
                    <StatusBadge status={status}>{status}</StatusBadge>
                    <Text variant="small">{copy}</Text>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </WorkspacePageFrame>
  );
}

function ListenerTimelineUnlock() {
  return (
    <>
      <WorkspaceMetricGrid columns={4}>
        <MetricCard active label="Current mode" note="Listener-first account" value="Music" />
        <MetricCard label="Timeline access" note="Requires pro role" value="Locked" />
        <MetricCard label="Public events" note="Browse and save" value="Open" />
        <MetricCard label="Professional dates" note="After verification" value="Ready" />
      </WorkspaceMetricGrid>

      <WorkspaceCommandGrid>
        <WorkspaceCommandPanel
          active
          body="Public event and stream discovery remain available without professional workspace access."
          label="01 / Public layer"
          status={<StatusBadge status="unlocked">open</StatusBadge>}
          title="Browse events and streams"
        >
          <div className="mt-room-3 flex flex-wrap gap-room-2">
            <ButtonLink href="/events" size="sm" variant="primary">
              Events
            </ButtonLink>
            <ButtonLink href="/streams" size="sm" variant="secondary">
              Streams
            </ButtonLink>
          </div>
        </WorkspaceCommandPanel>
        <WorkspaceCommandPanel
          body="Accepted bookings, rider deadlines, deposit previews and conflicts appear after DJ, organizer or venue access is enabled."
          label="02 / Workspace layer"
          status={<StatusBadge status="locked">locked</StatusBadge>}
          title="Professional timeline"
        >
          <ButtonLink className="mt-room-3" href="/dashboard/settings?unlock=calendar" size="sm" variant="secondary">
            Open Settings
          </ButtonLink>
        </WorkspaceCommandPanel>
        <WorkspaceCommandPanel
          body="The strongest diploma flow is Track Moment -> Sound Reference -> Event Slot -> Booking Case -> Timeline Conflict."
          label="03 / Future flow"
          status={<StatusBadge status="waiting">next</StatusBadge>}
          title="Unlock when your role is ready"
        >
          <ButtonLink className="mt-room-3" href="/library" size="sm" variant="secondary">
            Sound Vault
          </ButtonLink>
        </WorkspaceCommandPanel>
      </WorkspaceCommandGrid>
    </>
  );
}

function CalendarCommandStrip({
  acceptedCount,
  conflictCount,
  nextItem,
  pendingCount
}: {
  acceptedCount: number;
  conflictCount: number;
  nextItem?: ScheduleItem;
  pendingCount: number;
}) {
  return (
    <WorkspaceCommandGrid>
      <WorkspaceCommandPanel
        active={conflictCount > 0}
        body="Same-date items are flagged before contract, rider or event publication."
        label="Conflict status"
        status={<StatusBadge status={conflictCount > 0 ? "waiting" : "done"}>{conflictCount > 0 ? "review" : "clear"}</StatusBadge>}
        title={conflictCount > 0 ? `${conflictCount} collision${conflictCount === 1 ? "" : "s"} detected` : "No date collisions"}
      />
      <WorkspaceCommandPanel
        active={pendingCount > 0}
        body="Booking requests should move into accept, decline, rider, contract, or escrow preview."
        label="Decision queue"
        status={<StatusBadge status={pendingCount > 0 ? "pending" : "done"}>{pendingCount}</StatusBadge>}
        title={pendingCount > 0 ? "Pending holds need attention" : "No pending holds"}
      />
      <WorkspaceCommandPanel
        body={nextItem ? [formatDate(nextItem.date), nextItem.type, nextItem.status].filter(Boolean).join(" / ") : "Create an event or booking to lock the first date."}
        label="Next locked object"
        status={<StatusBadge status={acceptedCount > 0 ? "accepted" : "draft"}>{acceptedCount} confirmed</StatusBadge>}
        title={nextItem?.title || "Timeline empty"}
      />
    </WorkspaceCommandGrid>
  );
}

function toDateKey(value: string) {
  return value.includes("T") ? value.split("T")[0] : value;
}

function offsetDate(value: string, days: number) {
  const base = new Date(value);
  if (Number.isNaN(base.getTime())) {
    return value;
  }

  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

function buildOperationalTimelineSections(schedule: ScheduleItem[], conflictDateSet: Set<string>) {
  const today = toDateKey(new Date().toISOString());
  const todayTime = new Date(today).getTime();
  const weekLimit = todayTime + 7 * 24 * 60 * 60 * 1000;
  const sections = [
    {
      id: "today",
      title: "Today",
      copy: "Immediate bookings, streams, rider deadlines and event moves.",
      items: [] as ScheduleItem[],
      status: "current"
    },
    {
      id: "week",
      title: "This Week",
      copy: "Near-term holds that need confirmation before the room is locked.",
      items: [] as ScheduleItem[],
      status: "pending"
    },
    {
      id: "upcoming",
      title: "Upcoming",
      copy: "Later bookings, event pages and streams that are not blocked today.",
      items: [] as ScheduleItem[],
      status: "waiting"
    },
    {
      id: "conflicts",
      title: "Conflicts",
      copy: "Same-day collisions before contract, rider or deposit lock.",
      items: [] as ScheduleItem[],
      status: "blocked"
    }
  ];

  schedule.forEach((item) => {
    const dateKey = item.date ? toDateKey(item.date) : "unscheduled";
    if (conflictDateSet.has(dateKey)) {
      sections[3].items.push(item);
      return;
    }

    if (dateKey === today) {
      sections[0].items.push(item);
      return;
    }

    const itemTime = dateKey === "unscheduled" ? Number.MAX_SAFE_INTEGER : new Date(dateKey).getTime();
    if (itemTime > todayTime && itemTime <= weekLimit) {
      sections[1].items.push(item);
      return;
    }

    sections[2].items.push(item);
  });

  return sections;
}

function TimelineSectionBlock({
  section
}: {
  section: {
    copy: string;
    id: string;
    items: ScheduleItem[];
    status: string;
    title: string;
  };
}) {
  const hasConflict = section.id === "conflicts";

  return (
    <div className={cx("border bg-black", hasConflict && section.items.length > 0 ? "border-warningOrange" : "border-roomBorder")}>
      <div className="grid gap-room-2 border-b border-roomBorder p-room-2 md:grid-cols-[150px_1fr_auto] md:items-center">
        <div>
          <Text variant="uiLabel">timeline lane</Text>
          <p className="room-safe-title mt-room-1 font-display text-xl uppercase text-paperWhite">
            {section.title}
          </p>
        </div>
        <Text variant="small">
          {section.copy}
        </Text>
        <StatusBadge status={section.items.length > 0 ? section.status : "done"}>
          {section.items.length || "clear"}
        </StatusBadge>
      </div>
      {section.items.length === 0 ? (
        <div className="p-room-2">
          <Text variant="small">No operational objects in this lane.</Text>
        </div>
      ) : (
        <div className="divide-y divide-roomBorder">
          {section.items.map((item) => (
            <ScheduleRow hasConflict={hasConflict} item={item} key={`${section.id}-${item.type}-${item.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleRow({ hasConflict, item }: { hasConflict: boolean; item: ScheduleItem }) {
  return (
    <Link
      className={cx(
        "grid min-w-0 gap-room-3 p-room-2 transition md:grid-cols-[120px_minmax(0,1fr)_minmax(160px,220px)_auto] md:items-center",
        hasConflict ? "bg-inkPanel hover:bg-[#211107]" : "bg-panelBlack hover:bg-inkPanel"
      )}
      href={item.href}
    >
      <div>
        <Text variant="uiLabel">{item.type}</Text>
        <p className="mt-room-1 font-mono text-[10px] uppercase text-mutedText">{formatDate(item.date)}</p>
      </div>
      <div className="min-w-0">
        <Text as="h3" className="room-clamp-2 text-lg" variant="title">
          {item.title}
        </Text>
        <Text className="room-one-line mt-room-1" variant="mono">
          {item.meta || "No metadata"}
        </Text>
        <div className="mt-room-2 flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="max-w-full truncate border border-roomBorder px-2 py-1 font-mono text-[9px] uppercase text-mutedText">
            {item.context}
          </span>
          {hasConflict ? (
            <span className="border border-warningOrange px-2 py-1 font-mono text-[9px] uppercase text-warningOrange">
              same date
            </span>
          ) : null}
        </div>
      </div>
      <Text className="room-clamp-3" variant="small">{item.action || getOperationalAction(item)}</Text>
      <StatusBadge status={hasConflict ? "waiting" : item.status}>{hasConflict ? "conflict" : item.status}</StatusBadge>
    </Link>
  );
}

function getBookingTimelineContext(booking: Booking) {
  if (booking.source_slot_id) {
    return "Event Desk slot";
  }

  if (booking.source_event_id) {
    return "Event Desk request";
  }

  if (booking.source_saved_moment_id || booking.source_work_id || typeof booking.source_timestamp_seconds === "number") {
    return "Atmosphere brief";
  }

  return "Direct booking";
}

function getBookingTimelineAction(booking: Booking) {
  if (booking.status === "pending") {
    return booking.source_slot_id
      ? "Review the lineup slot, then accept, decline, or request changes."
      : "Decide the request or move it into negotiation.";
  }

  if (booking.status === "accepted") {
    return "Lock rider, contract, calendar hold, and escrow preview.";
  }

  if (booking.status === "declined") {
    return "Archived decision. Keep the date free unless another hold exists.";
  }

  if (booking.status === "cancelled") {
    return "Cancelled request. Check event lineup and budget recovery.";
  }

  if (booking.status === "paid" || booking.status === "completed") {
    return "Confirmed commercial record. Keep timeline for reporting.";
  }

  return "Open case file for next operational move.";
}

function getOperationalAction(item: ScheduleItem) {
  if (item.type === "booking" && item.status === "pending") {
    return "Accept, decline, or request changes.";
  }

  if (item.type === "booking" && item.status === "accepted") {
    return "Lock rider, contract and production details.";
  }

  if (item.type === "event" && item.status === "draft") {
    return "Complete lineup, poster and event page.";
  }

  if (item.type === "event" && item.status === "public") {
    return "Monitor lineup, tickets and stream context.";
  }

  if (item.type === "stream" && item.status === "live") {
    return "Keep live proof visible for booking trust.";
  }

  if (item.type === "stream" && item.status === "upcoming") {
    return "Prepare room, thumbnail and reminder.";
  }

  if (item.type === "deadline" && item.status === "blocked") {
    return "Upload rider, confirm production, or move the case date.";
  }

  if (item.type === "deadline" && item.status === "pending") {
    return "Prepare deposit preview and payout timeline.";
  }

  return "Open object for next operational step.";
}
