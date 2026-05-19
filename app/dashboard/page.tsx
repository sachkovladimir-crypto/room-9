"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { MissingConfigNotice } from "@/components/AuthNotice";
import { ButtonLink, MetricCard, Panel, SectionHeader, StatusBadge, Text, cx } from "@/components/room9-ui";
import {
  WorkspaceCommandPanel,
  WorkspaceMetricGrid,
  WorkspaceNotice,
  WorkspaceOpsHeader,
  WorkspacePageFrame
} from "@/components/workspace/WorkspaceShell";
import { formatDate, formatPrice } from "@/lib/format";
import { readVaultSavedMoments, readVaultSavedTrackIds, type VaultSavedMoment } from "@/lib/soundVault";
import {
  formatSupabaseError,
  getSupabase,
  hasSupabaseConfig,
  isMissingAuthSession,
  logSupabaseError,
  withSupabaseTimeout
} from "@/lib/supabase";
import { loadRoleAccess } from "@/lib/roleAccess";
import {
  hasRoleAccess,
  isBookingClientRole,
  type Booking,
  type DjProfile,
  type EventPost,
  type Notification,
  type OrganizerProfile,
  type Profile,
  type Role,
  type VenueProfile,
  type Work
} from "@/lib/types";

type TimelineItem = {
  id: string;
  type: "booking" | "event";
  date: string | null;
  title: string;
  meta: string;
  status: string;
  href: string;
};

type NextAction = {
  label: string;
  body: string;
  status: string;
  href: string;
  action: string;
  active?: boolean;
};

type QuickAction = {
  copy: string;
  href: string;
  label: string;
  locked?: boolean;
  title: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeRoles, setActiveRoles] = useState<Role[]>(["listener"]);
  const [djProfile, setDjProfile] = useState<DjProfile | null>(null);
  const [organizerProfile, setOrganizerProfile] = useState<OrganizerProfile | null>(null);
  const [venueProfile, setVenueProfile] = useState<VenueProfile | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [events, setEvents] = useState<EventPost[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [savedMoments, setSavedMoments] = useState<VaultSavedMoment[]>([]);
  const [savedTrackIds, setSavedTrackIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      return;
    }

    loadDashboard();
  }, []);

  async function loadDashboard() {
    setIsLoading(true);
    setError("");
    setNotice("");

    try {
      const supabase = getSupabase();
      const { data: sessionData, error: userError } = await withSupabaseTimeout(
        supabase.auth.getSession(),
        "Dashboard auth check"
      );

      if (userError) {
        if (isMissingAuthSession(userError)) {
          router.push("/login?next=/dashboard");
          return;
        }

        logSupabaseError("Dashboard auth user load failed", userError);
        setError(formatSupabaseError(userError, "Could not load the current user."));
        return;
      }

      const user = sessionData.session?.user ?? null;
      if (!user) {
        router.push("/login?next=/dashboard");
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError || !profileData) {
        if (profileError) {
          logSupabaseError("Dashboard profile load failed", profileError);
        }
        setError(
          profileError
            ? formatSupabaseError(profileError, "Could not load the ROOM_9 profile row.")
            : "No profile row found for this user. Re-run supabase/schema.sql, then log out and register/login again."
        );
        return;
      }

      const loadedProfile = profileData as Profile;
      setProfile(loadedProfile);
      const loadedRoles = await loadRoleAccess(supabase, loadedProfile.id, loadedProfile.role);
      setActiveRoles(loadedRoles);

      const [{ data: notificationData, error: notificationError }, nextSavedTracks, nextSavedMoments] =
        await Promise.all([
          supabase
            .from("notifications")
            .select("*")
            .eq("user_id", loadedProfile.id)
            .order("created_at", { ascending: false })
            .limit(5),
          readVaultSavedTrackIds(loadedProfile.id),
          readVaultSavedMoments(loadedProfile.id)
        ]);

      if (notificationError) {
        logSupabaseError("Dashboard notifications load failed", notificationError);
      }

      setNotifications(((notificationData as Notification[]) ?? []).slice(0, 5));
      setSavedTrackIds(nextSavedTracks);
      setSavedMoments(nextSavedMoments);

      if (hasRoleAccess(loadedRoles, ["dj"])) {
        setOrganizerProfile(null);
        setVenueProfile(null);
        await loadDjCommandCenter(loadedProfile.id);
      } else if (isBookingClientRole(loadedRoles)) {
        setDjProfile(null);
        setWorks([]);
        await loadOrganizerCommandCenter(loadedProfile);
      } else {
        setDjProfile(null);
        setOrganizerProfile(null);
        setVenueProfile(null);
        setBookings([]);
        setWorks([]);
        setEvents([]);
      }
    } catch (caughtError) {
      logSupabaseError("Dashboard unexpected load failure", caughtError);
      setError(formatSupabaseError(caughtError, "Could not load dashboard."));
    } finally {
      setIsLoading(false);
    }
  }

  async function loadDjCommandCenter(userId: string) {
    const supabase = getSupabase();
    const { data: djData, error: djError } = await supabase
      .from("dj_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (djError) {
      logSupabaseError("Command center DJ profile load failed", djError);
      setNotice("DJ profile is not complete yet. Open Settings to unlock full workspace signals.");
      setDjProfile(null);
      setBookings([]);
      setWorks([]);
      setEvents([]);
      return;
    }

    const loadedDj = (djData as DjProfile | null) ?? null;
    setDjProfile(loadedDj);

    if (!loadedDj) {
      setBookings([]);
      setWorks([]);
      setEvents([]);
      return;
    }

    const [{ data: bookingData, error: bookingError }, { data: workData, error: workError }] =
      await Promise.all([
        supabase
          .from("bookings")
          .select("*")
          .eq("dj_id", loadedDj.id)
          .order("created_at", { ascending: false })
          .limit(12),
        supabase
          .from("works")
          .select("*")
          .eq("dj_id", loadedDj.id)
          .order("created_at", { ascending: false })
          .limit(12)
      ]);

    if (bookingError) {
      logSupabaseError("Command center DJ bookings load failed", bookingError);
      setNotice("Booking cases could not be loaded. Booking CRM may need a schema/RLS check.");
    }

    if (workError) {
      logSupabaseError("Command center DJ works load failed", workError);
      setNotice("Track signals could not be loaded. Sound Vault may need a schema/RLS check.");
    }

    setBookings(((bookingData as Booking[]) ?? []).slice(0, 12));
    setWorks(((workData as Work[]) ?? []).filter((work) => !work.is_deleted).slice(0, 12));
    setEvents([]);
  }

  async function loadOrganizerCommandCenter(loadedProfile: Profile) {
    const supabase = getSupabase();
    const [
      { data: bookingData, error: bookingError },
      { data: eventData, error: eventError },
      { data: organizerData, error: organizerError },
      { data: venueData, error: venueError }
    ] =
      await Promise.all([
        supabase
          .from("bookings")
          .select("*")
          .eq("organizer_id", loadedProfile.id)
          .order("created_at", { ascending: false })
          .limit(12),
        supabase
          .from("events")
          .select("*")
          .eq("organizer_id", loadedProfile.id)
          .order("event_date", { ascending: true })
          .limit(12),
        supabase.from("organizer_profiles").select("*").eq("user_id", loadedProfile.id).maybeSingle(),
        supabase.from("venue_profiles").select("*").eq("user_id", loadedProfile.id).maybeSingle()
      ]);

    if (bookingError) {
      logSupabaseError("Command center organizer bookings load failed", bookingError);
      setNotice("Booking cases could not be loaded. Booking CRM may need a schema/RLS check.");
    }

    if (eventError) {
      logSupabaseError("Command center organizer events load failed", eventError);
      setNotice("Events could not be loaded. Event Desk may need a schema/RLS check.");
    }

    if (organizerError) {
      logSupabaseError("Command center organizer profile load failed", organizerError);
    }

    if (venueError) {
      logSupabaseError("Command center venue profile load failed", venueError);
    }

    setDjProfile(null);
    setWorks([]);
    setOrganizerProfile((organizerData as OrganizerProfile | null) ?? null);
    setVenueProfile((venueData as VenueProfile | null) ?? null);
    setBookings(((bookingData as Booking[]) ?? []).slice(0, 12));
    setEvents(((eventData as EventPost[]) ?? []).slice(0, 12));
  }

  async function handleLogout() {
    try {
      const supabase = getSupabase();
      const { error: logoutError } = await supabase.auth.signOut();
      if (logoutError) {
        logSupabaseError("Dashboard logout failed", logoutError);
      }
      router.push("/");
      router.refresh();
    } catch (caughtError) {
      logSupabaseError("Dashboard logout unexpected failure", caughtError);
    }
  }

  const pendingCount = useMemo(
    () => bookings.filter((booking) => booking.status === "pending").length,
    [bookings]
  );
  const acceptedCount = useMemo(
    () => bookings.filter((booking) => booking.status === "accepted").length,
    [bookings]
  );
  const soundRefCount = useMemo(
    () => bookings.filter((booking) => booking.source_work_id || booking.source_timestamp_label).length,
    [bookings]
  );
  const timeline = useMemo(() => buildTimeline(bookings, events), [bookings, events]);
  const conflicts = useMemo(() => getConflictGroups(timeline), [timeline]);
  const nextTimelineItem = useMemo(() => getNextTimelineItem(timeline), [timeline]);
  const readiness = getCommandReadiness(profile, activeRoles, djProfile, organizerProfile, venueProfile, works, events, savedMoments);
  const commandRole = getCommandRole(profile?.role ?? "listener", activeRoles);
  const identity =
    djProfile?.stage_name ||
    organizerProfile?.organization_name ||
    venueProfile?.venue_name ||
    profile?.email ||
    "ROOM_9";
  const nextActions = useMemo(
    () =>
      buildNextActions({
        acceptedCount,
        activeRoles,
        bookings,
        conflicts,
        events,
        savedMoments,
        works
      }),
    [acceptedCount, activeRoles, bookings, conflicts, events, savedMoments, works]
  );

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
          <EmptyState title="Dashboard error" message={error} href="/login" action="Login" />
        </section>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="room-page">
        <section className="room-shell py-12">
          <EmptyState title="Dashboard unavailable" message="Log in again to continue." href="/login" action="Login" />
        </section>
      </main>
    );
  }

  const copy = getCommandCopy(commandRole);
  const professionalUnlocked = hasRoleAccess(activeRoles, ["dj", "organizer", "venue", "admin"]);
  const estimatedRevenue =
    commandRole === "dj"
      ? acceptedCount * (Number(djProfile?.price) || 0)
      : events.reduce((total, event) => total + (Number(event.budget) || 0), 0);

  return (
    <WorkspacePageFrame
      active="dashboard"
      email={profile.email}
      pendingCount={pendingCount}
      profileLabel={identity}
      readiness={readiness}
      role={activeRoles}
      onLogout={handleLogout}
    >
      <div className="px-room-3 py-room-3 xl:px-room-4">
        <WorkspaceOpsHeader
          actions={
            <>
              <ButtonLink href="/library" variant="primary">
                Open Vault
              </ButtonLink>
              <ButtonLink
                href={professionalUnlocked ? "/dashboard/bookings" : "/dashboard/settings?unlock=bookings"}
                variant="secondary"
              >
                {professionalUnlocked ? "Booking CRM" : "Unlock CRM"}
              </ButtonLink>
            </>
          }
          description={copy.description}
          eyebrow={copy.eyebrow}
          meta={<StatusBadge status="live">System online</StatusBadge>}
          title={copy.title}
        />

        {error ? <WorkspaceNotice tone="error">{error}</WorkspaceNotice> : null}
        {notice ? <WorkspaceNotice tone="neutral">{notice}</WorkspaceNotice> : null}

        <WorkspaceMetricGrid>
          <MetricCard active label="System" note={copy.mode} value="Online" />
          <MetricCard active={pendingCount > 0} label="Pending cases" note="Need decision" value={pendingCount} />
          <MetricCard label="Sound refs" note="Atmosphere briefs" value={savedMoments.length} />
          <MetricCard label="Vault tracks" note="Saved / uploaded" value={savedTrackIds.length + works.length} />
          <MetricCard active={conflicts.length > 0} label="Conflicts" note="Date collisions" value={conflicts.length} />
          <MetricCard label="Value signal" note={commandRole === "dj" ? "Accepted fees" : "Event budgets"} value={formatPrice(estimatedRevenue)} />
        </WorkspaceMetricGrid>

        <section className="mt-room-4 grid gap-room-4 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-room-4">
            <TodayPanel
              activeRoles={activeRoles}
              nextItem={nextTimelineItem}
              pendingCount={pendingCount}
              profile={profile}
              readiness={readiness}
              savedMoments={savedMoments.length}
            />
            <ProfileUnlockProgress
              activeRoles={activeRoles}
              djProfile={djProfile}
              events={events}
              savedMoments={savedMoments.length}
              works={works}
            />
            <NextActionsPanel actions={nextActions} />
            <ActiveBookingCases bookings={bookings} soundRefCount={soundRefCount} />
          </div>

          <div className="space-y-room-4">
            <RecentSavedMoments moments={savedMoments} />
            <EventConflictPanel conflicts={conflicts} />
            <NotificationsFeed notifications={notifications} />
          </div>
        </section>

        <QuickActionsGrid role={activeRoles} />
      </div>
    </WorkspacePageFrame>
  );
}

function ProfileUnlockProgress({
  djProfile,
  events,
  activeRoles,
  savedMoments,
  works
}: {
  djProfile: DjProfile | null;
  events: EventPost[];
  activeRoles: Role[];
  savedMoments: number;
  works: Work[];
}) {
  const steps =
    hasRoleAccess(activeRoles, ["dj"])
      ? [
          { label: "Complete DJ profile", done: Boolean(djProfile?.stage_name && djProfile?.genres && djProfile?.city) },
          { label: "Upload first track", done: works.length > 0 },
          { label: "Add cover artwork", done: works.some((work) => work.cover_image) || Boolean(djProfile?.cover_image_url) },
          { label: "Unlock analytics", done: works.length > 0 && savedMoments > 0 },
          { label: "Unlock booking trust", done: Boolean(djProfile?.price && djProfile?.avatar_url && works.length > 0) }
        ]
      : isBookingClientRole(activeRoles)
        ? [
            { label: "Complete client profile", done: true },
            { label: "Save first sound reference", done: savedMoments > 0 },
            { label: "Create first event", done: events.length > 0 },
            { label: "Attach lineup slot", done: events.some((event) => Boolean(event.lineup)) },
            { label: "Unlock case workflow", done: events.length > 0 && savedMoments > 0 }
          ]
        : [
            { label: "Start as listener", done: true },
            { label: "Save first track", done: savedMoments > 0 },
            { label: "Choose role path", done: false },
            { label: "Unlock workspace tools", done: false },
            { label: "Create atmosphere brief", done: false }
          ];
  const completed = steps.filter((step) => step.done).length;

  return (
    <Panel className="p-room-3">
      <div className="flex flex-wrap items-start justify-between gap-room-3">
        <SectionHeader eyebrow="Profile unlock" title="Capability Progress" />
        <StatusBadge status={completed === steps.length ? "accepted" : "waiting"}>
          {completed}/{steps.length}
        </StatusBadge>
      </div>
      <div className="mt-room-3 grid gap-room-2 md:grid-cols-5">
        {steps.map((step, index) => (
          <div
            className={cx(
              "border p-room-2",
              step.done ? "border-acidGreen bg-[#101700]" : "border-roomBorder bg-black"
            )}
            key={step.label}
          >
            <div className="flex items-center justify-between gap-room-2">
              <span className={cx("font-mono text-[10px] font-black uppercase", step.done ? "text-acidGreen" : "text-mutedText")}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className={cx("h-2 w-2 border", step.done ? "border-acidGreen bg-acidGreen" : "border-roomBorder")} />
            </div>
            <p className="room-clamp-2 mt-room-2 font-mono text-[10px] uppercase leading-4 text-paperWhite">{step.label}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function TodayPanel({
  activeRoles,
  nextItem,
  pendingCount,
  profile,
  readiness,
  savedMoments
}: {
  activeRoles: Role[];
  nextItem?: TimelineItem;
  pendingCount: number;
  profile: Profile;
  readiness: number;
  savedMoments: number;
}) {
  return (
    <Panel className="p-room-3">
      <div className="grid gap-room-3 xl:grid-cols-[minmax(0,1fr)_220px] xl:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-room-2">
            <Text variant="uiLabel">Today / System Status</Text>
            <StatusBadge status={pendingCount > 0 ? "pending" : "accepted"}>
              {pendingCount > 0 ? "action needed" : "clear"}
            </StatusBadge>
          </div>
          <Text as="h2" className="mt-room-3 max-w-3xl text-3xl leading-none md:text-5xl" variant="title">
            Command Center
          </Text>
          <Text className="mt-room-3 max-w-2xl" variant="small">
            One operational snapshot for listening signals, sound references, booking cases, event movement and role readiness.
          </Text>
        </div>

        <div className="border border-roomBorder bg-voidBlack p-room-3">
          <Text variant="uiLabel">Current role</Text>
          <Text as="p" className="mt-room-2 text-2xl" variant="title">
              {getCommandRole(profile.role, activeRoles)}
          </Text>
          <div className="mt-room-3 flex items-center justify-between gap-room-2 font-mono text-[10px] uppercase text-mutedText">
            <span>Readiness</span>
            <span className="text-paperWhite">{readiness}%</span>
          </div>
          <div className="mt-2 h-1 border border-roomBorder bg-panelBlack">
            <div className="h-full bg-acidGreen" style={{ width: `${readiness}%` }} />
          </div>
        </div>
      </div>

      <div className="mt-room-4 grid gap-px bg-roomBorder md:grid-cols-3">
        <SignalCell label="Next dated item" value={nextItem ? formatDate(nextItem.date) : "No date"} />
        <SignalCell label="Current object" value={nextItem?.title ?? "No active timeline"} />
        <SignalCell label="Saved evidence" value={`${savedMoments} moments`} />
      </div>
    </Panel>
  );
}

function NextActionsPanel({ actions }: { actions: NextAction[] }) {
  return (
    <Panel className="p-room-3">
      <SectionHeader eyebrow="What should I do next?" title="Next Actions" />
      <div className="mt-room-3 grid gap-room-2 md:grid-cols-2">
        {actions.map((action) => (
          <WorkspaceCommandPanel
            active={action.active}
            body={action.body}
            key={action.label}
            label={action.label}
            status={<StatusBadge status={action.status}>{action.status}</StatusBadge>}
            title={action.action}
          >
            <ButtonLink className="mt-room-3" href={action.href} size="sm" variant={action.active ? "primary" : "secondary"}>
              Open
            </ButtonLink>
          </WorkspaceCommandPanel>
        ))}
      </div>
    </Panel>
  );
}

function ActiveBookingCases({
  bookings,
  soundRefCount
}: {
  bookings: Booking[];
  soundRefCount: number;
}) {
  const activeCases = bookings
    .filter((booking) => booking.status !== "declined" && booking.status !== "cancelled")
    .slice(0, 5);

  return (
    <Panel className="p-room-3">
      <div className="flex flex-wrap items-start justify-between gap-room-3">
        <SectionHeader eyebrow="Professional layer" title="Active Booking Cases" />
        <StatusBadge status={soundRefCount > 0 ? "selected" : "draft"}>{soundRefCount} sound refs</StatusBadge>
      </div>

      <div className="mt-room-3 border-t border-roomBorder">
        {activeCases.length === 0 ? (
          <div className="py-room-4">
            <Text variant="small">No active cases yet. Save a sound reference, open an artist dossier, then create a request.</Text>
            <ButtonLink className="mt-room-3" href="/explore" size="sm" variant="primary">
              Start Discovery
            </ButtonLink>
          </div>
        ) : (
          activeCases.map((booking) => (
            <Link
              className="grid gap-room-2 border-b border-roomBorder py-room-3 transition hover:bg-inkPanel md:grid-cols-[1fr_150px_100px_auto] md:items-center"
              href={`/booking/details/${booking.id}`}
              key={booking.id}
            >
              <div className="min-w-0">
                <p className="truncate font-display text-lg uppercase text-paperWhite">{booking.venue_name}</p>
                <p className="mt-1 truncate font-mono text-[10px] uppercase text-mutedText">
                  {[booking.city, booking.event_type].filter(Boolean).join(" / ")}
                </p>
              </div>
              <p className="font-mono text-[10px] uppercase text-mutedText">{formatDate(booking.event_date)}</p>
              <StatusBadge status={booking.status}>{booking.status}</StatusBadge>
              <span className="font-mono text-[10px] uppercase text-acidGreen">
                {booking.source_timestamp_label ? `Moment ${booking.source_timestamp_label}` : "Open case"}
              </span>
            </Link>
          ))
        )}
      </div>
    </Panel>
  );
}

function RecentSavedMoments({ moments }: { moments: VaultSavedMoment[] }) {
  return (
    <Panel className="p-room-3">
      <div className="flex items-start justify-between gap-room-3">
        <SectionHeader eyebrow="Music first" title="Recent Sound References" />
        <ButtonLink href="/library" size="sm" variant="ghost">
          Vault
        </ButtonLink>
      </div>
      <div className="mt-room-3 space-y-room-2">
        {moments.length === 0 ? (
          <div className="border border-roomBorder p-room-3">
            <Text variant="small">No saved references yet. The next strong flow is Explore to Track to Save Reference to Vault.</Text>
            <ButtonLink className="mt-room-3" href="/explore" size="sm" variant="primary">
              Explore Sounds
            </ButtonLink>
          </div>
        ) : (
          moments.slice(0, 4).map((moment) => (
            <Link
              className="block border border-roomBorder p-room-2 transition hover:border-paperWhite"
              href={`/track/${moment.trackId}`}
              key={moment.id}
            >
              <div className="flex items-start justify-between gap-room-2">
                <div className="min-w-0">
                  <p className="truncate font-display text-base uppercase text-paperWhite">{moment.trackTitle}</p>
                  <p className="mt-1 truncate font-mono text-[10px] uppercase text-mutedText">
                    {[moment.artist, moment.bpm ? `${moment.bpm} BPM` : "", moment.roomType].filter(Boolean).join(" / ")}
                  </p>
                </div>
                <StatusBadge status="selected">{moment.timestampLabel}</StatusBadge>
              </div>
            </Link>
          ))
        )}
      </div>
    </Panel>
  );
}

function EventConflictPanel({ conflicts }: { conflicts: Array<{ date: string; items: TimelineItem[] }> }) {
  return (
    <Panel className="p-room-3">
      <div className="flex items-start justify-between gap-room-3">
        <SectionHeader eyebrow="What is blocked?" title="Event Conflicts" />
        <StatusBadge status={conflicts.length > 0 ? "blocked" : "done"}>
          {conflicts.length > 0 ? `${conflicts.length} conflict` : "clear"}
        </StatusBadge>
      </div>
      <div className="mt-room-3 space-y-room-2">
        {conflicts.length === 0 ? (
          <Text variant="small">No timeline collisions detected between active events and booking dates.</Text>
        ) : (
          conflicts.slice(0, 3).map((group) => (
            <div className="border border-warningOrange p-room-2" key={group.date}>
              <p className="font-mono text-[10px] uppercase text-warningOrange">{formatDate(group.date)}</p>
              <div className="mt-room-2 space-y-1">
                {group.items.map((item) => (
                  <Link className="block truncate text-sm text-paperWhite hover:text-acidGreen" href={item.href} key={item.id}>
                    {item.title}
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

function NotificationsFeed({ notifications }: { notifications: Notification[] }) {
  return (
    <Panel className="p-room-3">
      <div className="flex items-start justify-between gap-room-3">
        <SectionHeader eyebrow="What changed?" title="Notifications" />
        <StatusBadge status={notifications.length > 0 ? "live" : "neutral"}>{notifications.length}</StatusBadge>
      </div>
      <div className="mt-room-3 space-y-room-2">
        {notifications.length === 0 ? (
          <Text variant="small">No new system updates. Booking accepted, new message, conflict and saved-track alerts will land here.</Text>
        ) : (
          notifications.slice(0, 4).map((notification) => (
            <div className={cx("border p-room-2", notification.is_read ? "border-roomBorder" : "border-acidGreen") } key={notification.id}>
              <p className="font-display text-base uppercase text-paperWhite">{notification.title || "ROOM_9 update"}</p>
              <p className="mt-1 text-sm leading-5 text-mutedText">{notification.body || "System notification."}</p>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

function QuickActionsGrid({ role }: { role: Profile["role"] | Role[] }) {
  const actions = getQuickActions(role);

  return (
    <section className="mt-room-4">
      <SectionHeader eyebrow="Workspace routing" title="Quick Actions" />
      <div className="mt-room-3 grid gap-room-2 md:grid-cols-2 xl:grid-cols-3">
        {actions.map((action) => (
          <Link
            className={cx(
              "border bg-panelBlack p-room-3 transition hover:bg-inkPanel",
              action.locked ? "border-roomBorder text-mutedText hover:border-warningOrange" : "border-roomBorder hover:border-paperWhite"
            )}
            href={action.href}
            key={`${action.title}-${action.href}`}
          >
            <div className="flex items-start justify-between gap-room-2">
              <p className={cx("font-mono text-[10px] uppercase", action.locked ? "text-warningOrange" : "text-acidGreen")}>
                {action.label}
              </p>
              <StatusBadge status={action.locked ? "locked" : "unlocked"}>{action.locked ? "locked" : "open"}</StatusBadge>
            </div>
            <p className={cx("mt-room-2 font-display text-xl uppercase", action.locked ? "text-mutedText" : "text-paperWhite")}>
              {action.title}
            </p>
            <Text className="mt-room-2" variant="small">
              {action.copy}
            </Text>
          </Link>
        ))}
      </div>
    </section>
  );
}

function getQuickActions(role: Profile["role"] | Role[]): QuickAction[] {
  const baseActions: QuickAction[] = [
    {
      copy: "Public discovery surface for tracks, DJs, sets and atmosphere briefs.",
      href: "/explore",
      label: "Music discovery",
      title: "Explore Sounds"
    },
    {
      copy: "Saved tracks, liked music, playlists, queue and booking-ready moments.",
      href: "/library",
      label: "Music system",
      title: "Sound Vault"
    }
  ];

  if (hasRoleAccess(role, ["dj"])) {
    return [
      ...baseActions,
      {
        copy: "Incoming offers, sound references, rider blockers and escrow preview.",
        href: "/dashboard/bookings",
        label: "DJ tools",
        title: "Booking CRM"
      },
      {
        copy: "Accepted dates, rider deadlines, stream dates and conflicts.",
        href: "/dashboard/calendar",
        label: "Operations",
        title: "Timeline"
      },
      {
        copy: "Live rooms, scheduled broadcasts and stream archive management.",
        href: "/dashboard/streams",
        label: "Broadcast",
        title: "Streams"
      },
      {
        copy: "Profile editing, public dossier readiness and role access.",
        href: "/dashboard/settings",
        label: "Profile",
        title: "Settings"
      }
    ];
  }

  if (hasRoleAccess(role, ["organizer", "venue"])) {
    const venueMode = hasRoleAccess(role, ["venue"]);
    return [
      ...baseActions,
      {
        copy: "Create events, attach saved sound references and build lineup slots.",
        href: "/dashboard/events",
        label: venueMode ? "Room programming" : "Lineup desk",
        title: "Event Desk"
      },
      {
        copy: "Sent artist requests, replies, case files, rider status and escrow preview.",
        href: "/dashboard/bookings",
        label: "Client tools",
        title: "Booking CRM"
      },
      {
        copy: "Event dates, booking holds, rider deadlines, deposit preview and conflicts.",
        href: "/dashboard/calendar",
        label: "Operations",
        title: "Timeline"
      },
      {
        copy: "Profile editing, venue or organizer identity and role access.",
        href: "/dashboard/settings",
        label: "Profile",
        title: "Settings"
      }
    ];
  }

  return [
    ...baseActions,
    {
      copy: "Unlock DJ verification, organizer tools, or venue operations when your profile is ready.",
      href: "/dashboard/settings?unlock=role",
      label: "Next unlock",
      title: "Role Verification"
    },
    {
      copy: "Professional case files appear after DJ, organizer, or venue access is enabled.",
      href: "/dashboard/settings?unlock=bookings",
      label: "Professional layer",
      locked: true,
      title: "Booking CRM"
    },
    {
      copy: "Lineup slots and event publishing open for organizer and venue profiles.",
      href: "/dashboard/settings?unlock=events",
      label: "Organizer / Venue",
      locked: true,
      title: "Event Desk"
    },
    {
      copy: "Operational timeline opens after professional access is enabled.",
      href: "/dashboard/settings?unlock=calendar",
      label: "Operations",
      locked: true,
      title: "Timeline"
    }
  ];
}

function SignalCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-voidBlack p-room-3">
      <Text variant="uiLabel">{label}</Text>
      <p className="mt-room-2 truncate font-display text-xl uppercase text-paperWhite">{value}</p>
    </div>
  );
}

function buildTimeline(bookings: Booking[], events: EventPost[]): TimelineItem[] {
  const bookingItems = bookings.map((booking) => ({
    id: booking.id,
    type: "booking" as const,
    date: booking.event_date,
    title: booking.venue_name || "Booking request",
    meta: [booking.city, booking.event_type].filter(Boolean).join(" / "),
    status: booking.status,
    href: `/booking/details/${booking.id}`
  }));

  const eventItems = events.map((event) => ({
    id: event.id,
    type: "event" as const,
    date: event.event_date,
    title: event.title || "Event page",
    meta: [event.venue_name, event.city, event.event_type].filter(Boolean).join(" / "),
    status: event.status || "draft",
    href: `/events/${event.id}`
  }));

  return [...bookingItems, ...eventItems].sort((left, right) => {
    const leftTime = left.date ? new Date(left.date).getTime() : Number.MAX_SAFE_INTEGER;
    const rightTime = right.date ? new Date(right.date).getTime() : Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime;
  });
}

function getConflictGroups(timeline: TimelineItem[]) {
  const byDate = timeline.reduce<Record<string, TimelineItem[]>>((acc, item) => {
    if (!item.date) {
      return acc;
    }
    const key = toDateKey(item.date);
    acc[key] = [...(acc[key] ?? []), item];
    return acc;
  }, {});

  return Object.entries(byDate)
    .filter(([, items]) => items.length > 1)
    .map(([date, items]) => ({ date, items }));
}

function getNextTimelineItem(timeline: TimelineItem[]) {
  return timeline.find((item) => item.date && new Date(item.date).getTime() >= Date.now()) ?? timeline[0];
}

function buildNextActions({
  acceptedCount,
  activeRoles,
  bookings,
  conflicts,
  events,
  savedMoments,
  works
}: {
  acceptedCount: number;
  activeRoles: Role[];
  bookings: Booking[];
  conflicts: Array<{ date: string; items: TimelineItem[] }>;
  events: EventPost[];
  savedMoments: VaultSavedMoment[];
  works: Work[];
}): NextAction[] {
  const pendingCount = bookings.filter((booking) => booking.status === "pending").length;
  const missingCovers = works.filter((work) => !work.cover_image).length;
  const isDj = hasRoleAccess(activeRoles, ["dj"]);
  const isClient = isBookingClientRole(activeRoles);
  const isProfessional = hasRoleAccess(activeRoles, ["dj", "organizer", "venue", "admin"]);

  const actions: NextAction[] = [
    {
      label: !isProfessional ? "Professional access" : pendingCount > 0 ? "Booking decision" : "Booking pipeline",
      body:
        !isProfessional
          ? "Booking CRM unlocks after DJ, organizer, or venue verification."
          : pendingCount > 0
          ? `${pendingCount} case${pendingCount === 1 ? "" : "s"} require a decision.`
          : "Open the CRM to inspect lifecycle states and escrow preview.",
      status: !isProfessional ? "locked" : pendingCount > 0 ? "pending" : "waiting",
      href: isProfessional ? "/dashboard/bookings" : "/dashboard/settings?unlock=bookings",
      action: !isProfessional ? "Unlock CRM" : pendingCount > 0 ? "Review cases" : "Open CRM",
      active: pendingCount > 0
    },
    {
      label: savedMoments.length > 0 ? "Saved atmosphere briefs" : "Music discovery",
      body:
        savedMoments.length > 0
          ? "Turn a saved timestamp into a booking request or lineup slot."
          : "Find a track, select a moment, and save it into your Vault.",
      status: savedMoments.length > 0 ? "selected" : "draft",
      href: savedMoments.length > 0 ? "/library" : "/explore",
      action: savedMoments.length > 0 ? "Open Vault" : "Find sound",
      active: savedMoments.length > 0
    },
    {
      label: conflicts.length > 0 ? "Timeline conflict" : "Calendar status",
      body:
        !isProfessional
          ? "Operational timeline unlocks after DJ, organizer, or venue verification."
          : conflicts.length > 0
          ? "One or more dates have overlapping event or booking objects."
          : "Operational timeline is clear. Check upcoming holds and stream dates.",
      status: !isProfessional ? "locked" : conflicts.length > 0 ? "blocked" : "done",
      href: isProfessional ? "/dashboard/calendar" : "/dashboard/settings?unlock=calendar",
      action: isProfessional ? "Open timeline" : "Unlock timeline",
      active: conflicts.length > 0
    }
  ];

  if (isDj) {
    actions.push({
      label: missingCovers > 0 ? "Library health" : "Track performance",
      body:
        missingCovers > 0
          ? `${missingCovers} track${missingCovers === 1 ? "" : "s"} need cover art before they feel release-ready.`
          : `${works.length} track${works.length === 1 ? "" : "s"} loaded. Track performance now lives in Analytics.`,
      status: missingCovers > 0 ? "waiting" : "verified",
      href: missingCovers > 0 ? "/library" : "/dashboard/analytics",
      action: missingCovers > 0 ? "Fix Vault" : "View signals",
      active: missingCovers > 0
    });
  } else if (isClient) {
    actions.push({
      label: events.length > 0 ? "Event Desk" : "Create event",
      body:
        events.length > 0
          ? "Attach saved references to Opening / Support / Peak / Closing / Stream slots."
          : "Create an event before sending lineup-based booking requests.",
      status: events.length > 0 ? "current" : "draft",
      href: "/dashboard/events",
      action: events.length > 0 ? "Build lineup" : "Create event",
      active: events.length === 0
    });
  } else {
    actions.push({
      label: "Role verification",
      body: "Every account starts as listener. Unlock DJ, organizer, or venue tools from Settings.",
      status: "waiting",
      href: "/dashboard/settings",
      action: "Unlock tools",
      active: true
    });
  }

  if (acceptedCount > 0) {
    actions.push({
      label: "Confirmed work",
      body: "Accepted bookings should be checked against calendar, rider and deposit states.",
      status: "accepted",
      href: "/dashboard/bookings",
      action: "Inspect confirmed"
    });
  }

  return actions.slice(0, 5);
}

function getCommandReadiness(
  profile: Profile | null,
  activeRoles: Role[],
  djProfile: DjProfile | null,
  organizerProfile: OrganizerProfile | null,
  venueProfile: VenueProfile | null,
  works: Work[],
  events: EventPost[],
  savedMoments: VaultSavedMoment[]
) {
  if (!profile) {
    return 0;
  }

  if (hasRoleAccess(activeRoles, ["dj"])) {
    const fields = [
      djProfile?.stage_name,
      djProfile?.bio,
      djProfile?.city,
      djProfile?.genres,
      djProfile?.price,
      djProfile?.avatar_url,
      works.length > 0
    ];
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  }

  if (hasRoleAccess(activeRoles, ["organizer"])) {
    const fields = [
      organizerProfile?.organization_name,
      organizerProfile?.city,
      organizerProfile?.contact_email,
      events.length > 0,
      savedMoments.length > 0,
      events.some((event) => event.budget)
    ];
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  }

  if (hasRoleAccess(activeRoles, ["venue"])) {
    const fields = [
      venueProfile?.venue_name,
      venueProfile?.city,
      venueProfile?.address,
      venueProfile?.capacity,
      events.length > 0,
      savedMoments.length > 0
    ];
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  }

  return savedMoments.length > 0 ? 72 : 58;
}

function getCommandCopy(role: Profile["role"]) {
  if (role === "dj") {
    return {
      eyebrow: "DJ Workspace / Command Center",
      title: "Performance Ops",
      description:
        "A calm control layer for booking movement, release readiness, saved atmosphere briefs, analytics signals and next actions.",
      mode: "DJ tools"
    };
  }

  if (role === "venue") {
    return {
      eyebrow: "Venue Workspace / Command Center",
      title: "Venue Ops",
      description:
        "A programming desk for events, lineup slots, saved references, booking cases, date conflicts and venue readiness.",
      mode: "Venue tools"
    };
  }

  if (role === "organizer") {
    return {
      eyebrow: "Organizer Workspace / Command Center",
      title: "Lineup Ops",
      description:
        "A booking desk for saved references, active events, lineup gaps, pending requests, case files and budget movement.",
      mode: "Organizer tools"
    };
  }

  if (role === "admin") {
    return {
      eyebrow: "Admin Workspace / Command Center",
      title: "Platform Ops",
      description:
        "A prepared V2/V3 moderation and trust layer. Regular listening and booking flows stay outside admin operations.",
      mode: "Admin"
    };
  }

  return {
    eyebrow: "Listener Workspace / Command Center",
    title: "Listener Mode",
    description:
      "Start with music: listen, save tracks, collect atmosphere briefs, follow artists and unlock professional tools later.",
    mode: "Listener"
  };
}

function getCommandRole(fallbackRole: Role, activeRoles: Role[]): Role {
  if (activeRoles.includes(fallbackRole) && fallbackRole !== "listener") {
    return fallbackRole;
  }

  if (activeRoles.includes("dj")) {
    return "dj";
  }

  if (activeRoles.includes("organizer")) {
    return "organizer";
  }

  if (activeRoles.includes("venue")) {
    return "venue";
  }

  if (activeRoles.includes("admin")) {
    return "admin";
  }

  return "listener";
}

function toDateKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}
