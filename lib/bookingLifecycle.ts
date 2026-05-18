import { hasRoleAccess, type Booking, type BookingStatus, type DjProfile, type Profile, type Role } from "@/lib/types";

export type BookingCrmStage =
  | "New Requests"
  | "Negotiating"
  | "Rider Needed"
  | "Contract Next"
  | "Escrow Preview"
  | "Confirmed";

export type BookingTimelineState = "done" | "current" | "blocked" | "waiting";

export type BookingTimelineStep = {
  label: string;
  copy: string;
  state: BookingTimelineState;
};

export type EscrowPreviewState = "not_funded" | "deposit_pending" | "escrow_ready" | "released" | "blocked";

export type BookingEscrowPreview = {
  artistFee: number;
  deposit: number;
  platformFee: number;
  artistPayout: number;
  state: EscrowPreviewState;
  timeline: Array<{
    label: string;
    state: BookingTimelineState;
  }>;
};

export const BOOKING_CRM_STAGES: BookingCrmStage[] = [
  "New Requests",
  "Negotiating",
  "Rider Needed",
  "Contract Next",
  "Escrow Preview",
  "Confirmed"
];

export function getBookingCaseCode(id?: string | null) {
  if (!id) {
    return "000";
  }

  return id.replace(/-/g, "").slice(0, 3).toUpperCase();
}

export function hasBookingSoundReference(booking?: Booking | null) {
  return Boolean(booking?.source_work_id || booking?.source_timestamp_label);
}

export function isAcceptedBookingStatus(status?: BookingStatus | null) {
  return status === "accepted" || status === "paid" || status === "completed";
}

export function isClosedBookingStatus(status?: BookingStatus | null) {
  return status === "declined" || status === "cancelled" || status === "disputed";
}

export function getBookingCrmStage(booking: Booking, dj?: DjProfile): BookingCrmStage {
  if (booking.status === "completed") {
    return "Confirmed";
  }

  if (booking.status === "paid") {
    return "Escrow Preview";
  }

  if (booking.status === "accepted" && dj?.technical_rider_url) {
    return "Contract Next";
  }

  if (booking.status === "accepted") {
    return "Rider Needed";
  }

  if (isClosedBookingStatus(booking.status)) {
    return "Contract Next";
  }

  if (hasBookingSoundReference(booking)) {
    return "Negotiating";
  }

  return "New Requests";
}

export function getBookingNextAction(booking?: Booking | null, dj?: DjProfile) {
  if (!booking) {
    return "Select a booking case to inspect timeline, sound reference and next action.";
  }

  if (booking.status === "pending" && hasBookingSoundReference(booking)) {
    return "Open the atmosphere brief, confirm fee and move the case into negotiation.";
  }

  if (booking.status === "pending") {
    return "Review event facts and accept, decline, or request changes.";
  }

  if (booking.status === "accepted" && !dj?.technical_rider_url) {
    return "Upload or collect the technical rider before contract preparation.";
  }

  if (booking.status === "accepted") {
    return "Rider is ready. Prepare contract package and escrow preview.";
  }

  if (booking.status === "paid") {
    return "Escrow preview is prepared. Confirm final logistics and event checklist.";
  }

  if (booking.status === "completed") {
    return "Case complete. Ready for review, archive and analytics.";
  }

  if (booking.status === "declined") {
    return "Closed as no fit. Keep the atmosphere brief for future lineup planning.";
  }

  if (booking.status === "cancelled") {
    return "Cancelled. Check timeline conflicts and release the date hold.";
  }

  if (booking.status === "disputed") {
    return "Dispute active. Keep messages, rider, fee and sound reference in the case file.";
  }

  return "Open case file for next action.";
}

export function getBookingTimelineSteps(booking?: Booking | null, dj?: DjProfile): BookingTimelineStep[] {
  const status = booking?.status;
  const hasSound = hasBookingSoundReference(booking);
  const accepted = isAcceptedBookingStatus(status);
  const riderReady = Boolean(dj?.technical_rider_url);
  const paid = status === "paid" || status === "completed";
  const completed = status === "completed";
  const closed = isClosedBookingStatus(status);

  return [
    {
      label: "Request sent",
      copy: booking ? "Event facts entered and request created." : "Waiting for a selected booking case.",
      state: booking ? "done" : "waiting"
    },
    {
      label: "Atmosphere brief",
      copy: hasSound ? "Sound reference is attached to this case." : "No track moment attached yet.",
      state: hasSound ? "done" : booking ? "current" : "waiting"
    },
    {
      label: "Fee discussed",
      copy: accepted ? "Offer accepted; commercial terms can move forward." : "Fee and conditions still need confirmation.",
      state: accepted ? "done" : closed ? "blocked" : booking ? "current" : "waiting"
    },
    {
      label: "Rider uploaded",
      copy: riderReady
        ? "Technical rider is attached and production can review it."
        : accepted
          ? "Technical rider and production details are the active blocker."
          : "Rider step unlocks after artist acceptance.",
      state: riderReady ? "done" : accepted ? "current" : closed ? "blocked" : "waiting"
    },
    {
      label: "Contract next",
      copy: riderReady
        ? "Contract package can be prepared from event facts, fee, chat and rider."
        : accepted
          ? "Contract is blocked until rider lock."
          : "Waiting on acceptance before contract work.",
      state: riderReady ? "current" : accepted ? "blocked" : closed ? "blocked" : "waiting"
    },
    {
      label: "Deposit / escrow",
      copy: paid ? "Payment state is ready for final release logic." : "Deposit preview only; provider integration belongs to V3.",
      state: completed ? "done" : paid ? "done" : riderReady ? "waiting" : closed ? "blocked" : "waiting"
    }
  ];
}

export function getBookingEscrowPreview(booking?: Booking | null, dj?: DjProfile | null): BookingEscrowPreview {
  const artistFee = Number(dj?.price) > 0 ? Number(dj?.price) : 2500;
  const deposit = Math.round(artistFee * 0.3);
  const platformFee = Math.round(artistFee * 0.08);
  const artistPayout = Math.max(0, artistFee - platformFee);
  const state = getEscrowState(booking?.status);

  return {
    artistFee,
    deposit,
    platformFee,
    artistPayout,
    state,
    timeline: [
      { label: "Not funded", state: booking?.status === "pending" ? "current" : state === "blocked" ? "blocked" : "done" },
      {
        label: "Deposit pending",
        state: booking?.status === "accepted" ? "current" : booking?.status === "pending" ? "waiting" : state === "blocked" ? "blocked" : "done"
      },
      { label: "Escrow ready", state: booking?.status === "paid" ? "done" : state === "blocked" ? "blocked" : "waiting" },
      { label: "Payout release", state: booking?.status === "completed" ? "done" : state === "blocked" ? "blocked" : "waiting" }
    ]
  };
}

export function getEscrowState(status?: BookingStatus | null): EscrowPreviewState {
  if (status === "completed") {
    return "released";
  }

  if (status === "paid") {
    return "escrow_ready";
  }

  if (status === "accepted") {
    return "deposit_pending";
  }

  if (isClosedBookingStatus(status)) {
    return "blocked";
  }

  return "not_funded";
}

export function canViewBookingCase(
  profile: Pick<Profile, "id" | "role">,
  roles: Role[],
  booking: Booking,
  dj?: DjProfile | null
) {
  if (hasRoleAccess(roles, ["admin"])) {
    return true;
  }

  if (booking.organizer_id === profile.id) {
    return hasRoleAccess(roles, ["organizer", "venue", "admin"]);
  }

  if (dj?.user_id === profile.id) {
    return hasRoleAccess(roles, ["dj", "admin"]);
  }

  return false;
}
