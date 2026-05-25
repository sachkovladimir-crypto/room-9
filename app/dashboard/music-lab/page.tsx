"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { MissingConfigNotice } from "@/components/AuthNotice";
import { useAudioPlayer } from "@/components/GlobalAudioPlayer";
import { AudioAnalysisStatus, type AudioAnalysisStatusValue } from "@/components/music-lab/AudioAnalysisStatus";
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
import { analyzeAudioSource, type RawAudioAnalysis } from "@/lib/audioAnalyzer";
import { requestTrackAudioAnalysis, type AudioAnalyzeResponse } from "@/lib/audioAnalysisClient";
import { buildAudioIntelligenceModel, rankSimilarAudioTracks } from "@/lib/audioIntelligence";
import { getTrackMetadata, interpretRawAudioAnalysis } from "@/lib/llmInterpreter";
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatusByWorkId, setAnalysisStatusByWorkId] = useState<Record<string, AudioAnalysisStatusValue>>({});
  const [audioAnalysis, setAudioAnalysis] = useState<RawAudioAnalysis | null>(null);
  const { playTrack, seekTo, setSelectedTimestamp } = useAudioPlayer();

  const selectedWork = useMemo(
    () => works.find((work) => work.id === selectedWorkId) ?? works[0] ?? null,
    [selectedWorkId, works]
  );
  const selectedFeature = selectedWork ? featuresByWorkId[selectedWork.id] ?? null : null;
  const selectedAnalysisStatus: AudioAnalysisStatusValue = selectedWork
    ? analysisStatusByWorkId[selectedWork.id] ??
      normalizeAnalysisStatus(selectedFeature?.analysis_status) ??
      (selectedFeature?.analyzed_at || selectedWork.waveform_analyzed_at ? "complete" : "pending")
    : "pending";
  const selectedAnalysisDecoder = useMemo(
    () => audioAnalysis?.decoder ?? getFeatureDecoderLabel(selectedFeature) ?? (selectedFeature?.source ? String(selectedFeature.source) : null),
    [audioAnalysis?.decoder, selectedFeature]
  );
  const analysisFeature = useMemo(
    () => (selectedWork && audioAnalysis ? buildFeatureFromAnalysis(selectedWork, audioAnalysis, djProfile) : null),
    [audioAnalysis, djProfile, selectedWork]
  );
  const selectedIntelligenceFeature = analysisFeature ?? selectedFeature;
  const audioIntelligence = useMemo(
    () =>
      selectedWork
        ? buildAudioIntelligenceModel({
            dj: djProfile,
            feature: selectedIntelligenceFeature,
            work: selectedWork
          })
        : null,
    [djProfile, selectedIntelligenceFeature, selectedWork]
  );
  const similarLabTracks = useMemo(
    () =>
      selectedWork
        ? rankSimilarAudioTracks({
            djLookup: djProfile ? { [djProfile.id]: djProfile } : {},
            featureLookup: analysisFeature
              ? { ...featuresByWorkId, [analysisFeature.work_id]: analysisFeature }
              : featuresByWorkId,
            limit: 3,
            source: selectedWork,
            works
          })
        : [],
    [analysisFeature, djProfile, featuresByWorkId, selectedWork, works]
  );
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
    const bestSlot =
      audioIntelligence?.bestSlot.slot ??
      (energy >= 8 ? "Peak / closing slot" : groove >= 7 ? "Support / warmup slot" : "Opening / listening slot");

    return [
      {
        label: "Recommendation bias",
        value: audioIntelligence?.setRole ?? `${primaryTag} / ${Math.round(Math.max(energy, groove, density))}/10`,
        copy:
          audioIntelligence?.promoterReadout ??
          "Signal Engine will push this track toward listeners and events with matching taste markers."
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
        copy: audioIntelligence?.organizerBrief ?? "This cue can become an Atmosphere Brief on Track Page, Sound Vault, Event Desk and Booking Case."
      }
    ];
  }, [
    audioIntelligence?.bestSlot.slot,
    audioIntelligence?.organizerBrief,
    audioIntelligence?.promoterReadout,
    audioIntelligence?.setRole,
    dominantEq.label,
    dominantEq.range,
    metrics.density,
    metrics.energy,
    metrics.groove,
    roomTags,
    selectedCue,
    selectedWork?.genre,
    soundTags
  ]);
  const outputTags = useMemo(() => Array.from(new Set([...soundTags, ...roomTags])).slice(0, 8), [roomTags, soundTags]);

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
            .limit(80)
        );
        if (worksError) {
          throw worksError;
        }

        const loadedWorks = ((worksData as Work[]) ?? []).filter((work) => Boolean(work.link));
        setWorks(loadedWorks);

        if (loadedWorks.length > 0) {
          const { data: featureData, error: featureError } = await withSupabaseRetry("Music Lab features", () =>
            supabase.from("track_audio_features").select("*").in("work_id", loadedWorks.map((work) => work.id).slice(0, 80))
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

  useEffect(() => {
    setAudioAnalysis(null);
  }, [selectedWorkId]);

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

  function applyAnalysisResult(result: AudioAnalyzeResponse, fallbackWork: Work) {
    const analysis = result.raw;
    const updatedWork: Work = {
      ...fallbackWork,
      bpm: result.work.bpm ?? fallbackWork.bpm ?? (analysis.estimatedBpm ? String(Math.round(analysis.estimatedBpm)) : fallbackWork.bpm),
      duration_seconds: result.work.duration_seconds ?? fallbackWork.duration_seconds ?? analysis.durationSeconds,
      waveform_analyzed_at: result.work.waveform_analyzed_at,
      waveform_peaks: result.work.waveform_peaks ?? analysis.waveformPeaks
    };

    setAudioAnalysis(analysis);
    setFeaturesByWorkId((current) => ({ ...current, [fallbackWork.id]: result.feature }));
    setWorks((current) => current.map((work) => (work.id === fallbackWork.id ? updatedWork : work)));
    setMetrics({
      darkness: String(analysis.metrics.darkness),
      density: String(analysis.metrics.density),
      energy: String(analysis.metrics.energy),
      groove: String(analysis.metrics.groove),
      intensity: String(analysis.metrics.intensity),
      roomFit: analysis.roomFit.join(", "),
      soundDna: analysis.soundDna.join(", ")
    });
    setEq({
      air: String(analysis.eqProfile.air),
      low: String(analysis.eqProfile.low),
      mid: String(analysis.eqProfile.mid),
      presence: String(analysis.eqProfile.presence),
      sub: String(analysis.eqProfile.sub)
    });
    setAnalysisStatusByWorkId((current) => ({ ...current, [fallbackWork.id]: "complete" }));

    return updatedWork;
  }

  async function analyzeSelectedWork() {
    if (!selectedWork?.link) {
      setNotice("Attach an audio file before running analysis.");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisStatusByWorkId((current) => ({ ...current, [selectedWork.id]: "analyzing" }));
    setError("");
    setNotice("");

    try {
      setNotice("Decoding audio in the browser first. Server will only persist the analysis model...");
      const browserAnalysis = await analyzeAudioSource(selectedWork.link, 156);
      const result = await requestTrackAudioAnalysis({
        clientAnalysis: browserAnalysis,
        metadata: getTrackMetadata(selectedWork, djProfile?.stage_name),
        workId: selectedWork.id
      });
      applyAnalysisResult(result, selectedWork);

      setNotice(
        browserAnalysis.source === "decoded-audio"
          ? "Audio analyzed in browser and saved. Music Lab now has BPM, EQ, room fit, slot fit and organizer readouts."
          : "Browser metadata model saved. Upload a browser-decodable MP3/WAV for deeper waveform detail."
      );
    } catch {
      try {
        setNotice("Browser analysis failed. Trying server fallback once...");
        const fallbackResult = await requestTrackAudioAnalysis({
          audioUrl: selectedWork.link,
          metadata: getTrackMetadata(selectedWork, djProfile?.stage_name),
          workId: selectedWork.id
        });
        applyAnalysisResult(fallbackResult, selectedWork);
        setNotice(
          fallbackResult.raw.analysisMode === "metadata"
            ? "Server metadata model saved. Use a smaller MP3/WAV if you need deeper waveform analysis."
            : "Server fallback analyzed the audio and saved the Music Lab model."
        );
      } catch (fallbackError) {
        logSupabaseError("Music Lab audio analysis failed", fallbackError);
        setAnalysisStatusByWorkId((current) => ({ ...current, [selectedWork.id]: "failed" }));
        setError(formatSupabaseError(fallbackError, "Could not analyze this audio file."));
      }
    } finally {
      setIsAnalyzing(false);
    }
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
        analysis_error: selectedFeature?.analysis_error ?? null,
        analysis_requested_at: selectedFeature?.analysis_requested_at ?? null,
        analysis_status: audioAnalysis ? "complete" : selectedFeature?.analysis_status ?? "pending",
        analyzed_at: audioAnalysis ? new Date().toISOString() : selectedFeature?.analyzed_at ?? null,
        bpm: audioAnalysis?.estimatedBpm ?? parseMetric(selectedWork.bpm),
        confidence: audioAnalysis?.bpmConfidence ?? 0.84,
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
          audio_intelligence: audioIntelligence
            ? {
                bpmConfidence: audioIntelligence.bpmConfidence,
                bestSlot: audioIntelligence.bestSlot,
                energyBand: audioIntelligence.energyBand,
                keySignals: audioIntelligence.keySignals,
                organizerBrief: audioIntelligence.organizerBrief,
                setRole: audioIntelligence.setRole,
                transitionProfile: audioIntelligence.transitionProfile
              }
            : null,
          audio_analysis:
            audioAnalysis
              ? {
                  beatGrid: audioAnalysis.beatGrid,
                  bpmConfidence: audioAnalysis.bpmConfidence,
                  danceability: audioAnalysis.danceability,
                  dropTimestamps: audioAnalysis.dropTimestamps,
                  durationSeconds: audioAnalysis.durationSeconds,
                  eqProfile: audioAnalysis.eqProfile,
                  estimatedBpm: audioAnalysis.estimatedBpm,
                  key: audioAnalysis.key,
                  metrics: audioAnalysis.metrics,
                  spectralCentroid: audioAnalysis.spectralCentroid,
                  source: audioAnalysis.source
                }
              : null,
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
          <div className="grid gap-room-4 2xl:grid-cols-[300px_minmax(0,1fr)_340px]">
            <Panel className="p-room-3">
              <SectionHeader eyebrow="Source tracks" title="Lab Queue" />
              <div className="mt-room-3 space-y-room-1">
                {works.map((work) => {
                  const active = work.id === selectedWork?.id;
                  const feature = featuresByWorkId[work.id];
                  const status =
                    analysisStatusByWorkId[work.id] ??
                    normalizeAnalysisStatus(feature?.analysis_status) ??
                    (feature?.analyzed_at || work.waveform_analyzed_at ? "complete" : "pending");
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
                      <Text as="span" className="room-one-line block text-sm" variant="title">
                        {work.title || "Untitled track"}
                      </Text>
                      <span className="mt-1 block font-mono text-[9px] uppercase text-mutedText">
                        {[work.genre, work.bpm ? `${work.bpm} BPM` : null, work.visibility].filter(Boolean).join(" / ")}
                      </span>
                      <span className="mt-2 flex min-w-0 items-center justify-between gap-room-2">
                        <span className={cx("room-one-line font-mono text-[9px] uppercase", status === "complete" ? "text-acidGreen" : "text-mutedText")}>
                          {status === "complete" ? "Analyzed" : status === "failed" ? "Failed" : "Needs analysis"}
                        </span>
                        <StatusBadge status={status === "complete" ? "complete" : status === "failed" ? "blocked" : status === "analyzing" ? "current" : "pending"}>
                          {status}
                        </StatusBadge>
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
                    <Text as="h2" className="room-clamp-2 mt-room-1 max-w-3xl text-[clamp(1.5rem,3vw,2.75rem)] leading-[0.95]" variant="title">
                      {selectedWork?.title || "Untitled track"}
                    </Text>
                    <Text className="mt-room-1" variant="mono">
                      {[djProfile.stage_name, selectedWork?.genre, selectedWork?.bpm ? `${selectedWork.bpm} BPM` : null].filter(Boolean).join(" / ")}
                    </Text>
                  </div>
                  <div className="flex flex-wrap gap-room-1 lg:justify-end">
                    <Button
                      className="min-w-[150px]"
                      disabled={!selectedWork?.link || isAnalyzing}
                      loading={isAnalyzing}
                      onClick={analyzeSelectedWork}
                      type="button"
                      variant="primary"
                    >
                      Run Analysis
                    </Button>
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

                <div className="mt-room-3 grid gap-room-2 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
                  <AudioAnalysisStatus
                    analyzedAt={selectedFeature?.analyzed_at ?? selectedWork?.waveform_analyzed_at}
                    className="min-h-full"
                    error={selectedFeature?.analysis_error}
                    source={selectedAnalysisDecoder}
                    status={isAnalyzing ? "analyzing" : selectedAnalysisStatus}
                  />
                  <div className="border border-roomBorder bg-black p-room-2">
                    <Text variant="uiLabel">BPM / confidence</Text>
                    <Text className="mt-2 text-xl" variant="title">
                      {audioAnalysis?.estimatedBpm ? Math.round(audioAnalysis.estimatedBpm) : selectedFeature?.bpm ?? selectedWork?.bpm ?? "Pending"}
                    </Text>
                    <Text className="mt-1" variant="small">
                      {audioAnalysis?.bpmConfidence ? `${Math.round(audioAnalysis.bpmConfidence * 100)}% confidence` : "Run analysis to update"}
                    </Text>
                  </div>
                  <div className="border border-roomBorder bg-black p-room-2">
                    <Text variant="uiLabel">Decoder</Text>
                    <Text className="room-clamp-2 mt-2 text-lg" variant="title">
                      {selectedAnalysisDecoder ?? "Pending"}
                    </Text>
                    <Text className="mt-1" variant="small">
                      {selectedAnalysisStatus === "complete" ? "Stored in track_audio_features" : "Writes Signal Engine data"}
                    </Text>
                  </div>
                </div>

                <div className="mt-room-4 overflow-hidden border border-roomBorder bg-voidBlack p-room-3">
                  <Room9Waveform
                    active
                    barCount={132}
                    className="h-[220px] border-0 px-0"
                    markerLabel={selectedCue ? `${formatTrackTime(selectedCue.seconds)} ${selectedCue.label.replace(" Moment", "")}` : undefined}
                    peaks={selectedWork?.waveform_peaks}
                    reactive
                    seed={selectedWork?.id || "music-lab"}
                    selectedRatio={cueRatio}
                  />
                </div>

                <div className="mt-room-3 grid gap-room-2 sm:grid-cols-2 2xl:grid-cols-4">
                  {cues.map((cue) => (
                    <button
                      className={cx(
                        "min-h-[96px] min-w-0 overflow-hidden border p-room-2 text-left transition",
                        cue.id === selectedCueId
                          ? "border-acidGreen bg-acidGreen text-black"
                          : "border-roomBorder bg-black text-paperWhite hover:border-paperWhite"
                      )}
                      key={cue.id}
                      onClick={() => setSelectedCueId(cue.id)}
                      type="button"
                    >
                      <span className="room-one-line block font-mono text-[10px] uppercase">{formatTrackTime(cue.seconds)}</span>
                      <span className="room-one-line mt-room-2 block font-display text-lg uppercase leading-none">
                        {getCompactCueTitle(cue)}
                      </span>
                      <span className={cx("room-clamp-2 mt-room-2 block font-mono text-[9px] uppercase", cue.id === selectedCueId ? "text-black/70" : "text-mutedText")}>
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
              {audioIntelligence ? (
                <Panel className="p-room-3">
                  <SectionHeader eyebrow="Audio intelligence" title="DJ / Organizer Readout" />
                  <div className="mt-room-3 space-y-room-3">
                    <div className="border border-acidGreen bg-black p-room-2">
                      <Text variant="uiLabel">Set role</Text>
                      <Text className="mt-1 break-words text-xl" variant="title">
                        {audioIntelligence.setRole}
                      </Text>
                      <Text className="mt-2" variant="small">
                        {audioIntelligence.djReadout}
                      </Text>
                    </div>
                    <div className="grid grid-cols-2 gap-room-2">
                      <div className="border border-roomBorder bg-black p-room-2">
                        <Text variant="uiLabel">Tempo lock</Text>
                        <Text className="mt-1" variant="title">
                          {audioIntelligence.bpm ? `${Math.round(audioIntelligence.bpm)} BPM` : "Pending"}
                        </Text>
                        <Text className="mt-1" variant="small">
                          {Math.round(audioIntelligence.bpmConfidence * 100)}% confidence
                        </Text>
                      </div>
                      <div className="border border-roomBorder bg-black p-room-2">
                        <Text variant="uiLabel">Transition risk</Text>
                        <Text className="mt-1 capitalize" variant="title">
                          {audioIntelligence.transitionProfile.risk}
                        </Text>
                        <Text className="mt-1" variant="small">
                          {audioIntelligence.transitionProfile.mixIn}
                        </Text>
                      </div>
                    </div>
                    <div>
                      <Text variant="uiLabel">Organizer brief</Text>
                      <Text className="mt-2" variant="small">
                        {audioIntelligence.organizerBrief}
                      </Text>
                    </div>
                    <div className="space-y-room-1">
                      {audioIntelligence.eventSlotFit.slice(0, 3).map((slot) => (
                        <div className="border border-roomBorder bg-black p-room-2" key={slot.slot}>
                          <div className="flex items-center justify-between gap-room-2">
                            <Text variant="uiLabel">{slot.slot}</Text>
                            <span className="font-mono text-xs text-acidGreen">{slot.fit}%</span>
                          </div>
                          <Text className="mt-1" variant="small">
                            {slot.reasons.slice(0, 2).join(" / ")}
                          </Text>
                        </div>
                      ))}
                    </div>
                    {similarLabTracks.length > 0 ? (
                      <div>
                        <Text variant="uiLabel">Similar in catalog</Text>
                        <div className="mt-room-2 space-y-room-1">
                          {similarLabTracks.map((match) => (
                            <div className="flex min-w-0 items-center justify-between gap-room-2 border border-roomBorder bg-black p-room-2" key={match.target.id}>
                              <div className="min-w-0">
                                <Text className="room-one-line" variant="title">
                                  {match.target.title || "Untitled track"}
                                </Text>
                                <Text className="room-one-line mt-1" variant="small">
                                  {match.reasons.slice(0, 2).join(" / ")}
                                </Text>
                              </div>
                              <span className="shrink-0 font-mono text-xs text-acidGreen">{match.score}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </Panel>
              ) : null}

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
                  {outputTags.map((tag, index) => (
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

function getFeatureDecoderLabel(feature?: TrackAudioFeature | null) {
  const profile = feature?.waveform_profile;
  if (!profile || typeof profile !== "object") {
    return null;
  }

  const record = profile as {
    audio_analysis?: { decoder?: unknown; analysisMode?: unknown; source?: unknown };
    decoder?: unknown;
    analyzer?: unknown;
  };
  const decoder = record.decoder ?? record.audio_analysis?.decoder ?? record.analyzer;
  return typeof decoder === "string" && decoder.trim() ? decoder : null;
}

function buildFeatureFromAnalysis(work: Work, analysis: RawAudioAnalysis, djProfile: DjProfile | null): TrackAudioFeature {
  const interpreted = interpretRawAudioAnalysis({
    metadata: getTrackMetadata(work, djProfile?.stage_name),
    raw: analysis,
    workId: work.id
  });

  return {
    ...interpreted,
    analysis_error: null,
    analysis_requested_at: new Date().toISOString(),
    analysis_status: analysis.source === "fallback" ? "pending" : "complete",
    created_at: new Date().toISOString(),
    id: `analysis-${work.id}`,
    updated_at: new Date().toISOString(),
    waveform_profile: {
      ...(interpreted.waveform_profile ?? {}),
      audio_analysis: analysis,
      beatGridPreview: analysis.beatGrid,
      bpmConfidence: analysis.bpmConfidence,
      decoder: analysis.decoder,
      durationSeconds: analysis.durationSeconds,
      eq_profile: analysis.eqProfile,
      waveformPeaks: analysis.waveformPeaks
    },
    work_id: work.id
  };
}

function normalizeAnalysisStatus(status?: string | null): AudioAnalysisStatusValue | null {
  if (status === "pending" || status === "analyzing" || status === "complete" || status === "failed") {
    return status;
  }

  return null;
}
