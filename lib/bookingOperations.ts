import type { SupabaseClient } from "@supabase/supabase-js";
import { logSupabaseError } from "@/lib/supabase";
import type { Booking, BookingStatus, EventLineupSlotStatus } from "@/lib/types";

export type SavedMomentCaseStatus = "saved" | "used-in-booking" | "in-case-file";

export function getLineupSlotStatusForBooking(status: BookingStatus): EventLineupSlotStatus {
  if (status === "accepted" || status === "paid" || status === "completed") {
    return "accepted";
  }

  if (status === "declined" || status === "cancelled" || status === "disputed") {
    return "blocked";
  }

  return "hold";
}

export function getSavedMomentStatusForBooking(status: BookingStatus): SavedMomentCaseStatus {
  if (status === "accepted" || status === "paid" || status === "completed") {
    return "in-case-file";
  }

  if (status === "pending") {
    return "used-in-booking";
  }

  return "saved";
}

export async function syncBookingOperationsAfterStatusChange(
  supabase: SupabaseClient,
  booking: Pick<Booking, "id" | "status" | "source_slot_id" | "source_saved_moment_id">,
  status: BookingStatus
) {
  const nextSlotStatus = getLineupSlotStatusForBooking(status);
  const nextMomentStatus = getSavedMomentStatusForBooking(status);

  const { data: slots, error: slotsError } = await supabase
    .from("event_lineup_slots")
    .select("id,saved_moment_id")
    .eq("booking_id", booking.id);

  if (slotsError) {
    logSupabaseError("Booking operations slot lookup failed", slotsError);
    return;
  }

  const slotIds = Array.from(new Set([
    ...(((slots as Array<{ id: string; saved_moment_id: string | null }>) ?? []).map((slot) => slot.id)),
    booking.source_slot_id
  ].filter(Boolean) as string[]));
  const savedMomentIds = ((slots as Array<{ id: string; saved_moment_id: string | null }>) ?? [])
    .map((slot) => slot.saved_moment_id)
    .filter(Boolean) as string[];
  if (booking.source_saved_moment_id) {
    savedMomentIds.push(booking.source_saved_moment_id);
  }
  const uniqueSavedMomentIds = Array.from(new Set(savedMomentIds));

  if (slotIds.length > 0) {
    const { error: slotUpdateError } = await supabase
      .from("event_lineup_slots")
      .update({
        status: nextSlotStatus,
        updated_at: new Date().toISOString()
      })
      .in("id", slotIds);

    if (slotUpdateError) {
      logSupabaseError("Booking operations slot status sync failed", slotUpdateError);
    }
  }

  if (uniqueSavedMomentIds.length > 0) {
    const { error: momentUpdateError } = await supabase
      .from("saved_moments")
      .update({
        status: nextMomentStatus,
        updated_at: new Date().toISOString()
      })
      .in("id", uniqueSavedMomentIds);

    if (momentUpdateError) {
      logSupabaseError("Booking operations saved moment sync failed", momentUpdateError);
    }
  }
}
