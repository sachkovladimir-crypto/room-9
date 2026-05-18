"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type ChangeEvent, useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { MissingConfigNotice } from "@/components/AuthNotice";
import { BookingChat } from "@/components/BookingChat";
import { Button, ButtonLink, Panel, SectionHeader, StatusBadge, Text, buttonClassName } from "@/components/room9-ui";
import { WorkspaceSidebar } from "@/components/workspace/WorkspaceShell";
import { formatDate, formatPrice } from "@/lib/format";
import {
  formatSupabaseError,
  getSupabase,
  hasSupabaseConfig,
  isMissingAuthSession,
  logSupabaseError
} from "@/lib/supabase";
import { loadRoleAccess } from "@/lib/roleAccess";
import type { Booking, BookingStatus, DjProfile, EventLineupSlot, EventPost, Profile, Role } from "@/lib/types";
import {
  canViewBookingCase,
  getBookingCaseCode,
  getBookingEscrowPreview,
  getBookingTimelineSteps
} from "@/lib/bookingLifecycle";
import { syncBookingOperationsAfterStatusChange } from "@/lib/bookingOperations";

export default function BookingDetailsPage() {
  const params = useParams<{ bookingId: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeRoles, setActiveRoles] = useState<Role[]>(["listener"]);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [dj, setDj] = useState<DjProfile | null>(null);
  const [sourceSlot, setSourceSlot] = useState<EventLineupSlot | null>(null);
  const [sourceEvent, setSourceEvent] = useState<EventPost | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUploadingRider, setIsUploadingRider] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!hasSupabaseConfig() || !params.bookingId) {
      return;
    }

    async function loadDetails() {
      setIsLoading(true);
      setError("");

      try {
        const supabase = getSupabase();
        const { data: userData, error: userError } = await supabase.auth.getUser();

        if (userError) {
          if (isMissingAuthSession(userError)) {
            router.push(`/login?next=${encodeURIComponent(`/booking/details/${params.bookingId}`)}`);
            return;
          }

          logSupabaseError("Booking details auth load failed", userError);
          setError(formatSupabaseError(userError, "Could not load booking details."));
          return;
        }

        if (!userData.user) {
          router.push(`/login?next=${encodeURIComponent(`/booking/details/${params.bookingId}`)}`);
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userData.user.id)
          .maybeSingle();

        if (profileError || !profileData) {
          logSupabaseError("Booking details profile load failed", profileError);
          setError(formatSupabaseError(profileError, "Could not load profile settings."));
          return;
        }

        const loadedProfile = profileData as Profile;
        setProfile(loadedProfile);
        let loadedRoles: Role[] = ["listener"];
        try {
          loadedRoles = await loadRoleAccess(supabase, loadedProfile.id, loadedProfile.role);
          setActiveRoles(loadedRoles);
        } catch (roleAccessError) {
          logSupabaseError("Booking details role access load failed", roleAccessError);
          setActiveRoles(["listener"]);
        }

        const { data: bookingData, error: bookingError } = await supabase
          .from("bookings")
          .select("*")
          .eq("id", params.bookingId)
          .maybeSingle();

        if (bookingError || !bookingData) {
          logSupabaseError("Booking details row load failed", bookingError);
          setError(
            bookingError
              ? formatSupabaseError(bookingError, "Could not load booking details.")
              : "Booking details are unavailable for this account."
          );
          return;
        }

        const loadedBooking = bookingData as Booking;

        const { data: djData, error: djError } = await supabase
          .from("dj_profiles")
          .select("*")
          .eq("id", loadedBooking.dj_id)
          .maybeSingle();

        const loadedDj = (djData as DjProfile | null) ?? null;

        if (djError) {
          logSupabaseError("Booking details DJ load failed", djError);
        }

        if (!canViewBookingCase(loadedProfile, loadedRoles, loadedBooking, loadedDj)) {
          setError("This booking case is locked for this account. Unlock DJ, Organizer or Venue tools, or open a case connected to your profile.");
          setBooking(null);
          setDj(null);
          return;
        }

        setBooking(loadedBooking);
        setDj(loadedDj);

        const slotQuery = loadedBooking.source_slot_id
          ? supabase
              .from("event_lineup_slots")
              .select("*")
              .eq("id", loadedBooking.source_slot_id)
              .maybeSingle()
          : supabase
              .from("event_lineup_slots")
              .select("*")
              .eq("booking_id", loadedBooking.id)
              .maybeSingle();

        const { data: slotData, error: slotError } = await slotQuery;

        if (slotError) {
          logSupabaseError("Booking details source slot load failed", slotError);
        }

        const loadedSlot = (slotData as EventLineupSlot | null) ?? null;
        setSourceSlot(loadedSlot);

        const directEventId = loadedSlot?.event_id ?? loadedBooking.source_event_id ?? null;
        if (directEventId) {
          const { data: eventData, error: eventError } = await supabase
            .from("events")
            .select("*")
            .eq("id", directEventId)
            .maybeSingle();

          if (eventError) {
            logSupabaseError("Booking details source event load failed", eventError);
          } else {
            setSourceEvent((eventData as EventPost | null) ?? null);
          }
        } else {
          setSourceEvent(null);
        }
      } catch (caughtError) {
        logSupabaseError("Booking details unexpected load failure", caughtError);
        setError(formatSupabaseError(caughtError, "Could not load booking details."));
      } finally {
        setIsLoading(false);
      }
    }

    loadDetails();
  }, [params.bookingId, router]);

  async function updateStatus(status: BookingStatus) {
    if (!booking) {
      return;
    }

    if (!profile || !dj || dj.user_id !== profile.id) {
      setError("Only the DJ who owns this artist profile can change the booking status.");
      return;
    }

    setIsUpdating(true);
    setError("");

    try {
      const supabase = getSupabase();
      const { data, error: updateError } = await supabase
        .from("bookings")
        .update({ status })
        .eq("id", booking.id)
        .select("*")
        .single();

      if (updateError) {
        logSupabaseError("Booking details status update failed", updateError);
        setError(formatSupabaseError(updateError, "Failed to update booking status."));
        return;
      }

      const updatedBooking = data as Booking;
      await syncBookingOperationsAfterStatusChange(supabase, updatedBooking, status);
      setBooking(updatedBooking);
      if (status === "accepted") {
        const { error: notificationError } = await supabase.from("notifications").insert({
          user_id: booking.organizer_id,
          type: "booking_accepted",
          title: "Booking accepted",
          body: `${dj?.stage_name || "The artist"} accepted ${booking.venue_name}.`
        });

        if (notificationError) {
          logSupabaseError("Booking accepted notification failed", notificationError);
        }
      }
    } catch (caughtError) {
      logSupabaseError("Booking details status unexpected failure", caughtError);
      setError(formatSupabaseError(caughtError, "Failed to update booking status."));
    } finally {
      setIsUpdating(false);
    }
  }

  async function uploadCaseRider(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !profile || !booking || !dj) {
      return;
    }

    if (dj.user_id !== profile.id) {
      setError("Only the DJ who owns this artist profile can upload the technical rider.");
      return;
    }

    if (file.type && file.type !== "application/pdf") {
      setError("Upload a PDF technical rider.");
      return;
    }

    setIsUploadingRider(true);
    setError("");
    setNotice("");

    try {
      const supabase = getSupabase();
      const cleanName = file.name.replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
      const path = `${profile.id}/booking-${booking.id}-technical-rider-${Date.now()}-${cleanName}`;
      const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, {
        cacheControl: "3600",
        upsert: false
      });

      if (uploadError) {
        logSupabaseError("Booking details rider upload failed", uploadError);
        setError(formatSupabaseError(uploadError, 'Upload failed. Create a public "documents" bucket and retry.'));
        return;
      }

      const publicUrl = supabase.storage.from("documents").getPublicUrl(path).data.publicUrl;
      const { data, error: updateError } = await supabase
        .from("dj_profiles")
        .update({ technical_rider_url: publicUrl })
        .eq("id", dj.id)
        .eq("user_id", profile.id)
        .select("*")
        .single();

      if (updateError) {
        logSupabaseError("Booking details rider profile attach failed", updateError);
        setError(formatSupabaseError(updateError, "Rider uploaded, but could not attach to the DJ profile."));
        return;
      }

      setDj(data as DjProfile);
      setNotice("Technical rider attached. The case can now move from Rider Needed to Contract Next.");
    } catch (caughtError) {
      logSupabaseError("Booking details rider unexpected failure", caughtError);
      setError(formatSupabaseError(caughtError, "Could not upload technical rider."));
    } finally {
      setIsUploadingRider(false);
    }
  }

  if (!hasSupabaseConfig()) {
    return <MissingConfigNotice />;
  }

  if (isLoading) {
    return (
      <main className="room-page">
        <section className="room-shell py-12">
          <div className="room-card min-h-[560px] animate-pulse" />
        </section>
      </main>
    );
  }

  if (error && !booking) {
    return (
      <main className="room-page">
        <section className="room-shell py-12">
          <EmptyState title="Booking details unavailable" message={error} href="/dashboard" action="Dashboard" />
        </section>
      </main>
    );
  }

  if (!booking) {
    return (
      <main className="room-page">
        <section className="room-shell py-12">
          <EmptyState title="Booking not found" message="Booking details are unavailable for this account." href="/dashboard" action="Dashboard" />
        </section>
      </main>
    );
  }

  const caseCode = getBookingCaseCode(booking.id);
  const isDjOwner = Boolean(profile && dj && dj.user_id === profile.id);
  const riderReady = Boolean(dj?.technical_rider_url);

  return (
    <main className="room-page grid min-h-screen pb-28 lg:grid-cols-[224px_1fr]">
      <WorkspaceSidebar
        active="bookings"
        email={profile?.email}
        pendingCount={booking.status === "pending" ? 1 : 0}
        profileLabel={dj?.stage_name || profile?.email || "ROOM_9"}
        readiness={84}
        role={activeRoles}
      />

      <section className="min-w-0 bg-[#111111]">
        <div className="flex min-h-20 flex-wrap items-center justify-between gap-room-3 border-b border-roomBorder px-6 py-4 xl:px-8">
          <div>
            <div className="flex flex-wrap items-center gap-room-2">
              <Text variant="uiLabel">
                Case file / Booking {caseCode} / {sourceEvent?.title || booking.venue_name}
              </Text>
              <StatusBadge status={booking.status}>{booking.status}</StatusBadge>
            </div>
            <Text as="h1" className="mt-2 text-[28px] leading-none md:text-[34px]" variant="title">
              Booking {caseCode}
            </Text>
          </div>

          <div className="flex flex-wrap gap-room-2">
            {isDjOwner && booking.status === "pending" ? (
              <Button loading={isUpdating} onClick={() => updateStatus("accepted")} type="button" variant="primary">
                Accept Offer
              </Button>
            ) : isDjOwner && !riderReady ? (
              <label className={buttonClassName({ variant: "primary" })}>
                {isUploadingRider ? "Uploading Rider" : "Upload Rider"}
                <input accept="application/pdf" className="sr-only" disabled={isUploadingRider} onChange={uploadCaseRider} type="file" />
              </label>
            ) : (
              <ButtonLink href="/dashboard/bookings" variant="primary">
                Open Pipeline
              </ButtonLink>
            )}
            {riderReady && dj?.technical_rider_url ? (
              <ButtonLink href={dj.technical_rider_url} rel="noreferrer" target="_blank" variant="secondary">
                Open Rider
              </ButtonLink>
            ) : null}
            {isDjOwner ? (
              <Button
                disabled={isUpdating || booking.status === "declined"}
                onClick={() => updateStatus("declined")}
                type="button"
                variant="secondary"
              >
                Decline Offer
              </Button>
            ) : (
              <ButtonLink href="#case-chat" variant="secondary">
                Open Chat
              </ButtonLink>
            )}
          </div>
        </div>

        <div className="px-6 py-8 xl:px-8">
        {error ? <p className="mb-room-4 border border-errorRed p-room-2 text-sm text-errorRed">{error}</p> : null}
        {notice ? <p className="mb-room-4 border border-successGreen p-room-2 text-sm text-successGreen">{notice}</p> : null}

        <div className="grid gap-room-4 xl:grid-cols-[0.95fr_0.95fr_1fr]">
          <OfferSummary booking={booking} dj={dj} riderReady={riderReady} sourceEvent={sourceEvent} sourceSlot={sourceSlot} />
          <DealTimeline booking={booking} dj={dj} />
          <div id="case-chat">
            {profile ? <BookingChat bookingId={booking.id} currentUserId={profile.id} /> : null}
          </div>
        </div>
        <RiderContractPanel
          isDjOwner={isDjOwner}
          isUploadingRider={isUploadingRider}
          onUploadRider={uploadCaseRider}
          riderUrl={dj?.technical_rider_url ?? null}
          status={booking.status}
        />
        <EscrowPreview booking={booking} dj={dj} />
        </div>
      </section>
    </main>
  );
}

function OfferSummary({
  booking,
  dj,
  riderReady,
  sourceEvent,
  sourceSlot
}: {
  booking: Booking;
  dj: DjProfile | null;
  riderReady: boolean;
  sourceEvent: EventPost | null;
  sourceSlot: EventLineupSlot | null;
}) {
  return (
    <Panel className="min-h-[760px] p-room-4">
      <div className="flex items-start justify-between gap-room-3 border-b border-roomBorder pb-room-3">
        <Text as="h2" className="text-lg" variant="title">Offer Summary</Text>
        <StatusBadge status={riderReady ? "accepted" : booking.status === "accepted" ? "blocked" : booking.status}>
          {riderReady ? "rider ready" : booking.status === "accepted" ? "rider needed" : booking.status}
        </StatusBadge>
      </div>
      <div className="mt-room-4 grid gap-room-4 sm:grid-cols-2">
        <CaseFact label="Artist" value={dj?.stage_name || "DJ profile"} wide />
        <CaseFact label="Event" value={sourceEvent?.title || booking.venue_name} />
        <CaseFact label="Date" value={formatDate(booking.event_date)} />
        <CaseFact label="City" value={booking.city} />
        <CaseFact label="Venue" value={booking.venue_name} />
        {sourceSlot ? <CaseFact label="Lineup slot" value={sourceSlot.slot_type} /> : null}
        <CaseFact label="Set time" value="01:00 - 03:00" />
        <CaseFact label="Fee" value={dj ? `${formatPrice(dj.price)} + Flights` : "Fee on request"} />
      </div>
      <div className="mt-room-4 border-t border-roomBorder pt-room-4">
        <Text variant="uiLabel">Selected sound reference</Text>
        {booking.source_track_title || booking.source_timestamp_label ? (
          <Link
            className="mt-room-3 grid grid-cols-[52px_1fr_auto] items-center gap-room-3 border border-roomBorder bg-voidBlack p-room-2 transition hover:border-acidGreen"
            href={booking.source_work_id ? `/track/${booking.source_work_id}` : "#"}
          >
            <span className="grid h-10 w-10 place-items-center bg-inkPanel text-acidGreen">▶</span>
            <span>
              <span className="block font-display text-base uppercase text-paperWhite">
                {booking.source_track_title || "Attached track"}
              </span>
              <span className="mt-1 block font-mono text-[10px] uppercase text-mutedText">
                {booking.source_timestamp_label || "0:00"} {booking.source_moment_note || "Peak moment"}
              </span>
            </span>
            <span className="font-mono text-[10px] uppercase text-mutedText">?</span>
          </Link>
        ) : (
          <Text className="mt-room-3" variant="small">No atmosphere brief attached to this request.</Text>
        )}
      </div>
      <div className="mt-room-4 border-t border-roomBorder pt-room-4">
        <Text variant="uiLabel">Organizer brief</Text>
        <Text className="mt-room-2" variant="small">
          {booking.message || "No message provided."}
        </Text>
      </div>
    </Panel>
  );
}

function CaseFact({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <Text variant="uiLabel">{label}</Text>
      <p className="mt-room-2 font-display text-xl uppercase leading-none text-paperWhite">{value}</p>
    </div>
  );
}

function DealTimeline({ booking, dj }: { booking: Booking; dj: DjProfile | null }) {
  const steps = getBookingTimelineSteps(booking, dj ?? undefined);

  return (
    <Panel className="p-room-3">
      <SectionHeader eyebrow="Column 02" title="Deal Timeline" />
      <div className="mt-room-4 space-y-0">
        {steps.map((step) => (
          <div className="grid grid-cols-[18px_1fr] gap-room-2" key={step.label}>
            <div className="flex flex-col items-center">
              <span
                className={`mt-1 h-3 w-3 border ${
                  step.state === "done"
                    ? "border-successGreen bg-successGreen"
                    : step.state === "current"
                      ? "border-acidGreen bg-acidGreen"
                      : step.state === "blocked"
                        ? "border-warningOrange bg-warningOrange"
                        : "border-mutedText bg-transparent"
                }`}
              />
              <span className="h-14 w-px bg-roomBorder" />
            </div>
            <div className="pb-room-2">
              <p className="font-display text-lg uppercase leading-none text-paperWhite">{step.label}</p>
              <p
                className={`mt-1 font-mono text-[10px] uppercase ${
                  step.state === "done"
                    ? "text-successGreen"
                    : step.state === "current"
                      ? "text-acidGreen"
                      : step.state === "blocked"
                        ? "text-warningOrange"
                        : "text-mutedText"
                }`}
              >
                {step.state}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function RiderContractPanel({
  isDjOwner,
  isUploadingRider,
  onUploadRider,
  riderUrl,
  status
}: {
  isDjOwner: boolean;
  isUploadingRider: boolean;
  onUploadRider: (event: ChangeEvent<HTMLInputElement>) => void;
  riderUrl: string | null;
  status: BookingStatus;
}) {
  const riderReady = Boolean(riderUrl);
  const accepted = status === "accepted" || status === "paid" || status === "completed";

  return (
    <Panel className="mt-room-4 p-room-3">
      <SectionHeader
        eyebrow="Production blocker"
        title="Rider / Contract / Escrow"
        action={<StatusBadge status={riderReady ? "accepted" : accepted ? "blocked" : "waiting"}>{riderReady ? "rider ready" : accepted ? "rider needed" : "waiting"}</StatusBadge>}
      />
      <div className="mt-room-3 grid gap-room-2 md:grid-cols-3">
        <div className="border border-roomBorder bg-black p-room-2">
          <Text variant="uiLabel">Technical rider</Text>
          <Text as="h3" className="mt-room-2 text-xl" variant="title">
            {riderReady ? "Uploaded" : accepted ? "Required" : "Unlocks after accept"}
          </Text>
          <Text className="mt-room-1" variant="small">
            {riderReady ? "Production specs are attached to the DJ profile and visible in this case." : "Upload a PDF rider so contract and deposit can move forward."}
          </Text>
          <div className="mt-room-3 flex flex-wrap gap-room-2">
            {riderUrl ? (
              <ButtonLink href={riderUrl} rel="noreferrer" size="sm" target="_blank" variant="secondary">
                Open Rider
              </ButtonLink>
            ) : null}
            {isDjOwner ? (
              <label className={buttonClassName({ variant: riderReady ? "secondary" : "primary", size: "sm" })}>
                {isUploadingRider ? "Uploading" : riderReady ? "Replace PDF" : "Upload PDF"}
                <input accept="application/pdf" className="sr-only" disabled={isUploadingRider} onChange={onUploadRider} type="file" />
              </label>
            ) : null}
          </div>
        </div>
        <div className="border border-roomBorder bg-black p-room-2">
          <Text variant="uiLabel">Contract</Text>
          <Text as="h3" className="mt-room-2 text-xl" variant="title">
            {riderReady ? "Next" : "Blocked"}
          </Text>
          <Text className="mt-room-1" variant="small">
            {riderReady ? "Contract can be prepared from event facts, fee, chat log, and rider." : "Contract stays blocked until rider is attached."}
          </Text>
        </div>
        <div className="border border-roomBorder bg-black p-room-2">
          <Text variant="uiLabel">Escrow preview</Text>
          <Text as="h3" className="mt-room-2 text-xl" variant="title">
            {riderReady ? "Prepared" : "Waiting"}
          </Text>
          <Text className="mt-room-1" variant="small">
            Deposit and payout preview become credible after the rider and contract package are ready.
          </Text>
        </div>
      </div>
    </Panel>
  );
}

function EscrowPreview({ booking, dj }: { booking: Booking; dj: DjProfile | null }) {
  const escrow = getBookingEscrowPreview(booking, dj);
  const escrowStatus = escrow.state === "released" || escrow.state === "escrow_ready" ? "escrowReady" : escrow.state;

  return (
    <Panel className="mt-room-4 p-room-3">
      <SectionHeader
        eyebrow="Pre-release finance"
        title="Escrow Preview"
        action={<StatusBadge status={escrowStatus}>{escrowStatus === "escrowReady" ? "ready" : "provider planned"}</StatusBadge>}
      />
      <div className="mt-room-3 grid gap-room-2 md:grid-cols-4">
        <EscrowMetric label="Artist fee" value={`EUR ${escrow.artistFee.toLocaleString()}`} note="Negotiated gross offer" />
        <EscrowMetric label="Deposit" value={`EUR ${escrow.deposit.toLocaleString()}`} note="30% hold before contract" active />
        <EscrowMetric label="Platform fee" value={`EUR ${escrow.platformFee.toLocaleString()}`} note="8% preview, V3 provider" />
        <EscrowMetric label="Artist payout" value={`EUR ${escrow.artistPayout.toLocaleString()}`} note="Release after event close" />
      </div>
      <div className="mt-room-3 grid gap-room-2 md:grid-cols-4">
        {escrow.timeline.map(({ label, state }) => (
          <div className="border border-roomBorder bg-black p-room-2" key={label}>
            <p className="font-display text-base uppercase text-paperWhite">{label}</p>
            <p
              className={`mt-1 font-mono text-[10px] uppercase ${
                state === "done" ? "text-successGreen" : state === "current" ? "text-acidGreen" : "text-mutedText"
              }`}
            >
              {state}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-room-3 max-w-4xl text-xs leading-5 text-mutedText">
        This is a pre-release escrow layer: ROOM_9 calculates deposit, platform fee, payout timing, and provider state now; real payment provider integration is planned for V3 with webhooks, refunds, and audit logs.
      </p>
    </Panel>
  );
}

function EscrowMetric({ active = false, label, note, value }: { active?: boolean; label: string; note: string; value: string }) {
  return (
    <div className="border border-roomBorder bg-black p-room-2">
      <Text variant="uiLabel">{label}</Text>
      <p className={`mt-room-2 font-display text-2xl uppercase ${active ? "text-acidGreen" : "text-paperWhite"}`}>{value}</p>
      <p className="mt-room-1 text-xs leading-5 text-mutedText">{note}</p>
    </div>
  );
}
