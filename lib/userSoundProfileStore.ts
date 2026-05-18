import { getSupabase, hasSupabaseConfig, logSupabaseError } from "@/lib/supabase";
import type { UserSoundProfile } from "@/lib/types";
import type { UserSoundProfileDraft } from "@/lib/userSoundProfile";

let soundProfileTableUnavailable = false;
let soundProfileWarningShown = false;

export async function persistUserSoundProfile(profile: UserSoundProfileDraft, userId?: string | null) {
  if (!hasSupabaseConfig() || soundProfileTableUnavailable || !userId) {
    return;
  }

  try {
    const { error } = await getSupabase()
      .from("user_sound_profile")
      .upsert(
        {
          avg_darkness: profile.avg_darkness,
          avg_energy: profile.avg_energy,
          avg_groove: profile.avg_groove,
          bpm_max: profile.bpm_max,
          bpm_min: profile.bpm_min,
          confidence: profile.confidence,
          interaction_count: profile.interaction_count,
          playlist_track_count: profile.playlist_track_count,
          preferred_genres: profile.preferred_genres,
          preferred_room_types: profile.preferred_room_types,
          profile_vector: profile.profile_vector,
          saved_moment_count: profile.saved_moment_count,
          saved_track_count: profile.saved_track_count,
          top_dna_tags: profile.top_dna_tags,
          updated_at: new Date().toISOString(),
          user_id: userId
        },
        { onConflict: "user_id" }
      );

    if (error) {
      if (isMissingSoundProfileTable(error)) {
        soundProfileTableUnavailable = true;
        if (!soundProfileWarningShown) {
          soundProfileWarningShown = true;
          console.warn("[ROOM_9] user_sound_profile table is not available yet. Run supabase/schema.sql to persist Sound Profile models.");
        }
        return;
      }
      logSupabaseError("User Sound Profile upsert failed", error);
    }
  } catch (error) {
    logSupabaseError("User Sound Profile upsert crashed", error);
  }
}

export async function readUserSoundProfile(userId?: string | null): Promise<UserSoundProfile | null> {
  if (!hasSupabaseConfig() || soundProfileTableUnavailable || !userId) {
    return null;
  }

  try {
    const { data, error } = await getSupabase()
      .from("user_sound_profile")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      if (isMissingSoundProfileTable(error)) {
        soundProfileTableUnavailable = true;
        if (!soundProfileWarningShown) {
          soundProfileWarningShown = true;
          console.warn("[ROOM_9] user_sound_profile table is not available yet. Run supabase/schema.sql to enable cross-device Sound Profile reads.");
        }
        return null;
      }

      logSupabaseError("User Sound Profile read failed", error);
      return null;
    }

    return (data as UserSoundProfile | null) ?? null;
  } catch (error) {
    logSupabaseError("User Sound Profile read crashed", error);
    return null;
  }
}

function isMissingSoundProfileTable(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };
  const message = maybeError.message?.toLowerCase() ?? "";
  return (
    maybeError.code === "42P01" ||
    maybeError.code === "PGRST205" ||
    (message.includes("user_sound_profile") && (message.includes("does not exist") || message.includes("schema cache")))
  );
}
