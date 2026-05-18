"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { useAudioPlayer, type AudioPlayerTrack } from "@/components/GlobalAudioPlayer";
import { TrackActionMenu } from "@/components/TrackActionMenu";
import { ExternalGlyph, PlayGlyph, PlaylistGlyph, QueueGlyph } from "@/components/room9-icons";
import { Button, ButtonLink, Panel, SectionHeader, StatusBadge, Text, cx } from "@/components/room9-ui";
import { cssImageUrl, getWorkCoverUrl } from "@/lib/media";
import {
  createVaultPlaylist,
  readVaultPlaylists,
  toggleVaultTrackInPlaylist,
  type VaultPlaylist
} from "@/lib/soundVault";
import {
  formatSupabaseError,
  getSupabase,
  hasSupabaseConfig,
  isMissingAuthSession,
  logSupabaseError
} from "@/lib/supabase";
import {
  clampTrackTimestamp,
  formatTrackTime,
  getMomentDisplayLabel,
  getPrimaryTrackMoment
} from "@/lib/trackMoments";
import type { DjProfile, Release, ReleaseTrack, Work } from "@/lib/types";

type ReleaseTrackRow = ReleaseTrack;

export default function ReleasePage() {
  const params = useParams<{ id: string }>();
  const releaseId = params.id;
  const player = useAudioPlayer();
  const [release, setRelease] = useState<Release | null>(null);
  const [dj, setDj] = useState<DjProfile | null>(null);
  const [tracks, setTracks] = useState<Work[]>([]);
  const [playlists, setPlaylists] = useState<VaultPlaylist[]>([]);
  const [musicScope, setMusicScope] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingRelease, setIsSavingRelease] = useState(false);
  const [isBriefOpen, setIsBriefOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadRelease() {
      setIsLoading(true);
      setError("");

      if (!hasSupabaseConfig()) {
        setError("Supabase is not configured. Add project URL and public key to load releases.");
        setIsLoading(false);
        return;
      }

      if (!isUuid(releaseId)) {
        setError("Release unavailable. Open a published release from an artist dossier or Sound Vault.");
        setIsLoading(false);
        return;
      }

      try {
        const supabase = getSupabase();
        const { data: releaseData, error: releaseError } = await supabase
          .from("releases")
          .select("*")
          .eq("id", releaseId)
          .maybeSingle();

        if (releaseError) {
          logSupabaseError("Release load failed", releaseError);
          if (mounted) {
            setError(formatSupabaseError(releaseError, "Release could not be loaded."));
          }
          return;
        }

        if (!releaseData) {
          if (mounted) {
            setError("Release not found or it is private.");
          }
          return;
        }

        const loadedRelease = releaseData as Release;
        const [{ data: djData, error: djError }, { data: releaseTrackData, error: releaseTrackError }] =
          await Promise.all([
            supabase.from("dj_profiles").select("*").eq("id", loadedRelease.dj_id).maybeSingle(),
            supabase
              .from("release_tracks")
              .select("*")
              .eq("release_id", loadedRelease.id)
              .order("position", { ascending: true })
          ]);

        if (djError) {
          logSupabaseError("Release artist load failed", djError);
        }
        if (releaseTrackError) {
          logSupabaseError("Release track membership load failed", releaseTrackError);
        }

        const trackRows = (releaseTrackData as ReleaseTrackRow[] | null) ?? [];
        const trackIds = trackRows.map((row) => row.work_id);
        let orderedTracks: Work[] = [];

        if (trackIds.length > 0) {
          const { data: workData, error: workError } = await supabase
            .from("works")
            .select("*")
            .in("id", trackIds)
            .or("is_deleted.is.null,is_deleted.eq.false");

          if (workError) {
            logSupabaseError("Release works load failed", workError);
          } else {
            const workLookup = ((workData as Work[] | null) ?? []).reduce<Record<string, Work>>((acc, work) => {
              acc[work.id] = work;
              return acc;
            }, {});
            orderedTracks = trackIds.map((trackId) => workLookup[trackId]).filter((work): work is Work => Boolean(work));
          }
        }

        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError && !isMissingAuthSession(userError)) {
          logSupabaseError("Release user scope load failed", userError);
        }

        const scope = userData.user?.id ?? null;
        const loadedPlaylists = await readVaultPlaylists(scope);

        if (mounted) {
          setRelease(loadedRelease);
          setDj((djData as DjProfile | null) ?? null);
          setTracks(orderedTracks);
          setMusicScope(scope);
          setPlaylists(loadedPlaylists);
        }
      } catch (caughtError) {
        logSupabaseError("Release load crashed", caughtError);
        if (mounted) {
          setError(formatSupabaseError(caughtError, "Release could not be loaded."));
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadRelease();

    return () => {
      mounted = false;
    };
  }, [releaseId]);

  const artistName = dj?.stage_name || "ROOM_9 Artist";
  const playableTracks = useMemo(
    () =>
      tracks
        .filter((track) => Boolean(track.link))
        .map((track) => buildPlayerTrack(track, artistName, dj)),
    [artistName, dj, tracks]
  );
  const totalDuration = tracks.reduce((sum, track) => sum + (track.duration_seconds || 0), 0);
  const firstPlayableTrack = tracks.find((track) => track.link) ?? tracks[0] ?? null;
  const primaryMoment = firstPlayableTrack ? getPrimaryTrackMoment(firstPlayableTrack.duration_seconds) : null;
  const coverImage = release?.cover_image || getWorkCoverUrl(firstPlayableTrack, dj);
  const releaseType = release ? formatReleaseType(release.release_type) : "Release";

  function playRelease(startIndex = 0) {
    if (playableTracks.length === 0) {
      setNotice("This release has no playable public tracks yet.");
      return;
    }

    player.playQueue(playableTracks, startIndex);
    setNotice("Release added to the player queue.");
  }

  function playTrack(track: Work, momentSeconds?: number) {
    if (!track.link) {
      setNotice("This track has no audio file yet.");
      return;
    }

    const playerTrack = buildPlayerTrack(track, artistName, dj);
    player.playTrack(playerTrack);
    if (typeof momentSeconds === "number") {
      const safeMoment = clampTrackTimestamp(momentSeconds, track.duration_seconds);
      player.setSelectedTimestamp(safeMoment);
      window.setTimeout(() => player.seekTo(safeMoment), 180);
    }
  }

  async function saveReleaseAsPlaylist() {
    if (!release || tracks.length === 0) {
      setNotice("No tracks to save from this release yet.");
      return;
    }

    setIsSavingRelease(true);
    setNotice("");

    try {
      const playlistName = `${release.title} // ${release.release_type.toUpperCase()}`;
      let nextPlaylists = await createVaultPlaylist(playlistName, musicScope);
      let targetPlaylist =
        nextPlaylists.find((playlist) => playlist.name === playlistName && playlist.trackIds.length === 0) ??
        nextPlaylists[0];

      if (!targetPlaylist) {
        setNotice("Could not create playlist for this release.");
        return;
      }

      for (const track of tracks) {
        targetPlaylist = nextPlaylists.find((playlist) => playlist.id === targetPlaylist.id) ?? targetPlaylist;
        if (!targetPlaylist.trackIds.includes(track.id)) {
          nextPlaylists = await toggleVaultTrackInPlaylist(targetPlaylist.id, track.id, musicScope);
        }
      }

      setPlaylists(nextPlaylists);
      await createReleaseNotification("release_published", "Release saved", `${release.title} is now a private playlist in your Sound Vault.`);
      setNotice("Release saved as a private playlist in Sound Vault.");
    } finally {
      setIsSavingRelease(false);
    }
  }

  async function createReleaseNotification(type: string, title: string, body: string) {
    if (!musicScope || !hasSupabaseConfig()) {
      return;
    }

    try {
      const { error: notificationError } = await getSupabase().from("notifications").insert({
        user_id: musicScope,
        type,
        title,
        body
      });

      if (notificationError) {
        logSupabaseError("Release notification create failed", notificationError);
      }
    } catch (notificationError) {
      logSupabaseError("Release notification create crashed", notificationError);
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-voidBlack px-room-4 py-room-6 text-paperWhite">
        <Panel className="mx-auto max-w-[760px] p-room-5">
          <Text variant="uiLabel">Release Terminal</Text>
          <Text as="h1" className="mt-room-2" variant="title">Loading release</Text>
          <Text className="mt-room-2">Fetching tracklist, artist, and Sound Vault controls.</Text>
        </Panel>
      </main>
    );
  }

  if (error || !release) {
    return (
      <main className="min-h-screen bg-voidBlack px-room-4 py-room-6 text-paperWhite">
        <EmptyState
          title="Release unavailable"
          message={error || "This release could not be opened."}
          href="/library"
          action="Open Sound Vault"
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-voidBlack pb-32 text-paperWhite">
      <section className="border-b border-roomBorder">
        <div className="grid min-h-[440px] gap-room-5 px-room-4 py-room-5 md:px-room-6 xl:grid-cols-[minmax(260px,360px)_minmax(0,1fr)]">
          <div
            className="min-h-[320px] border border-strongBorder bg-inkPanel bg-cover bg-center grayscale"
            style={{ backgroundImage: cssImageUrl(coverImage) }}
          />
          <div className="flex min-w-0 flex-col justify-between gap-room-5">
            <div>
              <div className="flex flex-wrap items-center gap-room-2">
                <StatusBadge status="verified">{releaseType}</StatusBadge>
                <StatusBadge status={release.visibility === "public" ? "accepted" : "draft"}>{release.visibility}</StatusBadge>
              </div>
              <Text as="p" className="mt-room-4" variant="uiLabel">Release / {artistName}</Text>
              <h1 className="room-safe-title mt-room-2 max-w-[1100px] font-display text-[clamp(42px,7vw,112px)] uppercase leading-[0.88] text-paperWhite">
                {release.title}
              </h1>
              <Text className="room-clamp-3 mt-room-3 max-w-[760px] text-base leading-7">
                {release.description ||
                  "A structured ROOM_9 release: play the tracklist, save it into your vault, and turn specific sound references into an atmosphere brief for live booking."}
              </Text>
            </div>

            <div className="grid gap-room-2 sm:grid-cols-3">
              <ReleaseMetric label="Tracks" value={tracks.length.toString().padStart(2, "0")} />
              <ReleaseMetric label="Duration" value={totalDuration ? formatTrackTime(totalDuration) : "TBA"} />
              <ReleaseMetric label="Briefs" value={primaryMoment ? getMomentDisplayLabel(primaryMoment) : "None"} />
            </div>

            <div className="flex flex-wrap gap-room-2">
              <Button disabled={playableTracks.length === 0} onClick={() => playRelease(0)} size="lg" type="button" variant="primary">
                <PlayGlyph className="h-4 w-4" />
                Play All
              </Button>
              <Button disabled={isSavingRelease || tracks.length === 0} loading={isSavingRelease} onClick={saveReleaseAsPlaylist} size="lg" type="button" variant="secondary">
                <PlaylistGlyph className="h-4 w-4" />
                Save Release
              </Button>
              {dj ? (
                <ButtonLink href={`/dj/${dj.id}`} size="lg" variant="ghost">
                  <ExternalGlyph className="h-4 w-4" />
                  Open Artist
                </ButtonLink>
              ) : null}
              <Button onClick={() => setIsBriefOpen(true)} size="lg" type="button" variant="secondary">
                Atmosphere Brief
              </Button>
            </div>
          </div>
        </div>
      </section>

      {isBriefOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center px-room-3 py-room-4">
          <button
            aria-label="Close atmosphere brief"
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            onClick={() => setIsBriefOpen(false)}
            type="button"
          />
          <aside className="room-glass-panel relative z-10 max-h-[88vh] w-full max-w-[680px] overflow-y-auto p-room-4">
            <div className="flex items-start justify-between gap-room-3">
              <SectionHeader eyebrow="Atmosphere Brief" title="Use Sound Reference" />
              <Button onClick={() => setIsBriefOpen(false)} size="sm" type="button" variant="ghost">
                Close
              </Button>
            </div>
            {firstPlayableTrack && primaryMoment ? (
              <>
                <div className="mt-room-4 border border-roomBorder bg-black/70 p-room-3">
                  <Text variant="uiLabel">Selected reference</Text>
                  <p className="room-safe-title mt-room-2 font-display text-[clamp(3rem,10vw,5.5rem)] uppercase leading-none text-acidGreen">
                    {primaryMoment.timestamp}
                  </p>
                  <Text className="room-clamp-2 mt-room-2 text-paperWhite" variant="title">
                    {primaryMoment.label}
                  </Text>
                  <Text className="room-clamp-3 mt-room-3">{primaryMoment.description}</Text>
                </div>
                <div className="mt-room-3 grid grid-cols-2 gap-px bg-roomBorder">
                  <ReleaseFact label="Energy" value={primaryMoment.energy} />
                  <ReleaseFact label="Room type" value={primaryMoment.roomType} />
                  <ReleaseFact label="Sound DNA" value={primaryMoment.soundDna} wide />
                </div>
                <div className="mt-room-4 grid gap-room-2 sm:grid-cols-2">
                  <Button onClick={() => playTrack(firstPlayableTrack, primaryMoment.seconds)} type="button" variant="secondary">
                    <PlayGlyph className="h-4 w-4" />
                    Play Reference
                  </Button>
                  {dj ? (
                    <ButtonLink href={`/booking/${dj.id}?workId=${firstPlayableTrack.id}&t=${Math.round(primaryMoment.seconds)}`} variant="primary">
                      Use as Brief
                    </ButtonLink>
                  ) : null}
                </div>
              </>
            ) : (
              <Text className="mt-room-4">
                Add public playable tracks to this release before it can produce an atmosphere brief.
              </Text>
            )}
            {notice ? <p className="mt-room-4 border border-roomBorder bg-black/70 p-room-2 text-sm text-mutedText">{notice}</p> : null}
          </aside>
        </div>
      ) : null}

      <section className="mx-auto max-w-[1560px] px-room-4 py-room-5 md:px-room-6">
        <div className="flex flex-wrap items-end justify-between gap-room-3">
          <SectionHeader eyebrow="Tracklist" title="Release Tracks" />
          <p className="font-mono text-[10px] uppercase text-mutedText">
            {playlists.length} playlist{playlists.length === 1 ? "" : "s"} available in your Sound Vault
          </p>
        </div>

        <div className="mt-room-4 border border-roomBorder">
          {tracks.length === 0 ? (
            <div className="p-room-4">
              <Text variant="title">No tracks attached</Text>
              <Text className="mt-room-2">The artist can add tracks to this release from Sound Vault management.</Text>
            </div>
          ) : (
            tracks.map((track, index) => {
              const moment = getPrimaryTrackMoment(track.duration_seconds);
              const isCurrent = player.currentTrack?.id === track.id;
              const playerTrack = buildPlayerTrack(track, artistName, dj);

              return (
                <article
                  className={cx(
                    "grid gap-room-3 border-b border-roomBorder p-room-3 last:border-b-0 md:grid-cols-[44px_72px_minmax(0,1fr)_auto] md:items-center",
                    isCurrent && "bg-[#111a05]"
                  )}
                  key={track.id}
                >
                  <button
                    aria-label={`Play ${track.title || "track"}`}
                    className={cx(
                      "grid h-10 w-10 place-items-center border transition",
                      isCurrent ? "border-acidGreen bg-acidGreen text-black" : "border-roomBorder bg-panelBlack text-paperWhite hover:border-paperWhite"
                    )}
                    disabled={!track.link}
                    onClick={() => playTrack(track)}
                    type="button"
                  >
                    <PlayGlyph className="h-4 w-4" />
                  </button>
                  <div
                    className="hidden h-16 w-16 border border-roomBorder bg-inkPanel bg-cover bg-center grayscale md:block"
                    style={{ backgroundImage: cssImageUrl(getWorkCoverUrl(track, dj) || coverImage) }}
                  />
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase text-mutedText">
                      {String(index + 1).padStart(2, "0")} / {formatReleaseType(track.type || "track")}
                    </p>
                    <Link className="mt-1 block truncate font-display text-2xl uppercase text-paperWhite hover:text-acidGreen" href={`/track/${track.id}`}>
                      {track.title || "Untitled track"}
                    </Link>
                    <p className="mt-1 truncate font-mono text-[10px] uppercase text-mutedText">
                      {[track.genre || dj?.genres, track.bpm ? `${track.bpm} BPM` : null, track.duration_seconds ? formatTrackTime(track.duration_seconds) : null]
                        .filter(Boolean)
                        .join(" / ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-room-2 md:justify-end">
                    <button
                      className="room-outline-button min-h-9 px-3"
                      disabled={!track.link}
                      onClick={() => playTrack(track, moment.seconds)}
                      type="button"
                    >
                      <QueueGlyph className="h-3.5 w-3.5" />
                      Play Brief
                    </button>
                    {dj ? (
                      <ButtonLink href={`/booking/${dj.id}?workId=${track.id}&t=${Math.round(moment.seconds)}`} size="sm" variant="primary">
                        Use as Brief
                      </ButtonLink>
                    ) : null}
                    <TrackActionMenu
                      compact
                      moment={{
                        djId: dj?.id,
                        energy: moment.energy,
                        momentLabel: getMomentDisplayLabel(moment),
                        roomType: moment.roomType,
                        timestamp: clampTrackTimestamp(moment.seconds, track.duration_seconds),
                        timestampLabel: formatTrackTime(clampTrackTimestamp(moment.seconds, track.duration_seconds))
                      }}
                      onNotice={setNotice}
                      track={{
                        ...playerTrack,
                        bpm: track.bpm,
                        genre: track.genre
                      }}
                    />
                    <ButtonLink href={`/track/${track.id}`} size="sm" variant="secondary">
                      Open Track
                    </ButtonLink>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </main>
  );
}

function buildPlayerTrack(work: Work, artistName: string, dj: DjProfile | null): AudioPlayerTrack {
  return {
    id: work.id,
    title: work.title || "Untitled track",
    artist: artistName,
    src: work.link || "",
    djId: work.dj_id || dj?.id,
    coverUrl: getWorkCoverUrl(work, dj),
    description: [work.genre || dj?.genres, work.bpm ? `${work.bpm} BPM` : dj?.bpm_range].filter(Boolean).join(" / "),
    durationSeconds: work.duration_seconds
  };
}

function formatReleaseType(value: string | null) {
  const normalized = (value || "release").toLowerCase();
  if (normalized === "ep") {
    return "EP";
  }
  return normalized.replace(/^\w/, (letter) => letter.toUpperCase());
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function ReleaseMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-roomBorder bg-black p-room-3">
      <Text variant="uiLabel">{label}</Text>
      <p className="room-safe-title mt-room-2 font-display text-[clamp(1.75rem,4vw,2.5rem)] uppercase leading-none text-paperWhite">{value}</p>
    </div>
  );
}

function ReleaseFact({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cx("bg-black p-room-3", wide && "col-span-2")}>
      <Text variant="uiLabel">{label}</Text>
      <p className="room-clamp-2 mt-room-2 font-mono text-[11px] uppercase text-paperWhite">{value}</p>
    </div>
  );
}
