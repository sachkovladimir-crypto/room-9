import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeRoleAccess, type ProfileRoleAccess, type Role } from "@/lib/types";

type RoleAccessQueryRow = Pick<ProfileRoleAccess, "role" | "status">;

export async function loadRoleAccess(
  supabase: SupabaseClient,
  userId: string,
  fallbackRole?: Role | null
) {
  const { data, error } = await supabase
    .from("profile_role_access")
    .select("role,status")
    .eq("user_id", userId);

  if (error) {
    if (isMissingRoleAccessTable(error)) {
      return normalizeRoleAccess(fallbackRole, null);
    }

    throw error;
  }

  return normalizeRoleAccess("listener", (data as RoleAccessQueryRow[]) ?? []);
}

export async function activateRoleAccess(
  supabase: SupabaseClient,
  userId: string,
  role: Role
) {
  if (role === "listener") {
    return normalizeRoleAccess("listener", null);
  }

  const { error } = await supabase
    .from("profile_role_access")
    .upsert(
      {
        role,
        status: "active",
        updated_at: new Date().toISOString(),
        user_id: userId
      },
      { onConflict: "user_id,role" }
    );

  if (error) {
    if (isMissingRoleAccessTable(error)) {
      return normalizeRoleAccess(role, null);
    }

    throw error;
  }

  return loadRoleAccess(supabase, userId, role);
}

function isMissingRoleAccessTable(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const errorRecord = error as { code?: string; message?: string };
  const message = errorRecord.message?.toLowerCase() ?? "";
  return (
    errorRecord.code === "42P01" ||
    errorRecord.code === "PGRST205" ||
    message.includes("profile_role_access") ||
    message.includes("could not find the table")
  );
}
