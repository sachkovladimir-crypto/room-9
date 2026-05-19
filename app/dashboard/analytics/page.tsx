"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { MissingConfigNotice } from "@/components/AuthNotice";
import { ButtonLink, MetricCard, Panel, SectionHeader, Text } from "@/components/room9-ui";
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
  type Profile,
  type Role,
  type Work
} from "@/lib/types";

export default function DashboardAnalyticsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeRoles, setActiveRoles] = useState<Role[]>(["listener"]);
  const [djProfile, setDjProfile] = useState<DjProfile | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [events, setEvents] = useState<EventPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      return;
    }

    async function loadAnalytics() {
      setIsLoading(true);
      setError("");

      try {
        const supabase = getSupabase();
        const { data: sessionData, error: userError } = await supabase.auth.getSession();

        if (userError) {
          if (isMissingAuthSession(userError)) {
            router.push("/login?next=/dashboard/analytics");
            return;
          }

          logSupabaseError("Dashboard analytics auth failed", userError);
          setError(formatSupabaseError(userError, "Could not load analytics."));
          return;
        }

        const user = sessionData.session?.user ?? null;
        if (!user) {
          router.push("/login?next=/dashboard/analytics");
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError || !profileData) {
          logSupabaseError("Dashboard analytics profile failed", profileError);
          setError(formatSupabaseError(profileError, "Could not load profile."));
          return;
        }

        const loadedProfile = profileData as Profile;
        setProfile(loadedProfile);
        const loadedRoles = await loadRoleAccess(supabase, loadedProfile.id, loadedProfile.role);
        setActiveRoles(loadedRoles);

        if (!canAccessWorkspaceSection("analytics", loadedRoles)) {
          router.replace(getWorkspaceUnlockHref("analytics"));
          return;
        }

        if (hasRoleAccess(loadedRoles, ["dj"])) {
          const { data: djData } = await supabase
            .from("dj_profiles")
            .select("*")
            .eq("user_id", loadedProfile.id)
            .maybeSingle();
          const dj = (djData as DjProfile | null) ?? null;
          setDjProfile(dj);
          if (dj) {
            const [{ data: bookingData }, { data: worksData }] = await Promise.all([
              supabase.from("bookings").select("*").eq("dj_id", dj.id).order("created_at", { ascending: false }).limit(120),
              supabase.from("works").select("*").eq("dj_id", dj.id).order("created_at", { ascending: false }).limit(120)
            ]);
            setBookings((bookingData as Booking[]) ?? []);
            setWorks(((worksData as Work[]) ?? []).filter((work) => !work.is_deleted));
          }
        } else {
          const [{ data: bookingData }, { data: eventData }] = await Promise.all([
            supabase.from("bookings").select("*").eq("organizer_id", loadedProfile.id).order("created_at", { ascending: false }).limit(120),
            isBookingClientRole(loadedRoles)
              ? supabase.from("events").select("*").eq("organizer_id", loadedProfile.id).order("event_date", { ascending: true }).limit(80)
              : supabase.from("events").select("*").limit(8)
          ]);
          setBookings((bookingData as Booking[]) ?? []);
          setEvents((eventData as EventPost[]) ?? []);
        }
      } catch (caughtError) {
        logSupabaseError("Dashboard analytics unexpected failure", caughtError);
        setError(formatSupabaseError(caughtError, "Could not load analytics."));
      } finally {
        setIsLoading(false);
      }
    }

    loadAnalytics();
  }, [router]);

  const totalPlays = works.reduce((sum, work) => sum + (work.play_count ?? 0), 0);
  const soundRefs = bookings.filter((booking) => booking.source_work_id || booking.source_timestamp_label).length;
  const accepted = bookings.filter((booking) => booking.status === "accepted").length;
  const pending = bookings.filter((booking) => booking.status === "pending").length;

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

  if (error && !profile) {
    return (
      <main className="room-page">
        <section className="room-shell py-12">
          <EmptyState title="Analytics unavailable" message={error} href="/dashboard" action="Dashboard" />
        </section>
      </main>
    );
  }

  return (
    <WorkspacePageFrame
      active="analytics"
      email={profile?.email}
      pendingCount={pending}
      profileLabel={djProfile?.stage_name || profile?.email || "ROOM_9"}
      readiness={82}
      role={activeRoles}
    >
      <div className="px-room-3 py-room-3 xl:px-room-4">
        <WorkspaceOpsHeader
          actions={
            <>
              <ButtonLink href="/library" variant="secondary">
                Music Signals
              </ButtonLink>
              <ButtonLink href="/dashboard/bookings" variant="primary">
                Booking Ops
              </ButtonLink>
            </>
          }
          description="Music demand, booking conversion, event activity, and saved sound references in one operational report."
          eyebrow="Workspace / Analytics"
          title="Signal Report"
        />

        {error ? <WorkspaceNotice tone="error">{error}</WorkspaceNotice> : null}

        <WorkspaceMetricGrid columns={5}>
          <MetricCard active label="Bookings" note="Total cases" value={bookings.length} />
          <MetricCard label="Pending" note="Needs action" value={pending} />
          <MetricCard label="Accepted" note="Confirmed flow" value={accepted} />
          <MetricCard label="Sound refs" note="Booked from moments" value={soundRefs} />
          <MetricCard
            label={hasRoleAccess(activeRoles, ["dj"]) ? "Track plays" : "Events"}
            note={hasRoleAccess(activeRoles, ["dj"]) ? "Music demand" : "Event pages"}
            value={hasRoleAccess(activeRoles, ["dj"]) ? totalPlays : events.length}
          />
        </WorkspaceMetricGrid>

        <WorkspaceCommandGrid columns={3}>
          <WorkspaceCommandPanel
            active={soundRefs > 0}
            label="Music to booking"
            title={`${soundRefs} sound references`}
            body="Tracks and saved references are being used as atmosphere briefs."
          />
          <WorkspaceCommandPanel
            active={pending > 0}
            label="Action queue"
            title={`${pending} pending cases`}
            body="Open Booking Ops to move requests through rider, contract and escrow preview."
          />
          <WorkspaceCommandPanel
            label={hasRoleAccess(activeRoles, ["dj"]) ? "Library demand" : "Event demand"}
            title={hasRoleAccess(activeRoles, ["dj"]) ? `${totalPlays} plays` : `${events.length} events`}
            body={hasRoleAccess(activeRoles, ["dj"]) ? "Track plays inform which peak moments are worth promoting." : "Event activity drives lineup and budget decisions."}
          />
        </WorkspaceCommandGrid>

        <div className="mt-room-4 grid gap-room-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Panel className="p-room-3">
            <SectionHeader eyebrow="Chart" title="Booking Conversion" />
            <div className="mt-room-4 flex h-64 items-end gap-room-2 border border-roomBorder p-room-3">
              {[
                { label: "requests", value: bookings.length, color: "bg-[#58A6FF]" },
                { label: "sound refs", value: soundRefs, color: "bg-acidGreen" },
                { label: "pending", value: pending, color: "bg-warningOrange" },
                { label: "accepted", value: accepted, color: "bg-successGreen" }
              ].map((item) => {
                const height = Math.max(10, Math.min(100, bookings.length ? (item.value / bookings.length) * 100 : 10));
                return (
                  <div className="flex flex-1 flex-col justify-end gap-room-2" key={item.label}>
                    <div className={`${item.color} min-h-3`} style={{ height: `${height}%` }} />
                    <Text className="text-center" variant="uiLabel">
                      {item.label}
                    </Text>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel className="p-room-3">
            <SectionHeader eyebrow="Reading" title="What It Means" />
            <Text className="mt-room-3" variant="small">
              Analytics stays intentionally simple for the MVP. The useful diploma point is the relationship between listening behavior, saved sound references, and professional booking cases.
            </Text>
          </Panel>
        </div>
      </div>
    </WorkspacePageFrame>
  );
}
