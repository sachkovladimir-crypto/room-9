import { getSupabase, hasSupabaseConfig, isMissingAuthSession, logSupabaseError } from "@/lib/supabase";
import type { UserInteractionType } from "@/lib/types";

type InteractionInput = {
  bookingId?: string | null;
  djId?: string | null;
  eventId?: string | null;
  interactionType: UserInteractionType;
  metadata?: Record<string, unknown>;
  scope?: string | null;
  timestampSeconds?: number | null;
  weight?: number;
  workId?: string | null;
};

let interactionTableUnavailable = false;
let interactionTableWarningShown = false;

export function trackUserInteraction(input: InteractionInput) {
  void trackUserInteractionAsync(input);
}

export async function trackUserInteractionAsync({
  bookingId,
  djId,
  eventId,
  interactionType,
  metadata,
  scope,
  timestampSeconds,
  weight = 1,
  workId
}: InteractionInput) {
  if (!hasSupabaseConfig() || interactionTableUnavailable) {
    return;
  }

  try {
    const supabase = getSupabase();
    const userId = scope ?? (await getCurrentUserId());

    if (!userId) {
      return;
    }

    const nextMetadata: Record<string, unknown> = {
      ...(metadata ?? {}),
      client: "room9-web"
    };

    if (workId && !isUuidLike(workId)) {
      nextMetadata.original_work_id = workId;
    }

    if (djId && !isUuidLike(djId)) {
      nextMetadata.original_dj_id = djId;
    }

    if (eventId && !isUuidLike(eventId)) {
      nextMetadata.original_event_id = eventId;
    }

    if (bookingId && !isUuidLike(bookingId)) {
      nextMetadata.original_booking_id = bookingId;
    }

    const payload = {
      user_id: userId,
      work_id: normalizeUuid(workId),
      dj_id: normalizeUuid(djId),
      event_id: normalizeUuid(eventId),
      booking_id: normalizeUuid(bookingId),
      interaction_type: interactionType,
      timestamp_seconds: typeof timestampSeconds === "number" ? Math.max(0, Math.round(timestampSeconds)) : null,
      weight,
      metadata: nextMetadata
    };

    const { error } = await supabase.from("user_interactions").insert(payload);
    if (error) {
      if (isMissingInteractionTable(error)) {
        interactionTableUnavailable = true;
        if (!interactionTableWarningShown) {
          interactionTableWarningShown = true;
          console.warn("[ROOM_9] user_interactions table is not available yet. Run supabase/schema.sql to enable Signal behavior capture.");
        }
        return;
      }

      logSupabaseError("Signal interaction insert failed", error);
    }
  } catch (error) {
    logSupabaseError("Signal interaction capture crashed", error);
  }
}

async function getCurrentUserId() {
  try {
    const { data, error } = await getSupabase().auth.getSession();
    if (error && !isMissingAuthSession(error)) {
      logSupabaseError("Signal interaction user lookup failed", error);
    }

    return data.session?.user?.id ?? null;
  } catch (error) {
    logSupabaseError("Signal interaction user lookup crashed", error);
    return null;
  }
}

function normalizeUuid(value?: string | null) {
  return value && isUuidLike(value) ? value : null;
}

function isMissingInteractionTable(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };
  const message = maybeError.message?.toLowerCase() ?? "";
  return (
    maybeError.code === "42P01" ||
    maybeError.code === "PGRST205" ||
    (message.includes("user_interactions") && (message.includes("does not exist") || message.includes("schema cache")))
  );
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
