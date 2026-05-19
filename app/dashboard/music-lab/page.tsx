"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { MissingConfigNotice } from "@/components/AuthNotice";
import { useAudioPlayer } from "@/components/GlobalAudioPlayer";
import { PlayGlyph } from "@/components/room9-icons";
import {
  Button,
  ButtonLink,
  Input,
  Panel,
  SectionHeader,
  Select,
  StatusBadge,
  Text,
  Textarea,
  cx
} from "@/components/room9-ui";
import { Room9Waveform } from "@/components/Room9Waveform";
import { WorkspaceOpsHeader, WorkspacePageFrame } from "@/components/workspace/WorkspaceShell";
import { getWorkCoverUrl } from "@/lib/media";
import { loadRoleAccess } from "@/lib/roleAccess";
import { deriveTrackAudioFeatures } from "@/lib/trackAudioFeatures";
import {
  clampTrackTimestamp,
  formatTrackTime,
  getMomentDisplayLabel,
  getMomentOverridesFromWaveformProfile,
  getTrackMoments,
  type TrackMomentId
} from "@/lib/trackMoments";
import {
  formatSupabaseError,
  getSupabase,
  hasSupabaseConfig,
  isMissingAuthSession,
  logSupabaseError,
  withSupabaseRetry
} from "@/lib/supabase";
import { hasRoleAccess, type DjProfile, type Profile, type Role, type TrackAudioFeature, type Work } from "@/lib/types";

type LabCue = {
  description: string;
  energy: string;
  id: TrackMomentId;
  label: string;
  roomType: string;
  seconds: number;
  soundDna: string;
};

type LabMetrics = {
  darkness: string;
  density: string;
  energy: string;
  groove: string;
  intensity: string;
  roomFit: string;
  soundDna: string;
};

type LabEq = {
  sub: string;
  low: string;
  mid: string;
  presence: string;
  air: string;
};

const metricFields: Array<{ key: keyof Omit<LabMetrics, "roomFit" | "soundDna">; label: string }> = [
  { key: "energy", label: "Energy" },
  { key: "darkness", label: "Darkness" },
  { key: "groove", label: "Groove" },
  { key: "intensity", label: "Intensity" },
  { key: "density", label: "Density" }
];

const eqFields: Array<{ key: keyof LabEq; label: string; range: string }> = [
  { key: "sub", label: "Sub", range: "30-80 Hz" },
  { key: "low", label: "Low", range: "80-250 Hz" },
  { key: "mid", label: "Mid", range: "250 Hz-2 kHz" },
  { key: "presence", label: "Presence", range: "2-6 kHz" },
  { key: "air", label: "Air", range: "6-14 kHz" }
];

export default function MusicLabPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeRoles, setActiveRoles] = useState<Role[]>(["listener"]);
  const [djProfile, setDjProfile] = useState<DjProfile | null>(null);
  const [works, setWorks] = useState<Work[]>([]);
  const [featuresByWorkId, setFeaturesByWorkId] = useState<Record<string, TrackAudioFeature>>({});
  const [selectedWorkId, setSelectedWorkId] = useState("");
  const [selectedCueId, setSelectedCueId] = useState<TrackMomentId>("peak");
  const [cues, setCues] = useState<LabCue[]>([]);
  const [metrics, setMetrics] = useState<LabMetrics>({
    darkness: "5",
    density: "5",
    energy: "7",
    groove: "6",
    intensity: "7",
    roomFit: "warehouse, basement club",
    soundDna: "industrial, hypnotic, hard groove"
  });
  const [labNote, setLabNote] = useState("");
  const [eq, setEq] = useState<LabEq>({
    air: "5",
    low: "6",
    mid: "5",
    presence: "6",
    sub: "7"
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { playTrack, seekTo, setSelectedTimestamp } = useAudioPlayer();

  const selectedWork = useMemo(
    () => works.find((work) => work.id === selectedWorkId) ?? works[0] ?? null,
    [selectedWorkId, works]
  );
  const selectedFeature = selectedWork ? featuresByWorkId[selectedWork.id] ?? null : null;
  const selectedCue = cues.find((cue) => cue.id === selectedCueId) ?? cues[2] ?? null;
  const duration = selectedWork?.duration_seconds ?? 360;
  const cueRatio = selectedCue ? clampTrackTimestamp(selectedCue.seconds, duration) / Math.max(1, duration) : 0.61;
  const roomTags = useMemo(() => splitList(metrics.roomFit), [metrics.roomFit]);
  const soundTags = useMemo(() => splitList(metrics.soundDna), [metrics.soundDna]);
  const dominantEq = useMemo(
    () =>
      eqFields.reduce(
        (top, field) => {
          const value = parseMetric(eq[field.key]) ?? 0;
          return value > top.value ? { label: field.label, range: field.range, value } : top;
        },
        { label: "Neutral", range: "balanced", value: -1 }
      ),
    [eq]
  );
  const labAnalysis = useMemo(() => {
    const energy = parseMetric(metrics.energy) ?? 0;
    const groove = parseMetric(metrics.groove) ?? 0;
    const density = parseMetric(metrics.density) ?? 0;
    const primaryRoom = roomTags[0] ?? "room tba";
    const primaryTag = soundTags[0] ?? selectedWork?.genre ?? "sound tba";
    const bestSlot = energy >= 8 ? "Peak / closing slot" : groove >= 7 ? "Support / warmup slot" : "Opening / listening slot";

    return [
      {
        label: "Recommendation bias",
        value: `${primaryTag} / ${Math.round(Math.max(energy, groove, density))}/10`,
        copy: "Signal Engine will push this track toward listeners and events with matching taste markers."
      },
      {
        label: "Best event slot",
        value: bestSlot,
        copy: `Room fit prefers ${primaryRoom}. Saved moments can now be ranked against lineup slots.`
      },
      {
        label: "EQ profile",
        value: `${dominantEq.label} focus`,
        copy: `${dominantEq.range}. Stored as DJ-facing metadata, not a mastering change.`
      },
      {
        label: "Brief readiness",
        value: selectedCue ? `${formatTrackTime(selectedCue.seconds)} ${getCompactCueTitle(selectedCue)}` : "Cue pending",
        copy: "This cue can become an Atmosphere Brief on Track Page, Sound Vault, Event Desk and Booking Case."
      }
    ];
  }, [dominantEq.label, dominantEq.range, metrics.density, metrics.energy, metrics.groove, roomTags, selectedCue, selectedWork?.genre, soundTags]);

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      setIsLoading(false);
      return;
    }

    async function loadMusicLab() {
      setIsLoading(true);
      setError("");

      try {
        const supabase = getSupabase();
        const { data: sessionData, error: sessionError } = await withSupabaseRetry("Music Lab session", () =>
          supabase.auth.getSession()
        );

        if (sessionError && !isMissingAuthSession(sessionError)) {
          throw sessionError;
        }

        const user = sessionData.session?.user ?? null;
        if (!user) {
          router.push("/login?next=/dashboard/music-lab");
          return;
        }

        const { data: profileData, error: profileError } = await withSupabaseRetry("Music Lab profile", () =>
          supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()
        );
        if (profileError) {
          throw profileError;
        }

        const loadedProfile = (profileData as Profile | null) ?? null;
        setProfile(loadedProfile);
        const roles = await loadRoleAccess(supabase, user.id, loadedProfile?.role ?? "listener");
        setActiveRoles(roles);

        if (!hasRoleAccess(roles, ["dj", "admin"])) {
          router.replace("/dashboard/settings?unlock=music-lab");
          return;
        }

        const { data: djData, error: djError } = await withSupabaseRetry("Music Lab DJ profile", () =>
          supabase.from("dj_profiles").select("*").eq("user_id", user.id).maybeSingle()
        );
        if (djError) {
          throw djError;
        }

        const loadedDj = (djData as DjProfile | null) ?? null;
        setDjProfile(loadedDj);
        if (!loadedDj) {
          setWorks([]);
          return;
        }

        const { data: worksData, error: worksError } = await withSupabaseRetry("Music Lab works", () =>
          supabase
            .from("works")
            .select("*")
            .eq("dj_id", loadedDj.id)
            .eq("is_deleted", false)
            .order("created_at", { ascending: false })
        );
        if (worksError) {
          throw worksError;
        }

        const loadedWorks = ((worksData as Work[]) ?? []).filter((work) => Boolean(work.link));
        setWorks(loadedWorks);

        if (loadedWorks.length > 0) {
          const { data: featureData, error: featureError } = await withSupabaseRetry("Music Lab features", () =>
            supabase.from("track_audio_features").select("*").in("work_id", loadedWorks.map((work) => work.id))
          );

          if (featureError) {
            logSupabaseError("Music Lab feature load failed", featureError);
          } else {
            setFeaturesByWorkId(
              ((featureData as TrackAudioFeature[]) ?? []).reduce<Record<string, TrackAudioFeature>>((acc, feature) => {
                acc[feature.work_id] = feature;
                return acc;
              }, {})
            );
          }

          const requested = new URLSearchParams(window.location.search).get("workId");
          setSelectedWorkId(
            requested && loadedWorks.some((work) => work.id === requested) ? requested : loadedWorks[0].id
          );
        }
      } catch (caughtError) {
        logSupabaseError("Music Lab load failed", caughtError);
        setError(formatSupabaseError(caughtError, "Could not load Music Lab."));
      } finally {
        setIsLoading(false);
      }
    }

    loadMusicLab();
  }, [router]);

  useEffect(() => {
    if (!selectedWork) {
      return;
    }

    const derived = deriveTrackAudioFeatures(selectedWork, djProfile);
    const feature = selectedFeature ?? derived;
    const moments = getTrackMoments(
      selectedWork.duration_seconds,
      getMomentOverridesFromWaveformProfile(feature.waveform_profile)
    );
    setCues(
      moments.map((moment) => ({
        description: moment.description,
        energy: moment.energy,
        id: moment.id,
        label: moment.label,
        roomType: moment.roomType,
        seconds: moment.seconds,
        soundDna: moment.soundDna
      }))
    );
    setMetrics({
      darkness: String(feature.darkness ?? derived.darkness ?? 5),
      density: String(feature.density ?? derived.density ?? 5),
      energy: String(feature.energy ?? derived.energy ?? 7),
      groove: String(feature.groove ?? derived.groove ?? 6),
      intensity: String(feature.intensity ?? derived.intensity ?? 7),
      roomFit: (feature.room_fit ?? derived.room_fit ?? []).join(", "),
      soundDna: (feature.sound_dna ?? derived.sound_dna ?? []).join(", ")
    });
    setLabNote(readLabNote(feature.waveform_profile));
    setEq(readEqProfile(feature.waveform_profile, {
      air: String(Math.max(3, Math.round((feature.vocal_presence ?? derived.vocal_presence ?? 5) / 1.2))),
      low: String(Math.max(3, Math.round((feature.groove ?? derived.groove ?? 6) / 1.15))),
      mid: String(Math.max(3, Math.round((feature.density ?? derived.density ?? 5) / 1.1))),
      presence: String(Math.max(3, Math.round((feature.intensity ?? derived.intensity ?? 6) / 1.15))),
      sub: String(Math.max(3, Math.round((feature.energy ?? derived.energy ?? 7) / 1.1)))
    }));
    setSelectedCueId("peak");
  }, [djProfile, selectedFeature, selectedWork]);

  if (!hasSupabaseConfig()) {
    return <MissingConfigNotice />;
  }

  if (!isLoading && profile && !hasRoleAccess(activeRoles, ["dj", "admin"])) {
    return (
      <WorkspacePageFrame
        active="musicLab"
        email={profile.email}
        profileLabel={profile.email || "Listener workspace"}
        readiness={38}
        role={activeRoles}
      >
        <section className="p-room-3 md:p-room-5">
          <EmptyState
            title="Music Lab locked"
            message="Music Lab opens after DJ verification. Complete the DJ unlock checklist before editing cue points, EQ sketches and track signal models."
            href="/dashboard/settings?unlock=music-lab"
            action="Open Role Verification"
          />
        </section>
      </WorkspacePageFrame>
    );
  }

  function updateCue(id: TrackMomentId, updates: Partial<LabCue>) {
    setCues((current) =>
      current.map((cue) =>
        cue.id === id
          ? {
              ...cue,
              ...updates,
              seconds: clampTrackTimestamp(updates.seconds ?? cue.seconds, selectedWork?.duration_seconds)
            }
          : cue
      )
    );
  }

  function playCue(cue: LabCue) {
    if (!selectedWork?.link) {
      setNotice("Attach an audio file before previewing cues.");
      return;
    }

    const safeSeconds = clampTrackTimestamp(cue.seconds, selectedWork.duration_seconds);
    playTrack({
      artist: djProfile?.stage_name || "ROOM_9",
      coverUrl: getWorkCoverUrl(selectedWork, djProfile),
      description: [selectedWork.genre, selectedWork.bpm ? `${selectedWork.bpm} BPM` : ""].filter(Boolean).join(" / "),
      djId: selectedWork.dj_id,
      durationSeconds: selectedWork.duration_seconds,
      id: selectedWork.id,
      src: selectedWork.link,
      title: selectedWork.title || "Untitled track"
    });
    setSelectedTimestamp(safeSeconds);
    window.setTimeout(() => seekTo(safeSeconds), 120);
  }

  async function saveLab() {
    if (!selectedWork) {
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      const supabase = getSupabase();
      const payload = {
        bpm: parseMetric(selectedWork.bpm),
        confidence: 0.84,
        darkness: parseMetric(metrics.darkness),
        density: parseMetric(metrics.density),
        energy: parseMetric(metrics.energy),
        groove: parseMetric(metrics.groove),
        intensity: parseMetric(metrics.intensity),
        moment_types: cues.map((cue) => cue.id),
        room_fit: splitList(metrics.roomFit),
        sound_dna: splitList(metrics.soundDna),
        source: "manual",
        updated_at: new Date().toISOString(),
        vocal_presence: 0,
        waveform_profile: {
          ...(selectedFeature?.waveform_profile && typeof selectedFeature.waveform_profile === "object"
            ? selectedFeature.waveform_profile
            : {}),
          lab_cues: cues.map((cue) => ({
            description: cue.description,
            energy: cue.energy,
            id: cue.id,
            label: cue.label,
            roomType: cue.roomType,
            seconds: clampTrackTimestamp(cue.seconds, selectedWork.duration_seconds),
            soundDna: cue.soundDna,
            timestampLabel: formatTrackTime(clampTrackTimestamp(cue.seconds, selectedWork.duration_seconds))
          })),
          eq_profile: normalizeEqProfile(eq),
          lab_note: labNote,
          lab_updated_at: new Date().toISOString()
        },
        work_id: selectedWork.id
      };

      const { data, error: saveError } = await supabase
        .from("track_audio_features")
        .upsert(payload, { onConflict: "work_id" })
        .select("*")
        .single();

      if (saveError) {
        throw saveError;
      }

      const saved = data as TrackAudioFeature;
      setFeaturesByWorkId((current) => ({ ...current, [saved.work_id]: saved }));
      setNotice("Music Lab saved. Track Page, recommendations, and Event Desk can now use this manual sound model.");
    } catch (caughtError) {
      logSupabaseError("Music Lab save failed", caughtError);
      setError(formatSupabaseError(caughtError, "Could not save Music Lab data."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <WorkspacePageFrame
      active="musicLab"
      email={profile?.email}
      profileLabel={djProfile?.stage_name || profile?.email || "DJ workspace"}
      readiness={works.length > 0 ? 72 : 38}
      role={activeRoles}
    >
      <section className="space-y-room-5 p-room-3 md:p-room-5">
        <WorkspaceOpsHeader
          eyebrow="DJ tools / sound intelligence"
          title="Music Lab"
          description="Shape the track into usable sound references: cue points, energy, room fit and Sound DNA for recommendations, Event Desk and atmosphere briefs."
          actions={
            <div className="flex flex-wrap gap-room-2">
              <ButtonLink href="/library" variant="secondary">
                Sound Vault
              </ButtonLink>
              {selectedWork ? (
                <ButtonLink href={`/track/${selectedWork.id}`} variant="secondary">
                  Public Track
                </ButtonLink>
              ) : null}
              <Button disabled={!selectedWork} loading={isSaving} onClick={saveLab} type="button" variant="primary">
                Save Lab Model
              </Button>
            </div>
          }
        />

        {error ? <p className="border border-errorRed bg-black p-room-2 text-sm text-errorRed">{error}</p> : null}
        {notice ? <p className="border border-roomBorder bg-panelBlack p-room-2 text-sm text-mutedText">{notice}</p> : null}

        {isLoading ? (
          <Panel className="min-h-[420px] animate-pulse p-room-4">
            <span className="sr-only">Loading Music Lab</span>
          </Panel>
        ) : !djProfile ? (
          <EmptyState
            title="DJ profile required"
            message="Create your DJ profile in Settings before opening Music Lab."
            href="/dashboard/settings#dj-profile-settings"
            action="Open Settings"
          />
        ) : works.length === 0 ? (
          <EmptyState
            title="Upload a track first"
            message="Music Lab starts once the DJ has at least one uploaded audio track."
            href="/library"
            action="Upload Track"
          />
        ) : (
          <div className="grid gap-room-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
            <Panel className="p-room-3">
              <SectionHeader eyebrow="Source tracks" title="Lab Queue" />
              <div className="mt-room-3 space-y-room-1">
                {works.map((work) => {
                  const active = work.id === selectedWork?.id;
                  const feature = featuresByWorkId[work.id];
                  return (
                    <button
                      className={cx(
                        "w-full border p-room-2 text-left transition",
                        active ? "border-acidGreen bg-[#121d05]" : "border-roomBorder bg-black hover:border-paperWhite"
                      )}
                      key={work.id}
                      onClick={() => setSelectedWorkId(work.id)}
                      type="button"
                    >
                      <Text as="span" className="block truncate text-sm" variant="title">
                        {work.title || "Untitled track"}
                      </Text>
                      <span className="mt-1 block font-mono text-[9px] uppercase text-mutedText">
                        {[work.genre, work.bpm ? `${work.bpm} BPM` : null, work.visibility].filter(Boolean).join(" / ")}
                      </span>
                      <span className={cx("mt-2 inline-flex font-mono text-[9px] uppercase", feature ? "text-acidGreen" : "text-mutedText")}>
                        {feature ? "Manual model saved" : "Metadata model"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Panel>

            <div className="space-y-room-4">
              <Panel className="p-room-3">
                <div className="grid gap-room-3 lg:grid-cols-[1fr_auto] lg:items-start">
                  <div>
                    <Text variant="uiLabel">Current source</Text>
                    <Text as="h2" className="mt-room-1 text-2xl md:text-3xl" variant="title">
                      {selectedWork?.title || "Untitled track"}
                    </Text>
                    <Text className="mt-room-1" variant="mono">
                      {[djProfile.stage_name, selectedWork?.genre, selectedWork?.bpm ? `${selectedWork.bpm} BPM` : null].filter(Boolean).join(" / ")}
                    </Text>
                  </div>
                  <div className="flex flex-wrap gap-room-1">
                    {selectedCue ? (
                      <Button onClick={() => playCue(selectedCue)} type="button" variant="secondary">
                        <PlayGlyph className="h-3.5 w-3.5" />
                        Preview Cue
                      </Button>
                    ) : null}
                    {selectedWork ? (
                      <ButtonLink href={`/track/${selectedWork.id}`} variant="secondary">
                        Open Track
                      </ButtonLink>
                    ) : null}
                  </div>
                </div>

                <div className="mt-room-4 overflow-hidden border border-roomBorder bg-voidBlack p-room-3">
                  <Room9Waveform
                    active
                    barCount={132}
                    className="h-48 border-0 px-0"
                    markerLabel={selectedCue ? `${formatTrackTime(selectedCue.seconds)} ${selectedCue.label.replace(" Moment", "")}` : undefined}
                    peaks={selectedWork?.waveform_peaks}
                    reactive
                    seed={selectedWork?.id || "music-lab"}
                    selectedRatio={cueRatio}
                  />
                </div>

                <div className="mt-room-3 grid gap-room-2 md:grid-cols-4">
                  {cues.map((cue) => (
                    <button
                      className={cx(
                        "min-h-[112px] min-w-0 border p-room-2 text-left transition",
                        cue.id === selectedCueId
                          ? "border-acidGreen bg-acidGreen text-black"
                          : "border-roomBorder bg-black text-paperWhite hover:border-paperWhite"
                      )}
                      key={cue.id}
                      onClick={() => setSelectedCueId(cue.id)}
                      type="button"
                    >
                      <span className="font-mono text-[10px] uppercase">{formatTrackTime(cue.seconds)}</span>
                      <span className="mt-room-2 block font-display text-[clamp(1rem,1.35vw,1.35rem)] uppercase leading-[0.95]">
                        {getCompactCueTitle(cue)}
                      </span>
                      <span className={cx("mt-room-2 block font-mono text-[9px] uppercase", cue.id === selectedCueId ? "text-black/70" : "text-mutedText")}>
                        {cue.label}
                      </span>
                    </button>
                  ))}
                </div>
              </Panel>

              {selectedCue ? (
                <Panel className="p-room-3">
                  <SectionHeader eyebrow="Cue editor" title={getMomentDisplayLabel({ ...selectedCue, ratio: cueRatio, timestamp: formatTrackTime(selectedCue.seconds), timestampKnown: true })} />
                  <div className="mt-room-3 grid gap-room-3 md:grid-cols-2">
                    <label>
                      <span className="room-label">Cue label</span>
                      <Input value={selectedCue.label} onChange={(event) => updateCue(selectedCue.id, { label: event.target.value })} />
                    </label>
                    <label>
                      <span className="room-label">Timestamp seconds</span>
                      <Input
                        max={duration}
                        min={0}
                        type="number"
                        value={String(selectedCue.seconds)}
                        onChange={(event) => updateCue(selectedCue.id, { seconds: Number(event.target.value) })}
                      />
                    </label>
                    <label>
                      <span className="room-label">Energy</span>
                      <Input value={selectedCue.energy} onChange={(event) => updateCue(selectedCue.id, { energy: event.target.value })} />
                    </label>
                    <label>
                      <span className="room-label">Room type</span>
                      <Input value={selectedCue.roomType} onChange={(event) => updateCue(selectedCue.id, { roomType: event.target.value })} />
                    </label>
                    <label className="md:col-span-2">
                      <span className="room-label">Sound DNA</span>
                      <Input value={selectedCue.soundDna} onChange={(event) => updateCue(selectedCue.id, { soundDna: event.target.value })} />
                    </label>
                    <label className="md:col-span-2">
                      <span className="room-label">Atmosphere brief copy</span>
                      <Textarea
                        value={selectedCue.description}
                        onChange={(event) => updateCue(selectedCue.id, { description: event.target.value })}
                      />
                    </label>
                  </div>
                </Panel>
              ) : null}
            </div>

            <aside className="space-y-room-4">
              <Panel className="p-room-3">
                <SectionHeader eyebrow="Signal model" title="Recommendation Inputs" />
                <div className="mt-room-3 grid gap-room-2">
                  {metricFields.map((field) => (
                    <label key={field.key}>
                      <span className="room-label">{field.label} / 10</span>
                      <Input
                        max={10}
                        min={0}
                        step="0.1"
                        type="number"
                        value={metrics[field.key]}
                        onChange={(event) => setMetrics((current) => ({ ...current, [field.key]: event.target.value }))}
                      />
                    </label>
                  ))}
                  <label>
                    <span className="room-label">Room fit</span>
                    <Select value={metrics.roomFit} onChange={(event) => setMetrics((current) => ({ ...current, roomFit: event.target.value }))}>
                      <option value="warehouse, basement club">Warehouse / Basement</option>
                      <option value="open air, main room">Open Air / Main Room</option>
                      <option value="listening room, basement club">Listening Room / Basement</option>
                    </Select>
                  </label>
                  <label>
                    <span className="room-label">Sound DNA tags</span>
                    <Input value={metrics.soundDna} onChange={(event) => setMetrics((current) => ({ ...current, soundDna: event.target.value }))} />
                  </label>
                  <label>
                    <span className="room-label">DJ note</span>
                    <Textarea value={labNote} onChange={(event) => setLabNote(event.target.value)} />
                  </label>
                </div>
              </Panel>

              <Panel className="p-room-3">
                <SectionHeader eyebrow="Audio workbench" title="EQ Sketch" />
                <Text className="mt-room-2" variant="small">
                  Draft the tonal shape of this track for recommendations and atmosphere briefs. This is not mastering; it is a DJ-facing signal model.
                </Text>
                <div className="mt-room-3 grid grid-cols-5 items-end gap-room-2 border border-roomBorder bg-black p-room-2">
                  {eqFields.map((field) => {
                    const level = parseMetric(eq[field.key]) ?? 0;
                    return (
                      <div className="min-w-0" key={field.key}>
                        <div className="flex h-24 items-end border border-roomBorder bg-voidBlack px-1">
                          <div className="w-full bg-acidGreen" style={{ height: `${Math.max(8, Math.min(100, level * 10))}%` }} />
                        </div>
                        <p className="mt-2 truncate font-mono text-[9px] uppercase text-paperWhite">{field.label}</p>
                        <p className="truncate font-mono text-[8px] uppercase text-mutedText">{field.range}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-room-3 grid gap-room-2">
                  {eqFields.map((field) => (
                    <label key={field.key}>
                      <span className="room-label">{field.label} / 10</span>
                      <input
                        className="w-full accent-acidGreen"
                        max={10}
                        min={0}
                        step="0.5"
                        type="range"
                        value={eq[field.key]}
                        onChange={(event) => setEq((current) => ({ ...current, [field.key]: event.target.value }))}
                      />
                    </label>
                  ))}
                </div>
              </Panel>

              <Panel className="p-room-3">
                <SectionHeader eyebrow="Analysis summary" title="Signal Output" />
                <div className="mt-room-3 grid gap-room-2">
                  {labAnalysis.map((item) => (
                    <div className="border border-roomBorder bg-black p-room-2" key={item.label}>
                      <div className="flex min-w-0 items-start justify-between gap-room-2">
                        <Text className="min-w-0" variant="uiLabel">
                          {item.label}
                        </Text>
                        <StatusBadge status="selected">ready</StatusBadge>
                      </div>
                      <Text className="mt-room-1 min-w-0 break-words text-lg" variant="title">
                        {item.value}
                      </Text>
                      <Text className="mt-room-1" variant="small">
                        {item.copy}
                      </Text>
                    </div>
                  ))}
                </div>
                <div className="mt-room-3 flex flex-wrap gap-room-1">
                  {[...soundTags, ...roomTags].slice(0, 8).map((tag, index) => (
                    <span className="border border-roomBorder px-2 py-1 font-mono text-[9px] uppercase text-mutedText" key={`lab-tag-${tag}-${index}`}>
                      {tag}
                    </span>
                  ))}
                </div>
              </Panel>

              <Panel className="p-room-3">
                <SectionHeader eyebrow="Output" title="Where This Feeds" />
                <div className="mt-room-3 space-y-room-2">
                  {[
                    ["Track Page", "Custom cue points replace generic moments."],
                    ["Explore", "Manual features improve deterministic ranking."],
                    ["Event Desk", "Slots can recommend stronger atmosphere briefs."],
                    ["Booking Case", "Brief language becomes clearer for promoters."]
                  ].map(([label, copy]) => (
                    <div className="border border-roomBorder bg-black p-room-2" key={label}>
                      <div className="flex items-center justify-between gap-room-2">
                        <Text variant="uiLabel">{label}</Text>
                        <StatusBadge status="selected">linked</StatusBadge>
                      </div>
                      <Text className="mt-room-1" variant="small">
                        {copy}
                      </Text>
                    </div>
                  ))}
                </div>
              </Panel>
            </aside>
          </div>
        )}
      </section>
    </WorkspacePageFrame>
  );
}

function parseMetric(value: string | number | null | undefined) {
  const match = String(value ?? "").match(/\d+(?:\.\d+)?/);
  return match ? Math.max(0, Math.min(220, Number(match[0]))) : null;
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function getCompactCueTitle(cue: Pick<LabCue, "id" | "label">) {
  if (cue.id === "peak") {
    return "Peak";
  }

  if (cue.id === "intro") {
    return "Intro";
  }

  if (cue.id === "build") {
    return "Build";
  }

  if (cue.id === "closing") {
    return "Closing";
  }

  return cue.label.replace(/\s+moment$/i, "");
}

function readLabNote(profile: unknown) {
  if (!profile || typeof profile !== "object") {
    return "";
  }

  const note = (profile as { lab_note?: unknown }).lab_note;
  return typeof note === "string" ? note : "";
}

function readEqProfile(profile: unknown, fallback: LabEq): LabEq {
  if (!profile || typeof profile !== "object") {
    return fallback;
  }

  const raw = (profile as { eq_profile?: unknown }).eq_profile;
  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const eqRecord = raw as Partial<Record<keyof LabEq, unknown>>;
  return {
    air: readEqValue(eqRecord.air, fallback.air),
    low: readEqValue(eqRecord.low, fallback.low),
    mid: readEqValue(eqRecord.mid, fallback.mid),
    presence: readEqValue(eqRecord.presence, fallback.presence),
    sub: readEqValue(eqRecord.sub, fallback.sub)
  };
}

function normalizeEqProfile(eq: LabEq) {
  return {
    air: parseMetric(eq.air) ?? 5,
    low: parseMetric(eq.low) ?? 5,
    mid: parseMetric(eq.mid) ?? 5,
    presence: parseMetric(eq.presence) ?? 5,
    sub: parseMetric(eq.sub) ?? 5
  };
}

function readEqValue(value: unknown, fallback: string) {
  const parsed = parseMetric(typeof value === "number" || typeof value === "string" ? value : fallback);
  return String(parsed ?? fallback);
}
