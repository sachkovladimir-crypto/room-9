"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { NotificationCenter } from "@/components/NotificationCenter";
import { StatusBadge, Text, cx } from "@/components/room9-ui";
import { getSupabase, hasSupabaseConfig, logSupabaseError } from "@/lib/supabase";
import { hasRoleAccess, type Profile, type Role } from "@/lib/types";

export type WorkspaceSection =
  | "dashboard"
  | "bookings"
  | "vault"
  | "musicLab"
  | "calendar"
  | "streams"
  | "events"
  | "analytics"
  | "settings";

type WorkspaceNavItem = {
  key: WorkspaceSection;
  label: string;
  href: string;
  dot: string;
  glyph: string;
  group: "workspace" | "operations" | "system";
  unlock: "all" | "professional" | "dj" | "client";
};

const workspaceNavItems: WorkspaceNavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", dot: "bg-acidGreen", glyph: "DB", group: "workspace", unlock: "all" },
  { key: "musicLab", label: "Music Lab", href: "/dashboard/music-lab", dot: "bg-acidGreen", glyph: "ML", group: "workspace", unlock: "dj" },
  { key: "events", label: "Event Desk", href: "/dashboard/events", dot: "bg-acidGreen", glyph: "EV", group: "operations", unlock: "client" },
  { key: "bookings", label: "Booking CRM", href: "/dashboard/bookings", dot: "bg-warningOrange", glyph: "BK", group: "operations", unlock: "professional" },
  { key: "calendar", label: "Timeline", href: "/dashboard/calendar", dot: "bg-mutedText", glyph: "TL", group: "operations", unlock: "professional" },
  { key: "streams", label: "Streams", href: "/dashboard/streams", dot: "bg-successGreen", glyph: "ST", group: "system", unlock: "dj" },
  { key: "analytics", label: "Analytics", href: "/dashboard/analytics", dot: "bg-mutedText", glyph: "AN", group: "system", unlock: "professional" },
  { key: "settings", label: "Settings", href: "/dashboard/settings", dot: "bg-roomBorder", glyph: "SE", group: "system", unlock: "all" }
];

const workspaceGroups: Array<{ key: WorkspaceNavItem["group"]; label: string }> = [
  { key: "workspace", label: "Workspace" },
  { key: "operations", label: "Operations" },
  { key: "system", label: "System" }
];

export function WorkspaceSidebar({
  active,
  email,
  role,
  pendingCount = 0,
  profileLabel,
  readiness = 0,
  onLogout
}: {
  active: WorkspaceSection;
  email?: string | null;
  role?: Profile["role"] | Role[] | null;
  pendingCount?: number;
  profileLabel?: string;
  readiness?: number;
  onLogout?: () => void;
}) {
  const safeReadiness = Math.max(0, Math.min(100, Math.round(readiness)));
  const identity = profileLabel || email || "ROOM_9 USER";
  const initials = identity
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "R9";
  const roleLabel = Array.isArray(role)
    ? `${role.filter((item) => item !== "listener").join(" + ") || "listener"} access`
    : role
      ? `${role} access`
      : "workspace access";
  const unlockSummary = getWorkspaceUnlockSummary(role, safeReadiness);

  return (
    <aside className="flex min-h-[96px] min-w-0 flex-wrap items-center gap-room-3 overflow-x-hidden border-b border-roomBorder bg-[#090909] px-room-3 py-room-3 lg:sticky lg:top-0 lg:min-h-screen lg:w-[220px] lg:flex-col lg:items-stretch lg:overflow-visible lg:border-b-0 lg:border-r">
      <div className="flex min-w-0 flex-1 flex-col lg:w-full">
        <Link className="block font-display text-2xl uppercase leading-none text-paperWhite" href="/">
          ROOM_9
        </Link>
        <p className="mt-room-1 font-mono text-[9px] uppercase text-mutedText">Underground ops</p>

        <nav className="mt-room-5 hidden space-y-room-5 lg:block">
          {workspaceGroups.map((group) => (
            <div key={group.key}>
              <p className="mb-room-2 font-mono text-[9px] uppercase tracking-[0.28em] text-mutedText">
                {group.label}
              </p>
              <div className="space-y-room-1">
                {workspaceNavItems
                  .filter((item) => item.group === group.key)
                  .map((item) => {
                    const isActive = item.key === active;
                    const isUnlocked = canAccessWorkspaceSection(item.key, role);
                    const href = isUnlocked ? item.href : `/dashboard/settings?unlock=${item.key}`;
                    return (
                      <Link
                        className={cx(
                          "flex min-h-9 w-full min-w-0 max-w-full items-center justify-between gap-room-2 overflow-hidden border border-transparent px-room-2 font-mono text-[10px] font-black uppercase transition",
                          isActive
                            ? "bg-[#172200] text-acidGreen shadow-[inset_2px_0_0_#B8FF2C]"
                            : isUnlocked
                              ? "text-mutedText hover:border-roomBorder hover:bg-inkPanel hover:text-paperWhite"
                              : "text-neutral-700 hover:border-roomBorder hover:bg-inkPanel hover:text-mutedText"
                        )}
                        href={href}
                        key={item.key}
                        title={isUnlocked ? item.label : `Unlock ${item.label} in Settings`}
                      >
                        <span className="flex min-w-0 items-center gap-room-2">
                          <span
                            className={cx(
                              "grid h-5 w-5 shrink-0 place-items-center border font-mono text-[8px]",
                              isActive
                                ? "border-acidGreen bg-acidGreen text-voidBlack"
                                : isUnlocked
                                  ? "border-roomBorder bg-black text-mutedText"
                                  : "border-roomBorder bg-transparent text-neutral-700"
                            )}
                          >
                            {item.glyph}
                          </span>
                          <span className="truncate">{item.label}</span>
                        </span>
                        {!isUnlocked ? (
                          <span className="font-mono text-[9px] uppercase text-neutral-700">lock</span>
                        ) : item.key === "bookings" && pendingCount > 0 ? (
                          <span className={cx("px-2 py-1 text-[10px]", isActive ? "bg-acidGreen text-voidBlack" : "bg-paperWhite text-voidBlack")}>
                            {pendingCount}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-room-5 hidden border border-roomBorder bg-black p-room-2 lg:block">
          <div className="flex items-center justify-between gap-room-2">
            <Text variant="uiLabel">Unlock map</Text>
            <StatusBadge status={unlockSummary.status}>{unlockSummary.badge}</StatusBadge>
          </div>
          <Text as="p" className="mt-room-2 text-sm" variant="title">
            {unlockSummary.title}
          </Text>
          <Text className="mt-room-1" variant="small">
            {unlockSummary.copy}
          </Text>
        </div>

        <div className="mt-room-5 hidden w-full min-w-0 border border-roomBorder bg-panelBlack p-room-2 lg:block">
          <div className="flex min-w-0 items-center gap-room-2">
            <div className="grid h-9 w-9 shrink-0 place-items-center border border-strongBorder bg-voidBlack font-mono text-[10px] font-black uppercase text-acidGreen">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-start justify-between gap-room-2">
                <div className="min-w-0">
                  <p className="truncate font-display text-xs uppercase leading-none text-paperWhite" title={identity}>
                    {identity}
                  </p>
                  <p className="mt-1 truncate font-mono text-[8px] uppercase text-successGreen">{roleLabel}</p>
                </div>
                <NotificationCenter className="shrink-0" />
              </div>
              <div className="mt-room-2 flex items-center justify-between gap-room-2">
                <span className="font-mono text-[8px] uppercase text-mutedText">Profile</span>
                <span className="font-mono text-[8px] uppercase text-paperWhite">{safeReadiness}% ready</span>
              </div>
              <div className="mt-1 h-1 border border-roomBorder bg-voidBlack">
                <div className="h-full bg-acidGreen" style={{ width: `${safeReadiness}%` }} />
              </div>
              {onLogout ? (
                <button
                  className="mt-room-2 flex h-8 w-full items-center justify-between border border-roomBorder px-room-2 font-mono text-[9px] uppercase text-mutedText transition hover:border-paperWhite hover:text-paperWhite"
                  onClick={onLogout}
                  type="button"
                >
                  Exit workspace
                  <span aria-hidden="true">↗</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function isWorkspaceItemUnlocked(item: WorkspaceNavItem, role?: Profile["role"] | Role[] | null) {
  if (item.unlock === "all") {
    return true;
  }

  if (item.unlock === "professional") {
    return hasRoleAccess(role, ["dj", "organizer", "venue", "admin"]);
  }

  if (item.unlock === "client") {
    return hasRoleAccess(role, ["organizer", "venue", "admin"]);
  }

  if (item.unlock === "dj") {
    return hasRoleAccess(role, ["dj", "venue", "admin"]);
  }

  return false;
}

export function canAccessWorkspaceSection(section: WorkspaceSection, role?: Profile["role"] | Role[] | null) {
  const item = workspaceNavItems.find((navItem) => navItem.key === section);
  if (!item) {
    return true;
  }

  return isWorkspaceItemUnlocked(item, role);
}

export function getWorkspaceUnlockHref(section: WorkspaceSection) {
  return `/dashboard/settings?unlock=${section}`;
}

function getWorkspaceUnlockSummary(role?: Profile["role"] | Role[] | null, readiness = 0) {
  if (hasRoleAccess(role, ["dj"])) {
    return {
      badge: `${readiness}%`,
      copy: "Booking CRM, Timeline, Streams and Analytics are open. Event Desk unlocks for organizer or venue access.",
      status: readiness > 70 ? "unlocked" : "waiting",
      title: "DJ tools active"
    };
  }

  if (hasRoleAccess(role, ["organizer"])) {
    return {
      badge: `${readiness}%`,
      copy: "Event Desk, Booking CRM, Timeline and Analytics are open for lineup operations.",
      status: readiness > 70 ? "unlocked" : "waiting",
      title: "Organizer tools active"
    };
  }

  if (hasRoleAccess(role, ["venue"])) {
    return {
      badge: `${readiness}%`,
      copy: "Venue programming, bookings, timeline, streams and analytics are open for room operations.",
      status: readiness > 70 ? "unlocked" : "waiting",
      title: "Venue tools active"
    };
  }

  if (hasRoleAccess(role, ["admin"])) {
    return {
      badge: "v2",
      copy: "Admin moderation is documented as V2/V3 scope and stays outside regular booking flow.",
      status: "waiting",
      title: "Admin scope"
    };
  }

  return {
    badge: "locked",
    copy: "Start with Sound Vault. Unlock DJ, Organizer or Venue tools in Settings when the profile is ready.",
    status: "locked",
    title: "Listener mode"
  };
}

export function WorkspacePageFrame({
  active,
  children,
  email,
  role,
  pendingCount,
  profileLabel,
  readiness,
  onLogout
}: {
  active: WorkspaceSection;
  children: ReactNode;
  email?: string | null;
  role?: Profile["role"] | Role[] | null;
  pendingCount?: number;
  profileLabel?: string;
  readiness?: number;
  onLogout?: () => void;
}) {
  const router = useRouter();

  async function handleFrameLogout() {
    try {
      if (hasSupabaseConfig()) {
        const { error } = await getSupabase().auth.signOut();
        if (error) {
          logSupabaseError("Workspace logout failed", error);
        }
      }
    } catch (caughtError) {
      logSupabaseError("Workspace logout unexpected failure", caughtError);
    } finally {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <main className="room-page min-h-screen lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
      <WorkspaceSidebar
        active={active}
        email={email}
        pendingCount={pendingCount}
        profileLabel={profileLabel}
        readiness={readiness}
        role={role}
        onLogout={onLogout ?? handleFrameLogout}
      />
      <section className="min-w-0 pb-room-8">{children}</section>
    </main>
  );
}

export function WorkspaceOpsHeader({
  actions,
  description,
  eyebrow,
  meta,
  title
}: {
  actions?: ReactNode;
  description: string;
  eyebrow: string;
  meta?: ReactNode;
  title: string;
}) {
  return (
    <header className="grid gap-room-2 border-b border-roomBorder pb-room-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-room-2">
          <Text variant="uiLabel">{eyebrow}</Text>
          {meta}
        </div>
        <Text as="h1" className="mt-room-2 text-2xl leading-none md:text-3xl" variant="title">
          {title}
        </Text>
        <Text className="mt-room-2 max-w-3xl text-sm" variant="small">
          {description}
        </Text>
      </div>
      {actions ? <div className="flex flex-wrap gap-room-2 xl:justify-end">{actions}</div> : null}
    </header>
  );
}

const metricGridColumns = {
  4: "xl:grid-cols-4",
  5: "xl:grid-cols-5",
  6: "xl:grid-cols-6"
} as const;

export function WorkspaceMetricGrid({
  children,
  columns = 5
}: {
  children: ReactNode;
  columns?: keyof typeof metricGridColumns;
}) {
  return (
    <section className={cx("mt-room-4 grid gap-room-2 md:grid-cols-2", metricGridColumns[columns])}>
      {children}
    </section>
  );
}

const noticeTone = {
  error: "border-errorRed bg-[#180606] text-errorRed",
  success: "border-successGreen bg-[#06170C] text-successGreen",
  neutral: "border-roomBorder bg-panelBlack text-mutedText"
} as const;

export function WorkspaceNotice({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: keyof typeof noticeTone;
}) {
  return (
    <p className={cx("mt-room-3 border p-room-2 font-mono text-[10px] uppercase leading-5", noticeTone[tone])}>
      {children}
    </p>
  );
}

const commandGridColumns = {
  3: "xl:grid-cols-3",
  5: "xl:grid-cols-5"
} as const;

export function WorkspaceCommandGrid({
  children,
  columns = 3
}: {
  children: ReactNode;
  columns?: keyof typeof commandGridColumns;
}) {
  return (
    <section className={cx("mt-room-4 grid gap-room-2", commandGridColumns[columns])}>
      {children}
    </section>
  );
}

export function WorkspaceCommandPanel({
  active = false,
  body,
  children,
  label,
  status,
  title
}: {
  active?: boolean;
  body?: ReactNode;
  children?: ReactNode;
  label: string;
  status?: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className={cx("border bg-panelBlack p-room-2", active ? "border-acidGreen" : "border-roomBorder")}>
      <div className="flex items-center justify-between gap-room-2">
        <Text className={active ? "text-acidGreen" : undefined} variant="uiLabel">
          {label}
        </Text>
        {status}
      </div>
      <Text as="h3" className="mt-room-2 text-lg" variant="title">
        {title}
      </Text>
      {body ? (
        <Text className="mt-room-2" variant="small">
          {body}
        </Text>
      ) : null}
      {children}
    </div>
  );
}
