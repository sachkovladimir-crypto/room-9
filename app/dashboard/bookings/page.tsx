"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { MissingConfigNotice } from "@/components/AuthNotice";
import { Button, ButtonLink, MetricCard, Panel, SectionHeader, StatusBadge, Text, cx } from "@/components/room9-ui";
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
import { formatDate, formatPrice } from "@/lib/format";
import {
  formatSupabaseError,
  getSupabase,
  hasSupabaseConfig,
  isMissingAuthSession,
  logSupabaseError
} from "@/lib/supabase";
import { loadRoleAccess } from "@/lib/roleAccess";
import { syncBookingOperationsAfterStatusChange } from "@/lib/bookingOperations";
import { isBookingClientRole, type Booking, type BookingStatus, type DjProfile, type Profile, type Role } from "@/lib/types";
import {
  BOOKING_CRM_STAGES,
  getBookingCrmStage,
  getBookingEscrowPreview,
  getBookingNextAction,
  getBookingTimelineSteps
} from "@/lib/bookingLifecycle";

export default function DashboardBookingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeRoles, setActiveRoles] = useState<Role[]>(["listener"]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [djLookup, setDjLookup] = useState<Record<string, DjProfile>>({});
  const [ownedDj, setOwnedDj] = useState<DjProfile | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      return;
    }

    async function loadBookings() {
      setIsLoading(true);
      setError("");

      try {
        const supabase = getSupabase();
        const { data: sessionData, error: userError } = await supabase.auth.getSession();

        if (userError) {
          if (isMissingAuthSession(userError)) {
            router.push("/login?next=/dashboard/bookings");
            return;
          }

          logSupabaseError("Dashboard bookings auth failed", userError);
          setError(formatSupabaseError(userError, "Could not load bookings."));
          return;
        }

        const user = sessionData.session?.user ?? null;
        if (!user) {
          router.push("/login?next=/dashboard/bookings");
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError || !profileData) {
          logSupabaseError("Dashboard bookings profile failed", profileError);
          setError(formatSupabaseError(profileError, "Could not load workspace profile."));
          return;
        }

        const loadedProfile = profileData as Profile;
        setProfile(loadedProfile);
        let loadedRoles: Role[] = ["listener"];
        try {
          loadedRoles = await loadRoleAccess(supabase, loadedProfile.id, loadedProfile.role);
          setActiveRoles(loadedRoles);
        } catch (roleAccessError) {
          logSupabaseError("Dashboard bookings role access failed", roleAccessError);
          setActiveRoles(["listener"]);
        }
        const effectiveRole = getEffectiveBookingRole(loadedRoles);

        if (!canAccessWorkspaceSection("bookings", loadedRoles)) {
          router.replace(getWorkspaceUnlockHref("bookings"));
          return;
        }

        let loadedBookings: Booking[] = [];
        if (effectiveRole === "dj") {
          const { data: djData, error: djError } = await supabase
            .from("dj_profiles")
            .select("*")
            .eq("user_id", loadedProfile.id)
            .maybeSingle();

          if (djError) {
            logSupabaseError("Dashboard bookings DJ profile failed", djError);
            setError(formatSupabaseError(djError, "Could not load DJ profile."));
            return;
          }

          const dj = (djData as DjProfile | null) ?? null;
          setOwnedDj(dj);
          if (dj) {
            const { data, error: bookingError } = await supabase
              .from("bookings")
              .select("*")
              .eq("dj_id", dj.id)
              .or("archived_by_dj.is.null,archived_by_dj.eq.false")
              .order("created_at", { ascending: false })
              .limit(80);

            if (bookingError) {
              logSupabaseError("Dashboard bookings DJ rows failed", bookingError);
              setError(formatSupabaseError(bookingError, "Could not load DJ booking requests."));
              return;
            }

            loadedBookings = (data as Booking[]) ?? [];
            setDjLookup({ [dj.id]: dj });
          }
        } else {
          const { data, error: bookingError } = await supabase
            .from("bookings")
            .select("*")
            .eq("organizer_id", loadedProfile.id)
            .or("archived_by_organizer.is.null,archived_by_organizer.eq.false")
            .order("created_at", { ascending: false })
            .limit(80);

          if (bookingError) {
            logSupabaseError("Dashboard bookings organizer rows failed", bookingError);
            setError(formatSupabaseError(bookingError, "Could not load sent requests."));
            return;
          }

          loadedBookings = (data as Booking[]) ?? [];
          const ids = Array.from(new Set(loadedBookings.map((booking) => booking.dj_id)));
          if (ids.length > 0) {
            const { data: djs, error: djsError } = await supabase
              .from("dj_profiles")
              .select("*")
              .in("id", ids.slice(0, 80));

            if (djsError) {
              logSupabaseError("Dashboard bookings DJ lookup failed", djsError);
            } else {
              setDjLookup(
                ((djs as DjProfile[]) ?? []).reduce<Record<string, DjProfile>>((acc, dj) => {
                  acc[dj.id] = dj;
                  return acc;
                }, {})
              );
            }
          }
        }

        setBookings(loadedBookings);
        setSelectedId(loadedBookings[0]?.id ?? null);
      } catch (caughtError) {
        logSupabaseError("Dashboard bookings unexpected failure", caughtError);
        setError(formatSupabaseError(caughtError, "Could not load bookings."));
      } finally {
        setIsLoading(false);
      }
    }

    loadBookings();
  }, [router]);

  async function updateBookingStatus(bookingId: string, status: BookingStatus) {
    setIsUpdating(true);
    setError("");
    const previousBooking = bookings.find((booking) => booking.id === bookingId);

    try {
      const supabase = getSupabase();
      const { data, error: updateError } = await supabase
        .from("bookings")
        .update({ status })
        .eq("id", bookingId)
        .select("*")
        .single();

      if (updateError) {
        logSupabaseError("Dashboard bookings status update failed", updateError);
        setError(formatSupabaseError(updateError, "Failed to update booking status."));
        return;
      }

      const updatedBooking = data as Booking;
      await syncBookingOperationsAfterStatusChange(supabase, updatedBooking, status);
      if (previousBooking && (status === "accepted" || status === "declined")) {
        const { error: notificationError } = await supabase.from("notifications").insert({
          user_id: previousBooking.organizer_id,
          type: status === "accepted" ? "booking_accepted" : "booking_declined",
          title: status === "accepted" ? "Booking accepted" : "Booking declined",
          body: `${ownedDj?.stage_name || "The artist"} ${status === "accepted" ? "accepted" : "declined"} ${previousBooking.venue_name}.`
        });

        if (notificationError) {
          logSupabaseError("Dashboard bookings status notification failed", notificationError);
        }
      }
      setBookings((current) => current.map((booking) => (booking.id === bookingId ? updatedBooking : booking)));
    } catch (caughtError) {
      logSupabaseError("Dashboard bookings status unexpected failure", caughtError);
      setError(formatSupabaseError(caughtError, "Failed to update booking status."));
    } finally {
      setIsUpdating(false);
    }
  }

  async function archiveBookingForCurrentUser(bookingId: string) {
    const booking = bookings.find((item) => item.id === bookingId);
    if (!booking) {
      return;
    }

    const isDj = getEffectiveBookingRole(activeRoles) === "dj";
    const patch: Partial<Booking> = isDj
      ? { archived_by_dj: true }
      : {
          archived_by_organizer: true,
          status: booking.status === "pending" ? "cancelled" : booking.status
        };

    setIsUpdating(true);
    setError("");

    try {
      const supabase = getSupabase();
      const { error: archiveError } = await supabase
        .from("bookings")
        .update(patch)
        .eq("id", bookingId);

      if (archiveError) {
        logSupabaseError("Dashboard bookings archive failed", archiveError);
        setError(formatSupabaseError(archiveError, "Could not remove booking from your board."));
        return;
      }

      setBookings((current) => current.filter((item) => item.id !== bookingId));
      setSelectedId((current) => {
        if (current !== bookingId) {
          return current;
        }
        return bookings.find((item) => item.id !== bookingId)?.id ?? null;
      });
    } catch (caughtError) {
      logSupabaseError("Dashboard bookings archive unexpected failure", caughtError);
      setError(formatSupabaseError(caughtError, "Could not remove booking from your board."));
    } finally {
      setIsUpdating(false);
    }
  }

  const selectedBooking = bookings.find((booking) => booking.id === selectedId) ?? bookings[0];
  const pendingCount = bookings.filter((booking) => booking.status === "pending").length;
  const acceptedCount = bookings.filter((booking) => booking.status === "accepted").length;
  const soundRefs = bookings.filter((booking) => booking.source_work_id || booking.source_timestamp_label).length;
  const effectiveRole = getEffectiveBookingRole(activeRoles);
  const readiness = ownedDj ? 84 : effectiveRole === "organizer" || effectiveRole === "venue" ? 76 : 62;
  const isDjWorkspace = effectiveRole === "dj";
  const isClientWorkspace = isBookingClientRole(activeRoles);
  const bookingCopy = getBookingWorkspaceCopy(effectiveRole);

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
          <EmptyState title="Bookings unavailable" message={error} href="/dashboard" action="Dashboard" />
        </section>
      </main>
    );
  }

  if (profile && effectiveRole === "listener") {
    return (
      <WorkspacePageFrame
        active="bookings"
        email={profile.email}
        pendingCount={0}
        profileLabel={profile.email || "ROOM_9"}
        readiness={58}
        role={activeRoles}
      >
        <div className="px-room-3 py-room-3 xl:px-room-4">
          <WorkspaceOpsHeader
            description="Booking CRM is a professional layer. Keep listening first, then unlock DJ, organizer or venue tools from Settings when the profile is ready."
            eyebrow="Workspace / Locked Tool"
            title="Booking CRM Locked"
            actions={
              <>
                <ButtonLink href="/dashboard/settings?unlock=bookings" variant="primary">
                  Unlock Tools
                </ButtonLink>
                <ButtonLink href="/library" variant="secondary">
                  Sound Vault
                </ButtonLink>
              </>
            }
          />
          <ListenerBookingUnlock />
        </div>
      </WorkspacePageFrame>
    );
  }

  return (
    <WorkspacePageFrame
      active="bookings"
      email={profile?.email}
      pendingCount={pendingCount}
      profileLabel={ownedDj?.stage_name || profile?.email || "ROOM_9"}
      readiness={readiness}
      role={activeRoles}
    >
      <div className="px-room-3 py-room-3 xl:px-room-4">
        <WorkspaceOpsHeader
          description={bookingCopy.description}
          eyebrow={bookingCopy.eyebrow}
          title={bookingCopy.title}
          actions={
            <>
            {isClientWorkspace ? (
              <ButtonLink href="/dashboard/events" variant="primary">
                Event Desk
              </ButtonLink>
            ) : (
              <ButtonLink href={selectedBooking ? `/booking/details/${selectedBooking.id}` : "/dashboard/calendar"} variant="primary">
                {selectedBooking ? "Open Case" : "Calendar"}
              </ButtonLink>
            )}
            <ButtonLink href={isClientWorkspace ? "/library" : "/dashboard/calendar"} variant="secondary">
              {isClientWorkspace ? "Sound Vault" : "Calendar"}
            </ButtonLink>
            </>
          }
        />

        {error ? <WorkspaceNotice tone="error">{error}</WorkspaceNotice> : null}

        <WorkspaceMetricGrid>
          <MetricCard active={pendingCount > 0} label="Pending" note="Needs next move" value={pendingCount} />
          <MetricCard label="Accepted" note="Confirmed artists" value={acceptedCount} />
          <MetricCard label="Sound refs" note="Booked from music" value={soundRefs} />
          <MetricCard label="Cases" note="Total requests" value={bookings.length} />
          <MetricCard label="Declined" note="Closed / no fit" value={bookings.filter((booking) => booking.status === "declined").length} />
        </WorkspaceMetricGrid>

        <BookingFocusStrip
          acceptedCount={acceptedCount}
          pendingCount={pendingCount}
          role={effectiveRole}
          selectedBooking={selectedBooking}
          soundRefs={soundRefs}
        />

        {isClientWorkspace ? (
          <ClientBookingRouteStrip
            bookingCount={bookings.length}
            pendingCount={pendingCount}
            role={effectiveRole}
            soundRefs={soundRefs}
          />
        ) : null}

        <div className="mt-room-4">
          <BookingCrmBoard
            bookings={bookings}
            djLookup={djLookup}
            isUpdating={isUpdating}
            mode={isDjWorkspace ? "dj" : "organizer"}
            selectedId={selectedBooking?.id ?? null}
            onArchive={archiveBookingForCurrentUser}
            onSelect={setSelectedId}
          />
        </div>

        <div className="mt-room-4 grid gap-room-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.82fr)]">
          <Panel className="p-room-3">
            <SectionHeader eyebrow="Selected case" title="Offer Summary" />
            {selectedBooking ? (
              <CaseInspector
                booking={selectedBooking}
                dj={djLookup[selectedBooking.dj_id]}
                isDj={isDjWorkspace}
                isUpdating={isUpdating}
                onUpdateStatus={updateBookingStatus}
                onArchive={archiveBookingForCurrentUser}
              />
            ) : (
              <Text className="mt-room-3" variant="small">
                Select a request to inspect timeline, sound reference, and next action.
              </Text>
            )}
          </Panel>
          <DealTimelinePanel booking={selectedBooking} dj={selectedBooking ? djLookup[selectedBooking.dj_id] : undefined} />
          <EscrowPreviewPanel booking={selectedBooking} dj={selectedBooking ? djLookup[selectedBooking.dj_id] : undefined} />
        </div>
      </div>
    </WorkspacePageFrame>
  );
}

function ListenerBookingUnlock() {
  return (
    <>
      <WorkspaceMetricGrid columns={4}>
        <MetricCard active label="Current mode" note="Music platform first" value="Listener" />
        <MetricCard label="CRM access" note="Requires role unlock" value="Locked" />
        <MetricCard label="Vault" note="Tracks / moments / playlists" value="Open" />
        <MetricCard label="Next step" note="Settings verification" value="Role" />
      </WorkspaceMetricGrid>

      <WorkspaceCommandGrid>
        <WorkspaceCommandPanel
          active
          body="Save tracks, like music, build playlists and collect atmosphere briefs before turning them into professional requests."
          label="01 / Music base"
          status={<StatusBadge status="unlocked">open</StatusBadge>}
          title="Sound Vault stays available"
        >
          <ButtonLink className="mt-room-3" href="/library" size="sm" variant="primary">
            Open Vault
          </ButtonLink>
        </WorkspaceCommandPanel>
        <WorkspaceCommandPanel
          body="Organizer and venue access unlocks sent requests, lineup slots, event context and case files."
          label="02 / Client layer"
          status={<StatusBadge status="locked">locked</StatusBadge>}
          title="Organizer / Venue tools"
        >
          <ButtonLink className="mt-room-3" href="/dashboard/settings?unlock=organizer" size="sm" variant="secondary">
            Open Settings
          </ButtonLink>
        </WorkspaceCommandPanel>
        <WorkspaceCommandPanel
          body="DJ verification unlocks incoming offers, rider state, artist payout preview and booking decisions."
          label="03 / Artist layer"
          status={<StatusBadge status="locked">locked</StatusBadge>}
          title="DJ offer CRM"
        >
          <ButtonLink className="mt-room-3" href="/dashboard/settings?unlock=dj" size="sm" variant="secondary">
            Verify DJ
          </ButtonLink>
        </WorkspaceCommandPanel>
      </WorkspaceCommandGrid>
    </>
  );
}

function BookingFocusStrip({
  acceptedCount,
  pendingCount,
  role,
  selectedBooking,
  soundRefs
}: {
  acceptedCount: number;
  pendingCount: number;
  role?: Profile["role"];
  selectedBooking?: Booking;
  soundRefs: number;
}) {
  const action = selectedBooking ? getBookingNextAction(selectedBooking) : "Create a request from Explore or a saved sound reference.";
  const isClient = isBookingClientRole(role);

  return (
    <WorkspaceCommandGrid>
      <WorkspaceCommandPanel
        active={pendingCount > 0}
        body={action}
        label={isClient ? "Client Queue" : "Action Required"}
        status={<StatusBadge status={pendingCount > 0 ? "pending" : "done"}>{pendingCount > 0 ? "pending" : "clear"}</StatusBadge>}
        title={pendingCount > 0 ? `${pendingCount} request${pendingCount === 1 ? "" : "s"} need decision` : isClient ? "No pending artist replies" : "No blocked booking decisions"}
      />
      <WorkspaceCommandPanel
        active={soundRefs > 0}
        body={isClient ? "Organizer/Venue cases should start from saved atmosphere briefs, not vague mood descriptions." : "Cases with sound references move faster because the intended room energy is visible."}
        label="Atmosphere Brief"
        status={<StatusBadge status={soundRefs > 0 ? "selected" : "draft"}>{soundRefs}</StatusBadge>}
        title={soundRefs > 0 ? "Sound reference attached" : "No atmosphere briefs attached"}
      />
      <WorkspaceCommandPanel
        body={
          selectedBooking
            ? [formatDate(selectedBooking.event_date), selectedBooking.city, selectedBooking.status].filter(Boolean).join(" / ")
            : "The CRM board below is the source of truth for booking movement."
        }
        label="Case Health"
        status={<StatusBadge status={acceptedCount > 0 ? "accepted" : "waiting"}>{acceptedCount} accepted</StatusBadge>}
        title={selectedBooking ? selectedBooking.venue_name : "Select a case to inspect deal state"}
      />
    </WorkspaceCommandGrid>
  );
}

function ClientBookingRouteStrip({
  bookingCount,
  pendingCount,
  role,
  soundRefs
}: {
  bookingCount: number;
  pendingCount: number;
  role?: Profile["role"];
  soundRefs: number;
}) {
  const roleLabel = role === "venue" ? "Venue" : "Organizer";
  return (
    <WorkspaceCommandGrid columns={5}>
      {[
        ["01", "Vault moment", soundRefs > 0 ? `${soundRefs} attached` : "save first", soundRefs > 0 ? "selected" : "draft"],
        ["02", "Lineup slot", role === "venue" ? "room program" : "event program", "current"],
        ["03", "Request sent", bookingCount > 0 ? `${bookingCount} cases` : "create request", bookingCount > 0 ? "sent" : "draft"],
        ["04", "Artist reply", pendingCount > 0 ? `${pendingCount} waiting` : "clear", pendingCount > 0 ? "pending" : "done"],
        ["05", "Calendar lock", "conflict check", "waiting"]
      ].map(([index, title, copy, status], itemIndex) => (
        <WorkspaceCommandPanel
          active={itemIndex === 1}
          body={copy}
          key={title}
          label={`${roleLabel} / ${index}`}
          status={<StatusBadge status={status}>{status}</StatusBadge>}
          title={title}
        />
      ))}
    </WorkspaceCommandGrid>
  );
}

function getEffectiveBookingRole(activeRoles: Role[]): Role {
  if (activeRoles.includes("organizer")) {
    return "organizer";
  }

  if (activeRoles.includes("venue")) {
    return "venue";
  }

  if (activeRoles.includes("dj")) {
    return "dj";
  }

  return "listener";
}

function getBookingWorkspaceCopy(role?: Profile["role"]) {
  if (role === "dj") {
    return {
      eyebrow: "Workspace / Offer desk",
      title: "Offer CRM",
      description:
        "Incoming requests, atmosphere briefs, rider blockers, contract next steps and escrow preview stay in one professional offer queue."
    };
  }

  if (role === "venue") {
    return {
      eyebrow: "Venue Workspace / Booking CRM",
      title: "Venue Booking Desk",
      description:
        "Turn saved sound references into lineup slots, track artist replies, protect room budgets, and keep every case tied to calendar conflicts."
    };
  }

  if (role === "organizer") {
    return {
      eyebrow: "Organizer Workspace / Booking CRM",
      title: "Lineup Booking Desk",
      description:
        "Manage sent artist requests, sound references, event context, deal stages, rider status and escrow preview from one client-side board."
    };
  }

  return {
    eyebrow: "Workspace / Booking CRM",
    title: "Booking CRM",
    description:
      "Requests, sound references, deal stages, rider status, and escrow preview stay in one operational queue after role verification."
  };
}

function EscrowPreviewPanel({ booking, dj }: { booking?: Booking | null; dj?: DjProfile }) {
  const escrow = getBookingEscrowPreview(booking, dj);
  const escrowState = escrow.state;

  return (
    <Panel className="p-room-3">
      <SectionHeader eyebrow="V3 preview" title="Escrow Layer" />
      <Text className="mt-room-3" variant="small">
        Payment provider is intentionally not connected yet. This preview shows how booking money will be prepared in V3.
      </Text>
      <div className="mt-room-3 grid gap-px bg-line">
        <Fact label="Offer amount" value={`EUR ${escrow.artistFee.toLocaleString("en-US")}`} />
        <Fact label="Deposit" value={`EUR ${escrow.deposit.toLocaleString("en-US")}`} />
        <Fact label="Platform fee" value={`EUR ${escrow.platformFee.toLocaleString("en-US")}`} />
        <Fact label="Artist payout" value={`EUR ${escrow.artistPayout.toLocaleString("en-US")}`} />
      </div>
      <div className="mt-room-3 flex flex-wrap items-center justify-between gap-room-2 border border-roomBorder p-room-2">
        <div>
          <Text variant="uiLabel">Escrow status</Text>
          <p className="mt-room-1 font-display text-xl uppercase text-paperWhite">
            {escrowState.replace("_", " ")}
          </p>
        </div>
        <StatusBadge status={escrowState}>{escrowState.replace("_", " ")}</StatusBadge>
      </div>
      <div className="mt-room-3 border border-roomBorder bg-black">
        {[
          ["01", "Deposit invoice", "35% reserve prepared after fee agreement."],
          ["02", "Funds held", "Provider planned: Stripe Connect / escrow partner."],
          ["03", "Event complete", "Payout release after case completion."],
          ["04", "Dispute window", "Refund and dispute rules move to V3 compliance."]
        ].map(([step, label, body]) => (
          <div className="grid grid-cols-[44px_1fr] gap-room-2 border-b border-roomBorder p-room-2 last:border-b-0" key={step}>
            <span className="font-mono text-[10px] uppercase text-acidGreen">{step}</span>
            <span>
              <Text className="text-sm" variant="title">
                {label}
              </Text>
              <Text className="mt-1" variant="small">
                {body}
              </Text>
            </span>
          </div>
        ))}
      </div>
      <Button className="mt-room-3 w-full" disabled={!booking || booking.status === "declined"} type="button" variant="secondary">
        Prepare Payment
      </Button>
    </Panel>
  );
}

function CaseInspector({
  booking,
  dj,
  isDj,
  isUpdating,
  onUpdateStatus,
  onArchive
}: {
  booking: Booking;
  dj?: DjProfile;
  isDj: boolean;
  isUpdating: boolean;
  onUpdateStatus: (bookingId: string, status: BookingStatus) => void;
  onArchive: (bookingId: string) => void;
}) {
  return (
    <div className="mt-room-3 space-y-room-3">
      <div className="grid gap-px bg-line">
        <Fact label="Event" value={booking.venue_name} />
        <Fact label="Date" value={formatDate(booking.event_date)} />
        <Fact label="City" value={booking.city} />
        <Fact label="Artist" value={dj?.stage_name || "DJ profile"} />
        <Fact label="Fee" value={dj ? formatPrice(dj.price) : "Fee on request"} />
      </div>
      <div className="border border-roomBorder p-room-2">
        <Text variant="uiLabel">Sound reference</Text>
        <Text as="h3" className="mt-room-2 text-xl" variant="title">
          {booking.source_track_title || "No attached track"}
        </Text>
        <Text className="mt-room-1" variant="small">
          {booking.source_timestamp_label
            ? `${booking.source_timestamp_label} / ${booking.source_moment_note || "Bookable moment attached."}`
            : "This booking was not created from a timestamp."}
        </Text>
      </div>
      <div className="flex flex-wrap gap-room-2">
        <ButtonLink href={`/booking/details/${booking.id}`} variant="primary">
          Open Case File
        </ButtonLink>
        {isDj ? (
          <ButtonLink href="/dashboard/settings#dj-rider-upload" variant={dj?.technical_rider_url ? "secondary" : "primary"}>
            {dj?.technical_rider_url ? "Rider Ready" : "Upload Rider"}
          </ButtonLink>
        ) : null}
        {isDj ? (
          <>
            <Button
              disabled={booking.status === "accepted"}
              loading={isUpdating}
              onClick={() => onUpdateStatus(booking.id, "accepted")}
              type="button"
              variant="secondary"
            >
              Accept
            </Button>
            <Button
              disabled={booking.status === "declined"}
              loading={isUpdating}
              onClick={() => onUpdateStatus(booking.id, "declined")}
              type="button"
              variant="destructive"
            >
              Decline
            </Button>
          </>
        ) : null}
        <Button
          disabled={isUpdating}
          loading={isUpdating}
          onClick={() => onArchive(booking.id)}
          type="button"
          variant="ghost"
        >
          Remove From Board
        </Button>
      </div>
    </div>
  );
}

function DealTimelinePanel({ booking, dj }: { booking?: Booking; dj?: DjProfile }) {
  const steps = getBookingTimelineSteps(booking, dj);

  return (
    <Panel className="p-room-3">
      <SectionHeader eyebrow="Deal timeline" title="Case Movement" />
      <div className="mt-room-4 space-y-room-1">
        {steps.map((step, index) => (
          <div className="grid grid-cols-[22px_1fr_auto] gap-room-2" key={step.label}>
            <div className="flex flex-col items-center">
              <span
                className={cx(
                  "mt-1 h-3 w-3 border",
                  step.state === "done" && "border-successGreen bg-successGreen",
                  step.state === "current" && "border-acidGreen bg-acidGreen",
                  step.state === "blocked" && "border-warningOrange bg-warningOrange",
                  step.state === "waiting" && "border-roomBorder bg-inkPanel"
                )}
              />
              {index < steps.length - 1 ? <span className="mt-1 h-12 w-px bg-roomBorder" /> : null}
            </div>
            <div className={cx("border p-room-2", step.state === "blocked" ? "border-warningOrange bg-[#180A03]" : "border-roomBorder bg-black")}>
              <Text as="h3" className="text-base" variant="title">
                {step.label}
              </Text>
              <Text className="mt-room-1" variant="small">
                {step.copy}
              </Text>
            </div>
            <StatusBadge status={step.state}>{step.state}</StatusBadge>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function BookingCrmBoard({
  bookings,
  djLookup,
  isUpdating,
  mode,
  selectedId,
  onArchive,
  onSelect
}: {
  bookings: Booking[];
  djLookup: Record<string, DjProfile>;
  isUpdating: boolean;
  mode: "dj" | "organizer";
  selectedId: string | null;
  onArchive: (bookingId: string) => void;
  onSelect: (bookingId: string) => void;
}) {
  const stageHints: Record<string, string> = {
    "New Requests": "Incoming request lands here before a decision.",
    Negotiating: "Sound reference, date, fee and city are being aligned.",
    "Rider Needed": "Artist accepted; technical rider or production info blocks confirmation.",
    "Contract Next": "Terms are ready for contract or change request.",
    "Escrow Preview": "Deposit and platform fee are prepared before release.",
    Confirmed: "Case is locked and ready for event execution."
  };

  return (
    <Panel className="p-room-3">
      <SectionHeader
        eyebrow="CRM board"
        title="Professional Booking Flow"
        action={<Text variant="uiLabel">{bookings.length} cases</Text>}
      />
      <div className="mt-room-3 grid gap-px overflow-hidden border border-roomBorder bg-line xl:grid-cols-6">
        {BOOKING_CRM_STAGES.map((stage) => {
          const stageBookings = bookings.filter((booking) => getBookingCrmStage(booking, djLookup[booking.dj_id]) === stage);
          return (
            <div className="min-h-[320px] bg-black p-room-2" key={stage}>
              <div className="flex items-center justify-between gap-room-2 border-b border-roomBorder pb-room-2">
                <Text variant="uiLabel">{stage}</Text>
                <span className="font-display text-2xl text-paperWhite">{stageBookings.length}</span>
              </div>
              <div className="mt-room-2 space-y-room-2">
                {stageBookings.length === 0 ? (
                  <div className="border border-dashed border-roomBorder bg-voidBlack p-room-2">
                    <Text variant="small">{stageHints[stage]}</Text>
                  </div>
                ) : (
                  stageBookings.map((booking) => {
                    const dj = djLookup[booking.dj_id];
                    const contextLine = getBookingContextLine(booking);
                    return (
                      <article
                        className={cx(
                          "w-full border p-room-2 text-left transition",
                          selectedId === booking.id ? "border-acidGreen bg-inkPanel" : "border-roomBorder bg-panelBlack hover:border-paperWhite"
                        )}
                        key={booking.id}
                      >
                        <button className="w-full text-left" onClick={() => onSelect(booking.id)} type="button">
                          <StatusBadge status={booking.status}>{booking.status}</StatusBadge>
                          <Text as="h3" className="mt-room-2 text-base" variant="title">
                            {mode === "dj" ? booking.venue_name : dj?.stage_name || "DJ profile"}
                          </Text>
                          <Text className="mt-room-1" variant="mono">
                            {[formatDate(booking.event_date), booking.city].filter(Boolean).join(" / ")}
                          </Text>
                          <Text className="mt-room-1" variant="small">
                            {dj ? `Artist: ${dj.stage_name || "DJ profile"}` : "Artist profile pending"}
                          </Text>
                          {booking.source_timestamp_label ? (
                            <Text className="mt-room-2 font-mono text-[10px] uppercase text-acidGreen" variant="small">
                              {booking.source_track_title || "Sound reference"} / {booking.source_timestamp_label}
                            </Text>
                          ) : null}
                          {contextLine ? (
                            <Text className="mt-room-1" variant="small">
                              {contextLine}
                            </Text>
                          ) : null}
                          <Text className="mt-room-2" variant="small">
                            {getBookingNextAction(booking, dj)}
                          </Text>
                        </button>
                        <div className="mt-room-2 flex flex-wrap items-center justify-between gap-room-2 border-t border-roomBorder pt-room-2">
                          <span className="font-mono text-[10px] uppercase text-mutedText">
                            {dj ? formatPrice(dj.price) : "Fee on request"}
                          </span>
                          <div className="flex flex-wrap gap-room-1">
                            <ButtonLink href={`/booking/details/${booking.id}`} size="sm" variant="ghost">
                              Open Case
                            </ButtonLink>
                            <Button
                              disabled={isUpdating}
                              onClick={() => onArchive(booking.id)}
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function getBookingContextLine(booking: Booking) {
  if (booking.source_event_id && booking.source_slot_id) {
    return "Event Desk slot linked";
  }

  if (booking.source_event_id) {
    return "Event Desk context linked";
  }

  if (booking.source_saved_moment_id) {
    return "Saved atmosphere brief linked";
  }

  return "";
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-voidBlack p-room-2">
      <Text variant="uiLabel">{label}</Text>
      <p className="mt-room-1 font-display text-xl uppercase text-paperWhite">{value}</p>
    </div>
  );
}
