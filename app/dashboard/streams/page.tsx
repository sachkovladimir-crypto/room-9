"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { MissingConfigNotice } from "@/components/AuthNotice";
import {
  Button,
  ButtonLink,
  Input,
  MetricCard,
  Panel,
  SectionHeader,
  Select,
  StatusBadge,
  Text
} from "@/components/room9-ui";
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
import { formatStreamDate } from "@/lib/streams";
import { hasRoleAccess, type LiveStream, type Profile, type Role } from "@/lib/types";

type StreamForm = {
  title: string;
  artist_name: string;
  location: string;
  genre: string;
  status: LiveStream["status"];
  starts_at: string;
  embed_url: string;
  stream_url: string;
  thumbnail_url: string;
};

const emptyForm: StreamForm = {
  title: "",
  artist_name: "",
  location: "",
  genre: "Techno",
  status: "upcoming",
  starts_at: "",
  embed_url: "",
  stream_url: "",
  thumbnail_url: ""
};

const previewStreams: LiveStream[] = [
  {
    id: "preview-stream-live",
    owner_id: null,
    title: "Basement Pressure Room",
    artist_name: "ROOM_9 SIGNAL",
    location: "Berlin",
    genre: "Industrial Techno",
    status: "live",
    starts_at: new Date().toISOString(),
    embed_url: null,
    stream_url: null,
    thumbnail_url: "/reference/live-crowd-clean.png",
    created_at: new Date().toISOString()
  },
  {
    id: "preview-stream-upcoming",
    owner_id: null,
    title: "Peak Hour Transmission",
    artist_name: "DJ STONIK",
    location: "Kyiv",
    genre: "Hard Groove",
    status: "upcoming",
    starts_at: "2026-10-24T22:00:00.000Z",
    embed_url: null,
    stream_url: null,
    thumbnail_url: "/reference/streams.png",
    created_at: "2026-05-01T12:00:00.000Z"
  }
];

export default function DashboardStreamsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeRoles, setActiveRoles] = useState<Role[]>(["listener"]);
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [form, setForm] = useState<StreamForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      return;
    }

    async function loadStreams() {
      setIsLoading(true);
      setError("");

      try {
        const supabase = getSupabase();
        const { data: userData, error: userError } = await supabase.auth.getUser();

        if (userError) {
          if (isMissingAuthSession(userError)) {
            router.push("/login?next=/dashboard/streams");
            return;
          }

          logSupabaseError("Dashboard streams auth failed", userError);
          setError(formatSupabaseError(userError, "Could not load stream workspace."));
          return;
        }

        if (!userData.user) {
          router.push("/login?next=/dashboard/streams");
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userData.user.id)
          .maybeSingle();

        if (profileError || !profileData) {
          logSupabaseError("Dashboard streams profile failed", profileError);
          setError(formatSupabaseError(profileError, "Could not load workspace profile."));
          return;
        }

        const loadedProfile = profileData as Profile;
        setProfile(loadedProfile);
        const loadedRoles = await loadRoleAccess(supabase, loadedProfile.id, loadedProfile.role);
        setActiveRoles(loadedRoles);

        if (!canAccessWorkspaceSection("streams", loadedRoles)) {
          router.replace(getWorkspaceUnlockHref("streams"));
          return;
        }

        const streamQuery =
          hasRoleAccess(loadedRoles, ["dj"])
            ? supabase
                .from("live_streams")
                .select("*")
                .eq("owner_id", loadedProfile.id)
                .order("created_at", { ascending: false })
            : supabase.from("live_streams").select("*").order("created_at", { ascending: false }).limit(8);

        const { data: streamData, error: streamError } = await streamQuery;

        if (streamError) {
          logSupabaseError("Dashboard streams rows failed", streamError);
          setError(formatSupabaseError(streamError, "Could not load streams. Re-run supabase/schema.sql."));
        } else {
          setStreams((streamData as LiveStream[]) ?? []);
        }
      } catch (caughtError) {
        logSupabaseError("Dashboard streams unexpected failure", caughtError);
        setError(formatSupabaseError(caughtError, "Could not load stream workspace."));
      } finally {
        setIsLoading(false);
      }
    }

    loadStreams();
  }, [router]);

  async function saveStream(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !hasRoleAccess(activeRoles, ["dj"])) {
      setError("Stream creation unlocks after DJ verification.");
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");

    const payload = {
      owner_id: profile.id,
      title: form.title,
      artist_name: form.artist_name,
      location: form.location || null,
      genre: form.genre || null,
      status: form.status,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      embed_url: form.embed_url || null,
      stream_url: form.stream_url || null,
      thumbnail_url: form.thumbnail_url || null
    };

    try {
      const supabase = getSupabase();
      const request = editingId
        ? supabase.from("live_streams").update(payload).eq("id", editingId).select("*").single()
        : supabase.from("live_streams").insert(payload).select("*").single();

      const { data, error: saveError } = await request;

      if (saveError) {
        logSupabaseError("Dashboard streams save failed", saveError);
        setError(formatSupabaseError(saveError, "Could not save stream."));
        return;
      }

      const saved = data as LiveStream;
      setStreams((current) =>
        editingId ? current.map((stream) => (stream.id === saved.id ? saved : stream)) : [saved, ...current]
      );
      setEditingId(null);
      setForm(emptyForm);
      setNotice("Stream saved to your workspace.");
    } catch (caughtError) {
      logSupabaseError("Dashboard streams save crashed", caughtError);
      setError(formatSupabaseError(caughtError, "Could not save stream."));
    } finally {
      setIsSaving(false);
    }
  }

  function editStream(stream: LiveStream) {
    setEditingId(stream.id);
    setForm({
      title: stream.title,
      artist_name: stream.artist_name,
      location: stream.location ?? "",
      genre: stream.genre ?? "Techno",
      status: stream.status,
      starts_at: stream.starts_at ? stream.starts_at.slice(0, 16) : "",
      embed_url: stream.embed_url ?? "",
      stream_url: stream.stream_url ?? "",
      thumbnail_url: stream.thumbnail_url ?? ""
    });
  }

  async function updateStreamStatus(streamId: string, nextStatus: LiveStream["status"]) {
    if (!profile || !hasRoleAccess(activeRoles, ["dj"])) {
      setError("Stream status changes unlock after DJ verification.");
      return;
    }

    setError("");
    setNotice("");

    try {
      const supabase = getSupabase();
      const { data, error: statusError } = await supabase
        .from("live_streams")
        .update({ status: nextStatus })
        .eq("id", streamId)
        .eq("owner_id", profile.id)
        .select("*")
        .single();

      if (statusError) {
        logSupabaseError("Dashboard streams status update failed", statusError);
        setError(formatSupabaseError(statusError, "Could not update stream status."));
        return;
      }

      const updated = data as LiveStream;
      setStreams((current) => current.map((stream) => (stream.id === updated.id ? updated : stream)));
      setNotice(`Stream marked ${nextStatus}.`);
    } catch (caughtError) {
      logSupabaseError("Dashboard streams status update crashed", caughtError);
      setError(formatSupabaseError(caughtError, "Could not update stream status."));
    }
  }

  const visibleStreams = streams.length > 0 ? streams : previewStreams;
  const liveCount = streams.filter((stream) => stream.status === "live").length;
  const upcomingCount = streams.filter((stream) => stream.status === "upcoming").length;
  const archiveCount = streams.filter((stream) => stream.status === "archived").length;
  const hasDjAccess = hasRoleAccess(activeRoles, ["dj"]);

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
          <EmptyState title="Streams unavailable" message={error} href="/dashboard" action="Dashboard" />
        </section>
      </main>
    );
  }

  return (
    <WorkspacePageFrame
      active="streams"
      email={profile?.email}
      pendingCount={0}
      profileLabel={profile?.email || "ROOM_9"}
      readiness={hasDjAccess ? 82 : 48}
      role={activeRoles}
    >
      <div className="px-room-3 py-room-3 xl:px-room-4">
        <WorkspaceOpsHeader
          actions={
            <>
              <ButtonLink href="/library" variant="secondary">
                Sound Vault
              </ButtonLink>
              <ButtonLink href="/streams" variant="primary">
                Public Streams
              </ButtonLink>
            </>
          }
          description="Schedule live rooms, connect stream proof to artist trust, and keep archive sets ready for discovery."
          eyebrow="Workspace / Stream System"
          title="Stream Control"
        />

        {error ? <WorkspaceNotice tone="error">{error}</WorkspaceNotice> : null}
        {notice ? <WorkspaceNotice tone="success">{notice}</WorkspaceNotice> : null}

        <WorkspaceMetricGrid columns={4}>
          <MetricCard active={liveCount > 0} label="Live" note="On air now" value={liveCount} />
          <MetricCard label="Upcoming" note="Scheduled rooms" value={upcomingCount} />
          <MetricCard label="Archive" note="Replay proof" value={archiveCount} />
          <MetricCard label="Access" note={hasDjAccess ? "DJ verified" : "Needs verification"} value={hasDjAccess ? "Ready" : "Locked"} />
        </WorkspaceMetricGrid>

        <WorkspaceCommandGrid columns={3}>
          <WorkspaceCommandPanel
            active={liveCount > 0}
            label="Live state"
            title={liveCount > 0 ? "Room broadcasting" : "No active room"}
            body={liveCount > 0 ? "Public stream listeners can enter the current room." : "Schedule a room when a live proof moment is needed."}
          />
          <WorkspaceCommandPanel
            active={upcomingCount > 0}
            label="Next transmission"
            title={`${upcomingCount} upcoming`}
            body="Upcoming rooms keep artist dossiers and public stream pages fresh."
          />
          <WorkspaceCommandPanel
            label="Archive proof"
            title={`${archiveCount} archived`}
            body="Archived sessions become listening proof for saved references and future bookings."
          />
        </WorkspaceCommandGrid>

        <div className="mt-room-4 grid gap-room-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <Panel className="p-room-3">
            <SectionHeader
              eyebrow={hasDjAccess ? "DJ tools" : "Access locked"}
              title={editingId ? "Edit Stream" : "Create Stream"}
            />
            {!hasDjAccess ? (
              <div className="mt-room-3 border border-roomBorder bg-black p-room-3">
                <StatusBadge status="waiting">verification required</StatusBadge>
                <Text as="h3" className="mt-room-3 text-xl" variant="title">
                  Stream tools unlock after DJ verification.
                </Text>
                <Text className="mt-room-2" variant="small">
                  Listeners and organizers can watch streams. Verified DJs can create live rooms, upload stream URLs,
                  and publish archive sessions from this workspace.
                </Text>
                <ButtonLink className="mt-room-3" href="/dashboard/settings" variant="secondary">
                  Open Settings
                </ButtonLink>
              </div>
            ) : (
              <form className="mt-room-3 space-y-room-3" onSubmit={saveStream}>
                <div className="grid gap-room-2 md:grid-cols-2">
                  <StreamField label="Title" value={form.title} onChange={(value) => setForm({ ...form, title: value })} required />
                  <StreamField label="Artist name" value={form.artist_name} onChange={(value) => setForm({ ...form, artist_name: value })} required />
                  <StreamField label="Location" value={form.location} onChange={(value) => setForm({ ...form, location: value })} />
                  <StreamField label="Genre" value={form.genre} onChange={(value) => setForm({ ...form, genre: value })} />
                  <StreamStatus value={form.status} onChange={(value) => setForm({ ...form, status: value })} />
                  <StreamField
                    label="Starts at"
                    type="datetime-local"
                    value={form.starts_at}
                    onChange={(value) => setForm({ ...form, starts_at: value })}
                  />
                  <div className="md:col-span-2">
                    <StreamField label="Embed URL" value={form.embed_url} onChange={(value) => setForm({ ...form, embed_url: value })} />
                  </div>
                  <div className="md:col-span-2">
                    <StreamField label="Video URL" value={form.stream_url} onChange={(value) => setForm({ ...form, stream_url: value })} />
                  </div>
                  <div className="md:col-span-2">
                    <StreamField
                      label="Thumbnail URL"
                      value={form.thumbnail_url}
                      onChange={(value) => setForm({ ...form, thumbnail_url: value })}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-room-2">
                  <Button loading={isSaving} type="submit" variant="primary">
                    {editingId ? "Save Changes" : "Publish Stream"}
                  </Button>
                  {editingId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(null);
                        setForm(emptyForm);
                      }}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </form>
            )}
          </Panel>

          <Panel className="p-room-3">
            <SectionHeader
              eyebrow="Stream queue"
              title={streams.length > 0 ? "Your Rooms" : "Preview Workflow"}
              action={<Text variant="uiLabel">{visibleStreams.length} sessions</Text>}
            />
            <div className="mt-room-3 grid gap-room-2">
              {visibleStreams.map((stream) => (
                <StreamRow
                  canEdit={hasDjAccess && !stream.id.startsWith("preview-")}
                  key={stream.id}
                  stream={stream}
                  onEdit={() => editStream(stream)}
                  onStatusChange={(nextStatus) => updateStreamStatus(stream.id, nextStatus)}
                />
              ))}
            </div>
          </Panel>
        </div>

        <WorkspaceCommandGrid columns={3}>
          <WorkspaceCommandPanel
            label="Schedule"
            title="Create room"
            body="Live, upcoming, or archived streams start from the DJ workspace."
          />
          <WorkspaceCommandPanel
            label="Publish"
            title="Public stream proof"
            body="Streams appear on the public Streams page and support artist credibility."
          />
          <WorkspaceCommandPanel
            label="Convert"
            title="Archive into evidence"
            body="Archive sets become listening proof for future sound references and booking cases."
          />
        </WorkspaceCommandGrid>
      </div>
    </WorkspacePageFrame>
  );
}

function StreamField({
  label,
  value,
  onChange,
  type = "text",
  required = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");

  return (
    <label className="block" htmlFor={id}>
      <span className="mb-room-1 block font-mono text-[10px] font-black uppercase text-mutedText">{label}</span>
      <Input
        id={id}
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function StreamStatus({
  value,
  onChange
}: {
  value: LiveStream["status"];
  onChange: (value: LiveStream["status"]) => void;
}) {
  return (
    <label className="block" htmlFor="stream-status">
      <span className="mb-room-1 block font-mono text-[10px] font-black uppercase text-mutedText">Status</span>
      <Select id="stream-status" value={value} onChange={(event) => onChange(event.target.value as LiveStream["status"])}>
        <option className="bg-black" value="live">Live</option>
        <option className="bg-black" value="upcoming">Upcoming</option>
        <option className="bg-black" value="archived">Archived</option>
      </Select>
    </label>
  );
}

function StreamRow({
  stream,
  canEdit,
  onEdit,
  onStatusChange
}: {
  stream: LiveStream;
  canEdit: boolean;
  onEdit: () => void;
  onStatusChange: (nextStatus: LiveStream["status"]) => void;
}) {
  const image = stream.thumbnail_url || "/reference/live-crowd-clean.png";

  return (
    <article className="grid gap-room-3 border border-roomBorder bg-black p-room-2 md:grid-cols-[112px_1fr_auto] md:items-center">
      <div
        className="min-h-[80px] border border-roomBorder bg-cover bg-center grayscale"
        style={{ backgroundImage: `url(${image})` }}
      />
      <div>
        <div className="flex flex-wrap items-center gap-room-2">
          <StatusBadge status={stream.status}>{stream.status}</StatusBadge>
          <Text variant="mono">{formatStreamDate(stream.starts_at)}</Text>
        </div>
        <Text as="h3" className="mt-room-2 text-xl" variant="title">
          {stream.artist_name}
        </Text>
        <Text className="mt-room-1" variant="small">
          {[stream.title, stream.location, stream.genre].filter(Boolean).join(" / ")}
        </Text>
      </div>
      <div className="flex flex-wrap gap-room-2 md:justify-end">
        <ButtonLink href={`/streams/${stream.id}`} size="sm" variant="secondary">
          Public Room
        </ButtonLink>
        {canEdit ? (
          <>
            {stream.status !== "live" ? (
              <Button onClick={() => onStatusChange("live")} size="sm" type="button" variant="primary">
                Go Live
              </Button>
            ) : null}
            {stream.status !== "archived" ? (
              <Button onClick={() => onStatusChange("archived")} size="sm" type="button" variant="secondary">
                Archive
              </Button>
            ) : null}
            <Button onClick={onEdit} size="sm" type="button" variant="ghost">
              Edit
            </Button>
          </>
        ) : null}
      </div>
    </article>
  );
}
