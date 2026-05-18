"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackButton } from "@/components/BackButton";
import { EmptyState } from "@/components/EmptyState";
import { useAudioPlayer } from "@/components/GlobalAudioPlayer";
import { MissingConfigNotice } from "@/components/AuthNotice";
import { TrackActionMenu } from "@/components/TrackActionMenu";
import { BookmarkGlyph, ExternalGlyph, PlayGlyph } from "@/components/room9-icons";
import {
  Button,
  ButtonLink,
  Panel,
  SectionHeader,
  StatusBadge,
  TrackRow,
  cx
} from "@/components/room9-ui";
import {
  getDemoDjProfile,
  getDemoWork,
  getDemoWorksByDjId,
  isDemoWorkId
} from "@/lib/demoContent";
import { cssImageUrl, getDjAvatarUrl, getWorkCoverUrl } from "@/lib/media";
import {
  formatSupabaseError,
  getSupabase,
  hasSupabaseConfig,
  logSupabaseError
} from "@/lib/supabase";
import { trackUserInteraction } from "@/lib/interactions";
import {
  createVaultPlaylist,
  readVaultPlaylists,
  readVaultSavedTrackIds,
  saveVaultMoment,
  toggleVaultSavedTrackId,
  toggleVaultTrackInPlaylist,
  type VaultPlaylist
} from "@/lib/soundVault";
import {
  clampTrackTimestamp,
  formatTrackTime,
  getMomentDisplayLabel,
  getMomentOverridesFromWaveformProfile,
  getTrackMoments,
  type TrackMoment
} from "@/lib/trackMoments";
import type { DjProfile, TrackAudioFeature, Work } from "@/lib/types";
import { createFallbackWaveform, extractWaveformPeaks } from "@/lib/waveform";

export default function TrackPage() {
  const params = useParams<{ id: string }>();
  const [work, setWork] = useState<Work | null>(null);
  const [dj, setDj] = useState<DjProfile | null>(null);
  const [relatedWorks, setRelatedWorks] = useState<Work[]>([]);
  const [trackFeature, setTrackFeature] = useState<TrackAudioFeature | null>(null);
  const [selectedMomentId, setSelectedMomentId] = useState("peak");
  const [trackDurationSeconds, setTrackDurationSeconds] = useState<number | null>(null);
  const [waveformPeaks, setWaveformPeaks] = useState(() => createFallbackWaveform(156, "room9"));
  const [pendingSeek, setPendingSeek] = useState<number | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [playlists, setPlaylists] = useState<VaultPlaylist[]>([]);
  const [musicScope, setMusicScope] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const openTrackLoggedRef = useRef<string | null>(null);
  const {
    currentTrack,
    currentTime: playerCurrentTime,
    isPlaying,
    playTrack,
    seekTo,
    selectedTimestamp,
    setSelectedTimestamp
  } = useAudioPlayer();

  const labMomentOverrides = useMemo(
    () => getMomentOverridesFromWaveformProfile(trackFeature?.waveform_profile),
    [trackFeature?.waveform_profile]
  );
  const timestampMoments = useMemo(
    () => getTrackMoments(trackDurationSeconds, labMomentOverrides),
    [labMomentOverrides, trackDurationSeconds]
  );
  const selectedMoment = useMemo(
    () => timestampMoments.find((moment) => moment.id === selectedMomentId) ?? timestampMoments[2],
    [selectedMomentId, timestampMoments]
  );

  const artistName = dj?.stage_name || "DJ STONIK";
  const artistCity = [dj?.city || "Berlin", dj?.country].filter(Boolean).join(", ");
  const trackTitle = work?.title || "VOID PROTOCOL";
  const trackGenre = work?.genre || "Industrial Techno";
  const trackBpm = work?.bpm || "142";
  const durationLabel = trackDurationSeconds ? formatTrackTime(trackDurationSeconds) : "Analyzing duration";
  const momentReady = selectedMoment.timestampKnown;
  const plays = work?.play_count ?? 0;
  const saves = work?.like_count ?? 0;

  const playerTrack = useMemo(
    () =>
      work?.link
        ? {
            id: work.id,
            title: trackTitle,
            artist: artistName,
            src: work.link,
            djId: work.dj_id,
            coverUrl: getWorkCoverUrl(work, dj),
            description: `${trackGenre} / ${trackBpm} BPM`,
            durationSeconds: work.duration_seconds,
            bpm: trackBpm,
            genre: trackGenre
          }
        : null,
    [artistName, dj, trackBpm, trackGenre, trackTitle, work]
  );

  const bookingHref =
    dj && work
      ? `/booking/${dj.id}?workId=${encodeURIComponent(work.id)}&t=${clampTrackTimestamp(
          selectedMoment.seconds,
          trackDurationSeconds
        )}`
      : "/explore";

  const isCurrentTrack = currentTrack?.id === work?.id;
  const canOpenMusicLab = Boolean(work && dj && musicScope && dj.user_id === musicScope);

  useEffect(() => {
    if (!work?.id || openTrackLoggedRef.current === work.id) {
      return;
    }

    openTrackLoggedRef.current = work.id;
    trackUserInteraction({
      djId: work.dj_id,
      interactionType: "open_track",
      metadata: {
        genre: trackGenre,
        source: "track_page",
        title: trackTitle
      },
      scope: musicScope,
      workId: work.id
    });
  }, [musicScope, trackGenre, trackTitle, work?.dj_id, work?.id]);

  const recordTrackPlay = useCallback(
    async (targetWork: Work) => {
      if (!dj || isDemoWorkId(targetWork.id)) {
        return;
      }

      try {
        const supabase = getSupabase();
        const { data: userData } = await supabase.auth.getUser();
        const { error: playError } = await supabase.from("track_plays").insert({
          work_id: targetWork.id,
          dj_id: dj.id,
          listener_id: userData.user?.id ?? null
        });

        const nextPlayCount = (Number(targetWork.play_count) || 0) + 1;
        const { error: updateError } = await supabase
          .from("works")
          .update({ play_count: nextPlayCount })
          .eq("id", targetWork.id);

        setWork((current) => (current?.id === targetWork.id ? { ...current, play_count: nextPlayCount } : current));

        if (playError || updateError) {
          logSupabaseError("Track page play tracking failed", playError ?? updateError);
        }
      } catch (caughtError) {
        logSupabaseError("Track page play tracking unexpected failure", caughtError);
      }
    },
    [dj]
  );

  useEffect(() => {
    if (!hasSupabaseConfig() || !params.id) {
      return;
    }

    async function loadTrack() {
      setIsLoading(true);
      setError("");

      try {
        if (isDemoWorkId(params.id)) {
          const demoWork = getDemoWork(params.id);
          if (demoWork) {
            const demoDj = getDemoDjProfile(demoWork.dj_id);
            setWork(demoWork);
            setDj(demoDj);
            setRelatedWorks(getDemoWorksByDjId(demoWork.dj_id).filter((item) => item.id !== demoWork.id));
            setTrackDurationSeconds(demoWork.duration_seconds);
            if (demoWork.waveform_peaks?.length) {
              setWaveformPeaks(demoWork.waveform_peaks);
            }
            return;
          }
        }

        if (!isUuidLike(params.id)) {
          setError("Track not found.");
          return;
        }

        const supabase = getSupabase();
        const { data: workData, error: workError } = await supabase
          .from("works")
          .select("*")
          .eq("id", params.id)
          .maybeSingle();

        if (workError || !workData) {
          const demoWork = getDemoWork(params.id);
          if (demoWork) {
            const demoDj = getDemoDjProfile(demoWork.dj_id);
            setWork(demoWork);
            setDj(demoDj);
            setRelatedWorks(getDemoWorksByDjId(demoWork.dj_id).filter((item) => item.id !== demoWork.id));
            setTrackDurationSeconds(demoWork.duration_seconds);
            if (demoWork.waveform_peaks?.length) {
              setWaveformPeaks(demoWork.waveform_peaks);
            }
            return;
          }

          if (workError) {
            logSupabaseError("Track page work load failed", workError);
          }
          setError(workError ? formatSupabaseError(workError, "Could not load track.") : "Track not found.");
          return;
        }

        const loadedWork = workData as Work;
        setWork(loadedWork);
        if (loadedWork.duration_seconds) {
          setTrackDurationSeconds(loadedWork.duration_seconds);
        }
        if (Array.isArray(loadedWork.waveform_peaks) && loadedWork.waveform_peaks.length > 12) {
          setWaveformPeaks(loadedWork.waveform_peaks.filter((peak) => typeof peak === "number"));
        }

        const [
          { data: djData, error: djError },
          { data: relatedData, error: relatedError },
          { data: featureData, error: featureError }
        ] = await Promise.all([
          supabase.from("dj_profiles").select("*").eq("id", loadedWork.dj_id).maybeSingle(),
          supabase
            .from("works")
            .select("*")
            .eq("dj_id", loadedWork.dj_id)
            .neq("id", loadedWork.id)
            .eq("visibility", "public")
            .order("created_at", { ascending: false })
            .limit(3),
          supabase
            .from("track_audio_features")
            .select("*")
            .eq("work_id", loadedWork.id)
            .maybeSingle()
        ]);

        if (djError) {
          logSupabaseError("Track page DJ load failed", djError);
        } else {
          setDj((djData as DjProfile | null) ?? null);
        }

        if (relatedError) {
          logSupabaseError("Track page related tracks load failed", relatedError);
        } else {
          setRelatedWorks(((relatedData as Work[]) ?? []).filter((item) => !item.is_deleted));
        }

        if (featureError) {
          logSupabaseError("Track page feature load failed", featureError);
        } else {
          setTrackFeature((featureData as TrackAudioFeature | null) ?? null);
        }
      } catch (caughtError) {
        logSupabaseError("Track page unexpected load failure", caughtError);
        setError(formatSupabaseError(caughtError, "Could not load track."));
      } finally {
        setIsLoading(false);
      }
    }

    loadTrack();
  }, [params.id]);

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      return;
    }

    getSupabase()
      .auth.getUser()
      .then(({ data }) => setMusicScope(data.user?.id ?? null))
      .catch((caughtError) => logSupabaseError("Track favorite scope load failed", caughtError));
  }, []);

  useEffect(() => {
    if (!playerTrack?.src) {
      setWaveformPeaks(createFallbackWaveform(156, trackTitle));
      return;
    }

    if (Array.isArray(work?.waveform_peaks) && work.waveform_peaks.length > 12) {
      setWaveformPeaks(work.waveform_peaks.filter((peak) => typeof peak === "number"));
      return;
    }

    let active = true;
    extractWaveformPeaks(playerTrack.src, 156).then((peaks) => {
      if (active) {
        setWaveformPeaks(peaks);
        if (work?.id && !isDemoWorkId(work.id)) {
          getSupabase()
            .from("works")
            .update({ waveform_peaks: peaks, waveform_analyzed_at: new Date().toISOString() })
            .eq("id", work.id)
            .then(() => {
              // Optional cache write: playback and visual waveform must keep working even when RLS blocks public listeners.
            });
        }
      }
    });

    return () => {
      active = false;
    };
  }, [playerTrack?.src, trackTitle, work?.id, work?.waveform_peaks]);

  useEffect(() => {
    if (!work) {
      return;
    }

    try {
      readVaultSavedTrackIds(musicScope)
        .then((ids) => setIsSaved(ids.includes(work.id)))
        .catch(() => setIsSaved(false));
    } catch {
      setIsSaved(false);
    }
  }, [musicScope, work]);

  useEffect(() => {
    readVaultPlaylists(musicScope)
      .then(setPlaylists)
      .catch((caughtError) => logSupabaseError("Track playlists load failed", caughtError));
  }, [musicScope]);

  useEffect(() => {
    if (pendingSeek === null || currentTrack?.id !== work?.id) {
      return;
    }

    const timer = window.setTimeout(() => {
      seekTo(pendingSeek);
      setPendingSeek(null);
    }, 140);

    return () => window.clearTimeout(timer);
  }, [currentTrack?.id, pendingSeek, seekTo, work?.id]);

  function selectMoment(moment: TrackMoment) {
    const safeSeconds = clampTrackTimestamp(moment.seconds, trackDurationSeconds);
    setSelectedMomentId(moment.id);

    if (playerTrack) {
      if (!isCurrentTrack) {
        playTrack(playerTrack);
      } else {
        seekTo(safeSeconds);
      }
      setPendingSeek(safeSeconds);
    }

    setSelectedTimestamp(safeSeconds);
  }

  function playSelectedMoment() {
    if (!work || !playerTrack) {
      setNotice("Audio file is not attached to this track yet.");
      return;
    }

    selectMoment(selectedMoment);
    recordTrackPlay(work);
  }

  async function saveToLibrary() {
    if (!work) {
      return;
    }

    try {
      const next = await toggleVaultSavedTrackId(work.id, musicScope);
      setIsSaved(next.includes(work.id));
      setNotice(next.includes(work.id) ? "Track added to favorite tracks." : "Track removed from favorites.");
    } catch (caughtError) {
      logSupabaseError("Track favorite toggle failed", caughtError);
      setNotice("Could not update favorite tracks. Retry from Sound Vault.");
    }
  }

  async function saveMomentToVault() {
    if (!work) {
      return;
    }

    const safeSeconds = clampTrackTimestamp(selectedMoment.seconds, trackDurationSeconds);
    try {
      await saveVaultMoment(
        {
          trackId: work.id,
          djId: work.dj_id,
          trackTitle,
          artist: artistName,
          timestamp: safeSeconds,
          timestampLabel: formatTrackTime(safeSeconds),
          momentLabel: getMomentDisplayLabel(selectedMoment),
          bpm: trackBpm,
          energy: selectedMoment.energy,
          roomType: selectedMoment.roomType
        },
        musicScope
      );
      setNotice(`${getMomentDisplayLabel(selectedMoment)} saved as an atmosphere brief.`);
    } catch (caughtError) {
      logSupabaseError("Track saved reference failed", caughtError);
      setNotice("Could not save this reference. Retry from Sound Vault.");
    }
  }

  async function createTrackPlaylist() {
    if (!work) {
      return;
    }

    try {
      const next = await createVaultPlaylist("Room selection", musicScope);
      const created = next[0];
      if (!created) {
        setPlaylists(next);
        return;
      }

      const updated = await toggleVaultTrackInPlaylist(created.id, work.id, musicScope);
      setPlaylists(updated);
      setNotice("Personal playlist created and this track was added.");
    } catch (caughtError) {
      logSupabaseError("Track playlist create/add failed", caughtError);
      setNotice("Could not create playlist. Open Sound Vault and retry.");
    }
  }

  async function toggleTrackPlaylist(playlistId: string) {
    if (!work) {
      return;
    }

    const next = await toggleVaultTrackInPlaylist(playlistId, work.id, musicScope);
    setPlaylists(next);
    const playlist = next.find((item) => item.id === playlistId);
    const inPlaylist = Boolean(playlist?.trackIds.includes(work.id));
    setNotice(inPlaylist ? "Track added to personal playlist." : "Track removed from personal playlist.");
  }

  function handleTrackMetadata(duration: number) {
    const safeDuration = Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null;
    if (!safeDuration) {
      return;
    }

    setTrackDurationSeconds(safeDuration);
    if (!safeDuration || !work || work.duration_seconds === safeDuration || isDemoWorkId(work.id)) {
      return;
    }

    getSupabase()
      .from("works")
      .update({ duration_seconds: safeDuration })
      .eq("id", work.id)
      .then(() => {
        // Optional cache write: ignore RLS denials for non-owner listeners.
      });
  }

  if (!hasSupabaseConfig()) {
    return <MissingConfigNotice />;
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-voidBlack text-paperWhite">
        <section className="mx-auto max-w-[1560px] px-6 py-10 md:px-10">
          <div className="min-h-[720px] animate-pulse border border-roomBorder bg-panelBlack" />
        </section>
      </main>
    );
  }

  if (error || !work) {
    return (
      <main className="room-page">
        <section className="room-shell py-12">
          <EmptyState title="Track unavailable" message={error || "Track not found."} href="/explore" action="Explore DJs" />
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-voidBlack text-paperWhite">
      {work.link ? (
        <audio
          preload="metadata"
          src={work.link}
          onLoadedMetadata={(event) => handleTrackMetadata(event.currentTarget.duration)}
        >
          <track kind="captions" />
        </audio>
      ) : null}
      <TrackTerminalHeader />
      <section className="border-b border-roomBorder px-5 py-6 md:px-6">
        <div className="mx-auto grid max-w-[1560px] gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status="public">Track</StatusBadge>
              <p className="font-mono text-[10px] uppercase text-mutedText">ID: {work.id.slice(0, 8)} / audio topography</p>
            </div>
            <h1 className="mt-4 font-display text-[52px] uppercase leading-[0.88] text-paperWhite md:text-[74px]">
              {trackTitle}
            </h1>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-mutedText">
              {[artistName, trackGenre, `${trackBpm} BPM`, durationLabel, artistCity || "Location TBA"].filter(Boolean).join(" / ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <BackButton fallbackHref={dj ? `/dj/${dj.id}` : "/explore"} label="Back" />
            <Button onClick={playSelectedMoment} type="button" variant="secondary">
              <PlayGlyph className="h-3.5 w-3.5" />
              {isCurrentTrack && isPlaying ? "Playing" : "Play"}
            </Button>
            <Button onClick={saveToLibrary} type="button" variant="secondary">
              <BookmarkGlyph className="h-3.5 w-3.5" filled={isSaved} />
              {isSaved ? "Saved" : "Save"}
            </Button>
            {playerTrack ? (
              <TrackActionMenu
                compact
                moment={{
                  djId: dj?.id,
                  energy: selectedMoment.energy,
                  momentLabel: getMomentDisplayLabel(selectedMoment),
                  roomType: selectedMoment.roomType,
                  timestamp: clampTrackTimestamp(selectedMoment.seconds, trackDurationSeconds),
                  timestampLabel: formatTrackTime(clampTrackTimestamp(selectedMoment.seconds, trackDurationSeconds))
                }}
                onNotice={setNotice}
                track={playerTrack}
              />
            ) : null}
            {dj ? (
              <ButtonLink href={`/dj/${dj.id}`} variant="secondary">
                <ExternalGlyph className="h-3.5 w-3.5" />
                Artist Dossier
              </ButtonLink>
            ) : null}
            {canOpenMusicLab ? (
              <ButtonLink href={`/dashboard/music-lab?workId=${work.id}`} variant="secondary">
                Music Lab
              </ButtonLink>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1560px] gap-6 px-6 py-8 md:px-10 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Panel className="p-5 md:p-6">
            <SectionHeader
              eyebrow="Sound reference"
              title="Audio topography"
              action={
                selectedTimestamp !== null && isCurrentTrack ? (
                  <span className="font-mono text-[10px] uppercase text-acidGreen">
                    Player locked at {formatTrackTime(clampTrackTimestamp(selectedTimestamp, trackDurationSeconds))}
                  </span>
                ) : null
              }
            />

            <div className="mt-6">
              <WaveformEvidence
                duration={trackDurationSeconds}
                moments={timestampMoments}
                peaks={waveformPeaks}
                playheadSeconds={isCurrentTrack ? playerCurrentTime : null}
                isPlaying={isCurrentTrack && isPlaying}
                selectedMoment={selectedMoment}
                onSelectMoment={selectMoment}
              />
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-roomBorder pt-4">
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={work.visibility ?? "public"} />
                <span className="font-mono text-[10px] uppercase text-mutedText">
                  {plays} plays / {saves} saves
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="primary" onClick={playSelectedMoment} type="button">
                  <PlayGlyph className="h-3.5 w-3.5" />
                  {isCurrentTrack && isPlaying ? "Playing Moment" : "Play Selected Moment"}
                </Button>
                <Button variant="secondary" onClick={saveMomentToVault} type="button">
                  <BookmarkGlyph className="h-3.5 w-3.5" />
                  Save Reference
                </Button>
              </div>
            </div>
            {notice ? <p className="mt-5 border border-roomBorder p-3 text-sm text-mutedText">{notice}</p> : null}
          </Panel>

          <Panel className="p-6">
            <SectionHeader eyebrow="Related evidence / same artist" title="From This Artist" />
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {relatedWorks.length === 0 ? (
                <p className="text-sm leading-6 text-mutedText">No related public tracks uploaded yet.</p>
              ) : (
                relatedWorks.map((item) => (
                  <TrackRow
                    key={item.id}
                    track={{
                      id: item.id,
                      title: item.title || "Untitled track",
                      artist: artistName,
                      href: `/track/${item.id}`,
                      coverUrl: getWorkCoverUrl(item, dj),
                      genre: item.genre,
                      bpm: item.bpm,
                      duration: "Open track",
                      plays: item.play_count,
                      saves: item.like_count
                    }}
                  />
                ))
              )}
            </div>
          </Panel>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-8 xl:self-start">
          <Panel className="p-6">
            <SectionHeader eyebrow="Atmosphere brief" title={getMomentDisplayLabel(selectedMoment)} />
            <p className="mt-4 text-sm leading-6 text-mutedText">{selectedMoment.description}</p>
            <div className="mt-5 grid gap-px bg-roomBorder">
              <TrustCell label="Timestamp" value={momentReady ? selectedMoment.timestamp : "Analyzing"} />
              <TrustCell label="Energy" value={selectedMoment.energy} />
              <TrustCell label="Room type" value={selectedMoment.roomType} />
              <TrustCell label="Sound DNA" value={selectedMoment.soundDna} />
              <TrustCell label="Fee signal" value={dj?.price ? `EUR ${dj.price}` : "Fee on request"} />
            </div>
            {momentReady ? (
              <ButtonLink className="mt-6 w-full" href={bookingHref} variant="primary" size="lg">
                Use as Brief
              </ButtonLink>
            ) : (
              <Button className="mt-6 w-full" disabled type="button" variant="secondary" size="lg">
                Analyzing Audio
              </Button>
            )}
            <Button className="mt-3 w-full" onClick={saveMomentToVault} type="button" variant="secondary">
              Save Reference
            </Button>
            <Button className="mt-3 w-full" onClick={saveToLibrary} type="button" variant="ghost">
              {isSaved ? "Remove Favorite" : "Favorite Track"}
            </Button>
            {playerTrack ? (
              <TrackActionMenu
                className="mt-3 w-full [&>button]:w-full"
                moment={{
                  djId: dj?.id,
                  energy: selectedMoment.energy,
                  momentLabel: getMomentDisplayLabel(selectedMoment),
                  roomType: selectedMoment.roomType,
                  timestamp: clampTrackTimestamp(selectedMoment.seconds, trackDurationSeconds),
                  timestampLabel: formatTrackTime(clampTrackTimestamp(selectedMoment.seconds, trackDurationSeconds))
                }}
                onNotice={setNotice}
                track={playerTrack}
              />
            ) : null}
            {dj ? (
              <Link className="mt-4 block text-center font-mono text-[10px] uppercase text-mutedText underline underline-offset-4 hover:text-paperWhite" href={`/dj/${dj.id}`}>
                Open artist dossier
              </Link>
            ) : null}
          </Panel>

          <Panel className="p-6">
            <SectionHeader eyebrow="Personal scope" title="Add To Playlist" />
            <p className="mt-4 text-sm leading-6 text-mutedText">
              Playlists are private to your account. Use them as listening selections before anything becomes a booking case.
            </p>
            <div className="mt-5 space-y-2">
              {playlists.length === 0 ? (
                <Button className="w-full" onClick={createTrackPlaylist} type="button" variant="secondary">
                  Create Room Selection
                </Button>
              ) : (
                playlists.slice(0, 4).map((playlist) => {
                  const active = Boolean(work && playlist.trackIds.includes(work.id));
                  return (
                    <button
                      className={cx(
                        "grid w-full grid-cols-[1fr_auto] items-center gap-3 border p-3 text-left transition",
                        active ? "border-acidGreen bg-[#101700]" : "border-roomBorder bg-panelBlack hover:border-paperWhite"
                      )}
                      key={playlist.id}
                      onClick={() => toggleTrackPlaylist(playlist.id)}
                      type="button"
                    >
                      <span>
                        <span className="block font-display text-lg uppercase text-paperWhite">{playlist.name}</span>
                        <span className="mt-1 block font-mono text-[10px] uppercase text-mutedText">
                          {playlist.trackIds.length} track{playlist.trackIds.length === 1 ? "" : "s"}
                        </span>
                      </span>
                      <StatusBadge status={active ? "selected" : "draft"}>{active ? "saved" : "add"}</StatusBadge>
                    </button>
                  );
                })
              )}
            </div>
            <ButtonLink className="mt-4 w-full" href="/library" variant="ghost">
              Open Sound Vault
            </ButtonLink>
          </Panel>

          <Panel className="p-6">
            <p className="font-mono text-[10px] uppercase text-mutedText">Artist preview</p>
            <div className="mt-5 flex gap-4">
              <div
                className="h-24 w-24 shrink-0 border border-roomBorder bg-inkPanel bg-cover bg-center grayscale"
                style={{ backgroundImage: cssImageUrl(getDjAvatarUrl(dj)) }}
              />
              <div>
                <h2 className="font-display text-3xl uppercase leading-none text-paperWhite">{artistName}</h2>
                <p className="mt-3 text-sm leading-6 text-mutedText">
                  {[dj?.genres || trackGenre, artistCity].filter(Boolean).join(" / ")}
                </p>
              </div>
            </div>
          </Panel>
        </aside>
      </section>
    </main>
  );
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function TrackTerminalHeader() {
  return (
    <header className="flex min-h-[61px] items-center justify-between border-b border-paperWhite bg-black px-6 font-mono text-[12px] uppercase tracking-[0.08em] text-mutedText">
      <div className="flex items-center gap-8">
        <Link className="font-display text-xl uppercase tracking-normal text-paperWhite" href="/">
          ROOM_9
        </Link>
        <span>Booking Terminal // v.2.4</span>
      </div>
      <nav className="flex items-center gap-7 text-paperWhite">
        <Link className="transition hover:text-acidGreen" href="/explore">
          Search
        </Link>
        <Link className="transition hover:text-acidGreen" href="/explore">
          Dossiers
        </Link>
        <Link className="border border-paperWhite px-2 py-2 transition hover:border-acidGreen hover:text-acidGreen" href="/library">
          Vault
        </Link>
      </nav>
    </header>
  );
}

function TrustCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panelBlack p-4">
      <p className="font-mono text-[10px] uppercase text-mutedText">{label}</p>
      <p className="mt-2 font-display text-xl uppercase leading-none text-paperWhite">{value}</p>
    </div>
  );
}

function WaveformEvidence({
  duration,
  isPlaying,
  moments,
  peaks,
  playheadSeconds,
  selectedMoment,
  onSelectMoment
}: {
  duration: number | null;
  isPlaying: boolean;
  moments: TrackMoment[];
  peaks: number[];
  playheadSeconds: number | null;
  selectedMoment: TrackMoment;
  onSelectMoment: (moment: TrackMoment) => void;
}) {
  const width = 1200;
  const height = 250;
  const bottom = height - 30;
  const safeDuration = duration || Math.max(selectedMoment.seconds, 1);
  const selectedX = selectedMoment.timestampKnown
    ? (clampTrackTimestamp(selectedMoment.seconds, safeDuration) / safeDuration) * width
    : selectedMoment.ratio * width;
  const barGap = 4;
  const barWidth = Math.max(3, width / Math.max(1, peaks.length) - barGap);
  const selectedStart = Math.max(0, selectedX - width * 0.055);
  const selectedEnd = Math.min(width, selectedX + width * 0.055);
  const playheadX =
    playheadSeconds !== null && safeDuration > 0
      ? (clampTrackTimestamp(playheadSeconds, safeDuration) / safeDuration) * width
      : 0;
  const progressEnd = playheadSeconds !== null ? playheadX : selectedX;

  return (
    <div className="relative overflow-hidden border border-roomBorder bg-voidBlack">
      <div className="absolute inset-x-0 top-0 z-10 flex justify-between border-b border-roomBorder px-4 py-2 font-mono text-[10px] uppercase text-mutedText">
        <span>00:00</span>
        <span>{duration ? formatTrackTime(duration) : "Analyzing"}</span>
      </div>
      <svg className="block h-[280px] w-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Track waveform evidence">
        <defs>
          <filter id="room9-wave-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect x="0" y="0" width={width} height={height} fill="#050505" />
        <rect x={selectedStart} y="34" width={selectedEnd - selectedStart} height={height - 64} fill="#B8FF2C" opacity="0.08" />
        {peaks.map((peak, index) => {
          const x = (index / Math.max(1, peaks.length - 1)) * width;
          const normalized = Math.max(0.08, Math.min(1, peak));
          const organicPeak = Math.max(
            0.08,
            Math.min(1, normalized * (0.84 + Math.abs(Math.sin(index * 1.37 + selectedMoment.seconds)) * 0.2))
          );
          const barHeight = organicPeak * 162;
          const isSelected = x >= selectedStart && x <= selectedEnd;
          const isPlayed = x <= progressEnd;
          const nearPlayhead = Math.abs(x - playheadX) < width * 0.045;
          const reactive = isPlaying && (isSelected || nearPlayhead || isPlayed);
          return (
            <rect
              className={reactive ? "room-wave-rect" : undefined}
              fill={isSelected ? "#B8FF2C" : isPlayed ? "#F2F0EA" : "#3A3A3A"}
              height={barHeight}
              key={index}
              opacity={isSelected ? 1 : isPlayed ? 0.86 : 0.58}
              style={reactive ? { animationDelay: `${-((index % 19) * 0.045)}s` } : undefined}
              width={barWidth}
              x={x}
              y={bottom - barHeight}
            />
          );
        })}
        {playheadSeconds !== null ? (
          <line
            x1={playheadX}
            x2={playheadX}
            y1="34"
            y2={height}
            stroke="#F2F0EA"
            strokeOpacity="0.72"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        <line x1={selectedX} x2={selectedX} y1="34" y2={height} stroke="#B8FF2C" strokeWidth="2" vectorEffect="non-scaling-stroke" filter="url(#room9-wave-glow)" />
        {moments.map((moment) => {
          const x = moment.timestampKnown
            ? (clampTrackTimestamp(moment.seconds, safeDuration) / safeDuration) * width
            : moment.ratio * width;
          const selected = moment.id === selectedMoment.id;
          return (
            <g key={moment.id}>
              <line x1={x} x2={x} y1="38" y2={bottom} stroke={selected ? "#B8FF2C" : "#3A3A3A"} strokeWidth={selected ? 2 : 1} vectorEffect="non-scaling-stroke" />
              <text x={Math.max(26, Math.min(width - 88, x + 8))} y={selected ? 34 : 52} fill={selected ? "#B8FF2C" : "#999999"} fontFamily="monospace" fontSize="13">
                {moment.timestampKnown ? moment.timestamp : moment.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="grid border-t border-roomBorder md:grid-cols-4">
        {moments.map((moment) => {
          const selected = moment.id === selectedMoment.id;
          return (
            <button
              className={cx(
                "border-b border-roomBorder p-4 text-left transition md:border-b-0 md:border-r md:last:border-r-0",
                selected ? "bg-acidGreen text-voidBlack" : "bg-panelBlack text-paperWhite hover:bg-inkPanel"
              )}
              key={moment.id}
              onClick={() => onSelectMoment(moment)}
              type="button"
            >
              <p className={cx("font-mono text-[10px] uppercase", selected ? "text-voidBlack" : "text-mutedText")}>
                {moment.timestampKnown ? moment.timestamp : "Pending duration"}
              </p>
              <p className="mt-2 font-display text-2xl uppercase leading-none">{moment.label}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
