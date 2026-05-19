"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { useAudioPlayer } from "@/components/GlobalAudioPlayer";
import { MissingConfigNotice } from "@/components/AuthNotice";
import { Room9Waveform } from "@/components/Room9Waveform";
import { TrackActionMenu } from "@/components/TrackActionMenu";
import { BookmarkGlyph, ExternalGlyph, PauseGlyph, PlayGlyph } from "@/components/room9-icons";
import { Button, ButtonLink, Input, Panel, Select, cx } from "@/components/room9-ui";
import { demoDjProfiles, demoWorks, getDemoDjLookup } from "@/lib/demoContent";
import { formatPrice } from "@/lib/format";
import { cssImageUrl, getDjAvatarUrl, getWorkCoverUrl } from "@/lib/media";
import { rosterArtists } from "@/lib/room9Design";
import {
  readVaultSavedTrackIds,
  toggleVaultSavedTrackId
} from "@/lib/soundVault";
import {
  createSignalIntentFromFilters,
  formatSignalScore,
  scoreTrackSignal,
  type TrackSignalScore
} from "@/lib/signalEngine";
import {
  formatSupabaseError,
  getSupabase,
  hasSupabaseConfig,
  logSupabaseError
} from "@/lib/supabase";
import { formatTrackTime, getMomentDisplayLabel, getPrimaryTrackMoment } from "@/lib/trackMoments";
import type { DjProfile, TrackAudioFeature, UserSoundProfile, Work } from "@/lib/types";
import { blendUserSoundProfileWithIntent, getUserSoundProfileHeadline } from "@/lib/userSoundProfile";
import { readUserSoundProfile } from "@/lib/userSoundProfileStore";

const EXPLORE_PAGE_SIZE = 12;
const SOUND_QUEUE_SIZE = 12;
const DJ_PROFILE_COLUMNS =
  "id,user_id,stage_name,bio,country,city,genres,bpm_range,price,avatar_url,cover_image_url,profile_theme,soundcloud_url,mixcloud_url,is_available,created_at";

type DisplayCard =
  | {
      kind: "live";
      id: string;
      name: string;
      location: string;
      cityCode: string;
      genre: string;
      bpm: string;
      price: string;
      status: string;
      avatarUrl: string | null;
      imagePosition: string;
    }
  | {
      kind: "reference";
      id: string;
      name: string;
      location: string;
      cityCode: string;
      genre: string;
      bpm: string;
      price: string;
      status: string;
      avatarUrl: null;
      imagePosition: string;
    };

type SoundQueueItem = {
  work: Work;
  dj: DjProfile | null;
  signal: TrackSignalScore;
};

export default function ExplorePage() {
  return (
    <Suspense fallback={<main className="room-page min-h-screen" />}>
      <ExplorePageContent />
    </Suspense>
  );
}

function ExplorePageContent() {
  const searchParams = useSearchParams();
  const [djs, setDjs] = useState<DjProfile[]>([]);
  const [soundWorks, setSoundWorks] = useState<Work[]>(demoWorks);
  const [soundDjLookup, setSoundDjLookup] = useState<Record<string, DjProfile>>(getDemoDjLookup());
  const [featureLookup, setFeatureLookup] = useState<Record<string, TrackAudioFeature>>({});
  const [query, setQuery] = useState("");
  const [genreFilter, setGenreFilter] = useState("All");
  const [locationFilter, setLocationFilter] = useState("All");
  const [bpmFilter, setBpmFilter] = useState("All");
  const [feeFilter, setFeeFilter] = useState("Any");
  const [availabilityFilter, setAvailabilityFilter] = useState("All");
  const [liveReadyOnly, setLiveReadyOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [roomTypeFilters, setRoomTypeFilters] = useState<string[]>([]);
  const [trackDurations, setTrackDurations] = useState<Record<string, number>>({});
  const [musicScope, setMusicScope] = useState<string | null>(null);
  const [savedTrackIds, setSavedTrackIds] = useState<string[]>([]);
  const [soundProfile, setSoundProfile] = useState<UserSoundProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSounds, setIsLoadingSounds] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [soundError, setSoundError] = useState("");
  const [savedSearchNotice, setSavedSearchNotice] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const { currentTrack, isPlaying, playQueue, setSelectedTimestamp, togglePlayback } = useAudioPlayer();

  const loadDjs = useCallback(async (pageToLoad = 0, append = false) => {
    if (!hasSupabaseConfig()) {
      return;
    }

    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setError("");

    try {
      const supabase = getSupabase();
      const from = pageToLoad * EXPLORE_PAGE_SIZE;
      const to = from + EXPLORE_PAGE_SIZE - 1;

      const { data, error: loadError } = await supabase
        .from("dj_profiles")
        .select(DJ_PROFILE_COLUMNS)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (loadError) {
        logSupabaseError("Explore DJs load failed", loadError);
        if (pageToLoad === 0 && !append) {
          setDjs(demoDjProfiles);
          setHasMore(false);
        } else {
          setError(formatSupabaseError(loadError, "Could not load DJs."));
        }
      } else {
        const loadedDjs = (data as DjProfile[]) ?? [];
        const nextDjs = loadedDjs.length === 0 && pageToLoad === 0 ? demoDjProfiles : loadedDjs;
        setDjs((current) => (append ? [...current, ...loadedDjs] : nextDjs));
        setPage(pageToLoad);
        setHasMore(loadedDjs.length === EXPLORE_PAGE_SIZE && nextDjs === loadedDjs);
      }
    } catch (caughtError) {
      logSupabaseError("Explore DJs unexpected load failure", caughtError);
      setError(formatSupabaseError(caughtError, "Could not load DJs."));
    } finally {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
    }
  }, []);

  const loadSoundQueue = useCallback(async () => {
    if (!hasSupabaseConfig()) {
      return;
    }

    setIsLoadingSounds(soundWorks.length === 0);
    setSoundError("");

    try {
      const supabase = getSupabase();
      const { data: worksData, error: worksError } = await supabase
        .from("works")
        .select("*")
        .eq("visibility", "public")
        .eq("is_deleted", false)
        .order("play_count", { ascending: false })
        .limit(SOUND_QUEUE_SIZE);

      if (worksError) {
        logSupabaseError("Explore sound queue load failed", worksError);
        setSoundWorks(demoWorks);
        setSoundDjLookup(getDemoDjLookup());
        setSoundError("");
        return;
      }

      const loadedWorks = ((worksData as Work[]) ?? []).filter((work) => work.link);
      if (loadedWorks.length === 0) {
        setSoundWorks(demoWorks);
        setSoundDjLookup(getDemoDjLookup());
        return;
      }

      setSoundWorks(loadedWorks);

      const { data: featureData, error: featureError } = await supabase
        .from("track_audio_features")
        .select("*")
        .in("work_id", loadedWorks.map((work) => work.id));

      if (featureError) {
        logSupabaseError("Explore track feature lookup failed", featureError);
        setFeatureLookup({});
      } else {
        setFeatureLookup(
          ((featureData as TrackAudioFeature[]) ?? []).reduce<Record<string, TrackAudioFeature>>((acc, feature) => {
            acc[feature.work_id] = feature;
            return acc;
          }, {})
        );
      }

      const ids = Array.from(new Set(loadedWorks.map((work) => work.dj_id)));
      if (ids.length === 0) {
        setSoundDjLookup({});
        return;
      }

      const { data: djData, error: djError } = await supabase
        .from("dj_profiles")
        .select(DJ_PROFILE_COLUMNS)
        .in("id", ids);

      if (djError) {
        logSupabaseError("Explore sound queue DJ lookup failed", djError);
        setSoundError(formatSupabaseError(djError, "Could not load sound queue artists."));
        setSoundDjLookup({});
        return;
      }

      setSoundDjLookup(
        ((djData as DjProfile[]) ?? []).reduce<Record<string, DjProfile>>((acc, dj) => {
          acc[dj.id] = dj;
          return acc;
        }, {})
      );
    } catch (caughtError) {
      logSupabaseError("Explore sound queue unexpected failure", caughtError);
      setSoundError(formatSupabaseError(caughtError, "Could not load sound queue."));
    } finally {
      setIsLoadingSounds(false);
    }
  }, [soundWorks.length]);

  useEffect(() => {
    loadDjs();
    loadSoundQueue();
  }, [loadDjs, loadSoundQueue]);

  useEffect(() => {
    async function loadSavedTrackScope() {
      try {
        const { data } = await getSupabase().auth.getUser();
        const scope = data.user?.id ?? null;
        setMusicScope(scope);
        setSavedTrackIds(await readVaultSavedTrackIds(scope));
        setSoundProfile(await readUserSoundProfile(scope));
      } catch (caughtError) {
        logSupabaseError("Explore saved track scope failed", caughtError);
        setSavedTrackIds(await readVaultSavedTrackIds(null));
        setSoundProfile(null);
      }
    }

    if (hasSupabaseConfig()) {
      loadSavedTrackScope();
    }
  }, []);

  useEffect(() => {
    const incomingQuery = searchParams.get("q") ?? "";
    setQuery(incomingQuery);
  }, [searchParams]);

  const filteredDjs = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return djs.filter((dj) =>
      (!normalized ||
        [
          dj.stage_name,
          dj.bio,
          dj.genres,
          dj.city,
          dj.country,
          dj.bpm_range,
          dj.price?.toString(),
          dj.profile_theme,
          dj.soundcloud_url,
          dj.mixcloud_url,
          dj.is_available ? "available" : "offline"
        ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
          .includes(normalized)) &&
      (genreFilter === "All" ||
        (dj.genres ?? "").toLowerCase().includes(genreFilter.toLowerCase())) &&
      (locationFilter === "All" ||
        [dj.city, dj.country].filter(Boolean).join(", ").toLowerCase().includes(locationFilter.toLowerCase())) &&
      (bpmFilter === "All" || (dj.bpm_range ?? "").toLowerCase().includes(bpmFilter.toLowerCase())) &&
      feeMatches(dj.price, feeFilter) &&
      (availabilityFilter === "All" ||
        (availabilityFilter === "Available" ? dj.is_available : !dj.is_available)) &&
      (!liveReadyOnly || dj.is_available) &&
      (!verifiedOnly || isVerifiedDj(dj))
    );
  }, [
    availabilityFilter,
    bpmFilter,
    djs,
    feeFilter,
    genreFilter,
    liveReadyOnly,
    locationFilter,
    query,
    verifiedOnly
  ]);

  const filterSignalIntent = useMemo(
    () =>
      createSignalIntentFromFilters({
        bpmFilter,
        city: locationFilter,
        feeBand: feeFilter,
        genre: genreFilter,
        roomTypes: roomTypeFilters,
        savedTrackIds
      }),
    [bpmFilter, feeFilter, genreFilter, locationFilter, roomTypeFilters, savedTrackIds]
  );
  const signalIntent = useMemo(
    () => blendUserSoundProfileWithIntent(soundProfile, filterSignalIntent),
    [filterSignalIntent, soundProfile]
  );
  const soundProfileHeadline = useMemo(() => getUserSoundProfileHeadline(soundProfile), [soundProfile]);

  const soundQueue = useMemo<SoundQueueItem[]>(() => {
    const normalized = query.trim().toLowerCase();

    return soundWorks
      .map((work) => {
        const dj = soundDjLookup[work.dj_id] ?? null;
        return { work, dj, signal: scoreTrackSignal({ dj, features: featureLookup[work.id] ?? null, work }, signalIntent) };
      })
      .filter(({ work, dj }) => {
        const searchable = [
          work.title,
          work.description,
          work.genre,
          work.bpm,
          work.key,
          dj?.stage_name,
          dj?.city,
          dj?.country,
          dj?.genres,
          dj?.bpm_range,
          dj?.price?.toString(),
          dj?.profile_theme
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return (
          (!normalized || searchable.includes(normalized)) &&
          (genreFilter === "All" ||
            [work.genre, dj?.genres].filter(Boolean).join(" ").toLowerCase().includes(genreFilter.toLowerCase())) &&
          (locationFilter === "All" ||
            [dj?.city, dj?.country].filter(Boolean).join(", ").toLowerCase().includes(locationFilter.toLowerCase())) &&
          (bpmFilter === "All" ||
            [work.bpm, dj?.bpm_range].filter(Boolean).join(" ").toLowerCase().includes(bpmFilter.toLowerCase())) &&
          feeMatches(dj?.price ?? null, feeFilter) &&
          (availabilityFilter === "All" ||
            (availabilityFilter === "Available" ? Boolean(dj?.is_available) : !dj?.is_available)) &&
          (!liveReadyOnly || Boolean(dj?.is_available)) &&
          (!verifiedOnly || Boolean(dj && isVerifiedDj(dj))) &&
          (roomTypeFilters.length === 0 ||
            roomTypeFilters.some((roomType) => soundMatchesRoomType(work, dj, roomType)))
        );
      })
      .sort((a, b) => b.signal.sortScore - a.signal.sortScore);
  }, [
    availabilityFilter,
    bpmFilter,
    feeFilter,
    genreFilter,
    liveReadyOnly,
    locationFilter,
    query,
    roomTypeFilters,
    featureLookup,
    soundDjLookup,
    soundWorks,
    signalIntent,
    verifiedOnly
  ]);

  const playableQueue = useMemo(
    () =>
      soundQueue
        .filter(({ work }) => work.link)
        .map(({ work, dj }) => ({
          id: work.id,
          title: work.title || "Untitled track",
          artist: dj?.stage_name || "ROOM_9 Artist",
          src: work.link || "",
          djId: work.dj_id,
          coverUrl: getWorkCoverUrl(work, dj),
          description: [work.genre, work.bpm ? `${work.bpm} BPM` : "", dj?.city].filter(Boolean).join(" / "),
          durationSeconds: work.duration_seconds
        })),
    [soundQueue]
  );

  const genreOptions = useMemo(() => {
    const liveGenres = djs.flatMap((dj) =>
      (dj.genres ?? "")
        .split(",")
        .map((genre) => genre.trim())
        .filter(Boolean)
    );
    const trackGenres = soundWorks.map((work) => work.genre).filter(Boolean) as string[];
    return ["All", ...Array.from(new Set([...trackGenres, ...liveGenres, ...rosterArtists.map((artist) => artist.genre)]))];
  }, [djs, soundWorks]);

  const locationOptions = useMemo(() => {
    const soundLocations = Object.values(soundDjLookup)
      .map((dj) => [dj.city, dj.country].filter(Boolean).join(", "))
      .filter(Boolean);
    const liveLocations = djs
      .map((dj) => [dj.city, dj.country].filter(Boolean).join(", "))
      .filter(Boolean);
    return ["All", ...Array.from(new Set([...soundLocations, ...liveLocations]))];
  }, [djs, soundDjLookup]);

  const bpmOptions = useMemo(() => {
    const soundBpms = soundWorks.map((work) => work.bpm).filter(Boolean) as string[];
    const liveBpms = djs.map((dj) => dj.bpm_range).filter(Boolean) as string[];
    return ["All", ...Array.from(new Set([...soundBpms, ...liveBpms]))];
  }, [djs, soundWorks]);

  const displayCards = useMemo<DisplayCard[]>(() => {
    if (filteredDjs.length > 0) {
      const liveCards: DisplayCard[] = filteredDjs.map((dj, index) => ({
        kind: "live",
        id: dj.id,
        name: dj.stage_name || "Unnamed DJ",
        location: [dj.city, dj.country].filter(Boolean).join(", ") || "Location TBA",
        cityCode: (dj.city || dj.country || "TBA").slice(0, 3).toUpperCase(),
        genre: dj.genres || "Genre TBA",
        bpm: dj.bpm_range || "BPM TBA",
        price: formatPrice(dj.price),
        status: dj.is_available ? "Available" : "Offline",
        avatarUrl: getDjAvatarUrl(dj),
        imagePosition: rosterArtists[index % rosterArtists.length].imagePosition
      }));

      if (
        hasActiveFilters(
          query,
          genreFilter,
          locationFilter,
          bpmFilter,
          feeFilter,
          availabilityFilter,
          liveReadyOnly,
          verifiedOnly
        )
      ) {
        return liveCards;
      }

      if (liveCards.length >= 4) {
        return liveCards;
      }

      const referenceFill = rosterArtists.slice(liveCards.length).map((artist) => ({
        kind: "reference" as const,
        id: artist.name,
        name: artist.name,
        location: artist.location,
        cityCode: artist.cityCode,
        genre: artist.genre,
        bpm: artist.bpm,
        price: "Fee on request",
        status: artist.status,
        avatarUrl: null,
        imagePosition: artist.imagePosition
      }));

      return [...liveCards, ...referenceFill].slice(0, 4);
    }

    if (
      hasActiveFilters(
        query,
        genreFilter,
        locationFilter,
        bpmFilter,
        feeFilter,
        availabilityFilter,
        liveReadyOnly,
        verifiedOnly
      )
    ) {
      return [];
    }

    return rosterArtists.map((artist) => ({
      kind: "reference",
      id: artist.name,
      name: artist.name,
      location: artist.location,
      cityCode: artist.cityCode,
      genre: artist.genre,
      bpm: artist.bpm,
      price: "Fee on request",
      status: artist.status,
      avatarUrl: null,
      imagePosition: artist.imagePosition
    }));
  }, [
    availabilityFilter,
    bpmFilter,
    feeFilter,
    filteredDjs,
    genreFilter,
    liveReadyOnly,
    locationFilter,
    query,
    verifiedOnly
  ]);

  const filtersAreActive =
    hasActiveFilters(
      query,
      genreFilter,
      locationFilter,
      bpmFilter,
      feeFilter,
      availabilityFilter,
      liveReadyOnly,
      verifiedOnly
    ) || roomTypeFilters.length > 0;

  useEffect(() => {
    if (!advancedFiltersOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAdvancedFiltersOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [advancedFiltersOpen]);

  function playSound(workId: string) {
    if (currentTrack?.id === workId) {
      togglePlayback();
      return;
    }

    const index = playableQueue.findIndex((track) => track.id === workId);
    if (index < 0) {
      return;
    }

    const work = soundWorks.find((item) => item.id === workId);
    const duration = trackDurations[workId] ?? work?.duration_seconds ?? null;
    playQueue(playableQueue, index);
    setSelectedTimestamp(getPrimaryTrackMoment(duration).seconds);
  }

  async function toggleSavedSound(workId: string) {
    const next = await toggleVaultSavedTrackId(workId, musicScope);
    setSavedTrackIds(next);
  }

  function saveSearch() {
    const search = {
      query,
      genre: genreFilter,
      location: locationFilter,
      bpm: bpmFilter,
      fee: feeFilter,
      availability: availabilityFilter,
      liveReadyOnly,
      verifiedOnly,
      roomTypes: roomTypeFilters,
      savedAt: new Date().toISOString()
    };

    window.localStorage.setItem("room9_saved_discovery_search", JSON.stringify(search));
    setSavedSearchNotice("Search saved locally for this demo workspace.");
  }

  if (!hasSupabaseConfig()) {
    return <MissingConfigNotice />;
  }

  return (
    <main className="room-page">
      <section className="border-b border-roomBorder px-5 py-5 md:px-6">
        <div className="mx-auto max-w-[1680px]">
          <div>
            <p className="room-tiny text-mutedText">Discover / sound-first search</p>
            <h1 className="room-heading mt-3 max-w-4xl text-[30px] leading-[0.96] sm:text-[36px] lg:text-[42px]">
              Find DJs by sound,
              <br />
              not cards.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-ash">
              Search by genre, city, BPM, fee, availability, and bookable moments. Listen first,
              open the dossier second, book only when the sound fits the room.
            </p>
            {actionNotice ? (
              <p className="mt-3 inline-flex border border-roomBorder bg-panelBlack px-3 py-2 font-mono text-[10px] uppercase text-mutedText">
                {actionNotice}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="border-b border-roomBorder px-5 py-3 md:px-6">
        <Panel className="mx-auto max-w-[1680px] p-3">
          <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_2fr] xl:items-start">
            <label>
              <span className="room-label">Search</span>
              <Input
                aria-label="Search tracks, DJs, city, genre, BPM"
                className="min-h-10 py-2 text-sm"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tracks, DJs, city, genre, BPM..."
                value={query}
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              <CompactSelect label="Genre" value={genreFilter} values={genreOptions} onChange={setGenreFilter} />
              <CompactSelect label="City / Location" value={locationFilter} values={locationOptions} onChange={setLocationFilter} />
              <CompactSelect label="BPM range" value={bpmFilter} values={bpmOptions} onChange={setBpmFilter} />
              <CompactSelect label="Fee" value={feeFilter} values={["Any", "Under 500", "500-1000", "1000+"]} onChange={setFeeFilter} />
              <CompactSelect label="Availability" value={availabilityFilter} values={["All", "Available", "Offline"]} onChange={setAvailabilityFilter} />
              <label className="flex min-h-[68px] items-end">
                <Button
                  active={verifiedOnly}
                  className="w-full"
                  onClick={() => setVerifiedOnly((current) => !current)}
                  size="sm"
                  type="button"
                  variant={verifiedOnly ? "primary" : "ghost"}
                >
                  Verified
                </Button>
              </label>
              <label className="flex min-h-[68px] items-end">
                <Button
                  active={liveReadyOnly}
                  className="w-full"
                  onClick={() => setLiveReadyOnly((current) => !current)}
                  size="sm"
                  type="button"
                  variant={liveReadyOnly ? "primary" : "ghost"}
                >
                  Live-ready
                </Button>
              </label>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-roomBorder pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                active={!filtersAreActive}
                onClick={() => {
                  setQuery("");
                  setGenreFilter("All");
                  setLocationFilter("All");
                  setBpmFilter("All");
                  setFeeFilter("Any");
                  setAvailabilityFilter("All");
                  setLiveReadyOnly(false);
                  setVerifiedOnly(false);
                  setRoomTypeFilters([]);
                  setSavedSearchNotice("");
                }}
                size="sm"
                type="button"
                variant={!filtersAreActive ? "primary" : "ghost"}
              >
                All Sounds
              </Button>
              <Button
                active={liveReadyOnly}
                onClick={() => setLiveReadyOnly((current) => !current)}
                size="sm"
                type="button"
                variant={liveReadyOnly ? "primary" : "ghost"}
              >
                Live-ready
              </Button>
              <Button
                active={verifiedOnly}
                onClick={() => setVerifiedOnly((current) => !current)}
                size="sm"
                type="button"
                variant={verifiedOnly ? "primary" : "ghost"}
              >
                Verified
              </Button>
              <Button
                onClick={() => {
                  setQuery("");
                  setGenreFilter("All");
                  setLocationFilter("All");
                  setBpmFilter("All");
                  setFeeFilter("Any");
                  setAvailabilityFilter("All");
                  setLiveReadyOnly(false);
                  setVerifiedOnly(false);
                  setRoomTypeFilters([]);
                  setSavedSearchNotice("");
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                Clear all
              </Button>
              {query.trim() ? <ActiveTag label={query.trim()} onClear={() => setQuery("")} /> : null}
              {genreFilter !== "All" ? <ActiveTag label={genreFilter} onClear={() => setGenreFilter("All")} /> : null}
              {locationFilter !== "All" ? <ActiveTag label={locationFilter} onClear={() => setLocationFilter("All")} /> : null}
              {bpmFilter !== "All" ? <ActiveTag label={bpmFilter} onClear={() => setBpmFilter("All")} /> : null}
              {feeFilter !== "Any" ? <ActiveTag label={feeFilter} onClear={() => setFeeFilter("Any")} /> : null}
              {availabilityFilter !== "All" ? (
                <ActiveTag label={availabilityFilter} onClear={() => setAvailabilityFilter("All")} />
              ) : null}
              {roomTypeFilters.map((roomType) => (
                <ActiveTag
                  key={roomType}
                  label={roomType}
                  onClear={() => setRoomTypeFilters((current) => current.filter((item) => item !== roomType))}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {savedSearchNotice ? <span className="room-tiny text-successGreen">{savedSearchNotice}</span> : null}
              <Button
                active={advancedFiltersOpen || roomTypeFilters.length > 0}
                onClick={() => setAdvancedFiltersOpen((current) => !current)}
                size="sm"
                type="button"
                variant={advancedFiltersOpen || roomTypeFilters.length > 0 ? "primary" : "secondary"}
              >
                Sound Filters
              </Button>
              <Button onClick={saveSearch} size="sm" type="button" variant="secondary">
                Save Search
              </Button>
            </div>
          </div>
        </Panel>
      </section>

      {advancedFiltersOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-[1px]"
          onClick={() => setAdvancedFiltersOpen(false)}
          role="presentation"
        >
          <div
            aria-label="Sound filter command palette"
            aria-modal="true"
            className="absolute bottom-[92px] right-3 top-[76px] w-[min(380px,calc(100vw-24px))] border border-strongBorder bg-voidBlack shadow-[0_20px_80px_rgba(0,0,0,0.72)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <AdvancedSoundFiltersPanel
              bpmFilter={bpmFilter}
              genreFilter={genreFilter}
              genreOptions={genreOptions}
              locationFilter={locationFilter}
              roomTypeFilters={roomTypeFilters}
              onBpmFilterChange={setBpmFilter}
              onClose={() => setAdvancedFiltersOpen(false)}
              onGenreFilterChange={setGenreFilter}
              onLocationFilterChange={setLocationFilter}
              onReset={() => {
                setGenreFilter("All");
                setLocationFilter("All");
                setBpmFilter("All");
                setFeeFilter("Any");
                setAvailabilityFilter("All");
                setLiveReadyOnly(false);
                setVerifiedOnly(false);
                setRoomTypeFilters([]);
              }}
              onRoomTypeToggle={(roomType) =>
                setRoomTypeFilters((current) =>
                  current.includes(roomType)
                    ? current.filter((item) => item !== roomType)
                    : [...current, roomType]
                )
              }
            />
          </div>
        </div>
      ) : null}

      <section className="border-b border-roomBorder px-5 py-5 md:px-6">
        <div className="mx-auto max-w-[1680px]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="room-tiny text-mutedText">Live Discovery Queue</p>
              <h2 className="room-heading mt-2 text-[30px] leading-none">Discovery Feed</h2>
            </div>
            <span className="room-tiny text-acidGreen">{soundQueue.length} results found</span>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="room-heading text-2xl">Sound Matches</h3>
                  <p className="mt-2 font-mono text-xs uppercase tracking-[0.24em] text-mutedText">
                    {soundQueue.length} artists match your sound profile
                  </p>
                </div>
                <p className="room-tiny">
                  Sort by: <span className="text-paperWhite">{soundProfile ? "Personal Signal" : "Signal Engine"}</span>
                </p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 border border-roomBorder bg-panelBlack px-3 py-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-mutedText">
                  {soundProfile ? "Sound Profile active" : "Sound Profile"}
                </span>
                <span className="font-mono text-[10px] uppercase text-acidGreen">
                  {soundProfile ? soundProfileHeadline : "Save tracks and moments to personalize discovery"}
                </span>
              </div>
              <div className="mt-4 hidden border-y border-roomBorder bg-black px-3 py-3 font-mono text-[10px] uppercase text-mutedText lg:grid lg:grid-cols-[48px_1fr_120px_84px_86px_190px]">
                <span>Play</span>
                <span>Track / Artist</span>
                <span>Genre</span>
                <span>BPM</span>
                <span>Time</span>
                <span className="text-right">Actions</span>
              </div>
            {isLoadingSounds ? (
              [0, 1, 2].map((item) => (
                <div className="h-[112px] animate-pulse border-b border-line bg-panel" key={item} />
              ))
            ) : soundError ? (
              <EmptyState title="Sound queue unavailable" message={soundError} />
            ) : soundQueue.length === 0 ? (
              <EmptyState
                title="No public sounds found"
                message="No artists found. Try adjusting filters."
                href="/dashboard"
                action="Upload Track"
              />
            ) : (
              soundQueue.map(({ work, dj, signal }) => {
                const playableIndex = playableQueue.findIndex((track) => track.id === work.id);
                const current = currentTrack?.id === work.id;
                const duration = trackDurations[work.id] ?? work.duration_seconds ?? null;
                const moment = getPrimaryTrackMoment(duration);
                const momentLabel = getMomentDisplayLabel(moment);
                const saved = savedTrackIds.includes(work.id);
                const playerTrack = work.link
                  ? {
                      id: work.id,
                      title: work.title || "Untitled track",
                      artist: dj?.stage_name || "ROOM_9 Artist",
                      src: work.link,
                      djId: work.dj_id,
                      coverUrl: getWorkCoverUrl(work, dj),
                      description: [work.genre || dj?.genres, work.bpm || dj?.bpm_range, dj?.city].filter(Boolean).join(" / "),
                      durationSeconds: work.duration_seconds,
                      bpm: work.bpm || dj?.bpm_range,
                      genre: work.genre || dj?.genres
                    }
                  : null;

                return (
                  <article
                    className={cx(
                      "grid gap-3 border-b border-line px-3 py-3 transition lg:grid-cols-[48px_1fr_120px_84px_86px_190px] lg:items-center",
                      current ? "bg-[#0b1200]" : "bg-black hover:bg-panel"
                    )}
                    key={work.id}
                  >
                    {work.link ? (
                      <audio
                        preload="metadata"
                        src={work.link}
                        onLoadedMetadata={(event) => {
                          const loadedDuration = Number.isFinite(event.currentTarget.duration)
                            ? event.currentTarget.duration
                            : work.duration_seconds ?? 0;
                          setTrackDurations((currentDurations) => ({
                            ...currentDurations,
                            [work.id]: loadedDuration
                          }));
                        }}
                      >
                        <track kind="captions" />
                      </audio>
                    ) : null}
                    <button
                      className={cx(
                        "grid h-9 w-9 place-items-center border font-mono text-xs font-black transition",
                        current ? "border-acidGreen bg-acidGreen text-black" : "border-roomBorder bg-panel text-paperWhite hover:border-paperWhite"
                      )}
                      disabled={playableIndex < 0}
                      onClick={() => playSound(work.id)}
                      type="button"
                    >
                      {current && isPlaying ? <PauseGlyph className="h-3.5 w-3.5" /> : <PlayGlyph className="h-3.5 w-3.5" />}
                    </button>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className="hidden h-10 w-10 shrink-0 border border-roomBorder bg-panel bg-cover bg-center sm:block"
                          style={{ backgroundImage: cssImageUrl(getWorkCoverUrl(work, dj)) }}
                        />
                        <div className="min-w-0">
                          <Link
                            className={cx("block truncate font-display text-lg uppercase leading-none hover:text-acidGreen", current ? "text-acidGreen" : "text-paperWhite")}
                            href={`/track/${work.id}`}
                          >
                            {work.title || "Untitled track"}
                          </Link>
                          <p className="mt-1 font-mono text-[10px] uppercase text-ash">
                            {dj?.stage_name || "ROOM_9 Artist"}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 lg:hidden">
                        <MiniWaveform active={current} seed={work.id} />
                      </div>
                    </div>
                    <span className="font-mono text-[10px] uppercase text-mutedText">
                      {work.genre || dj?.genres || "Unknown"}
                    </span>
                    <span className={cx("font-mono text-xs uppercase", current ? "text-acidGreen" : "text-paperWhite")}>
                      {work.bpm || dj?.bpm_range || "--"}
                    </span>
                    <span className="font-mono text-[10px] uppercase text-mutedText">
                      {duration ? formatTrackTime(duration) : "..."}
                    </span>
                    <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                      <span
                        className="inline-flex min-h-7 items-center border border-roomBorder bg-panelBlack px-2 font-mono text-[10px] uppercase text-acidGreen"
                        title={signal.reasons.join(" / ")}
                      >
                        {formatSignalScore(signal.soundMatch)}
                      </span>
                      <button
                        className="inline-flex items-center gap-2 font-mono text-[10px] uppercase text-mutedText hover:text-acidGreen"
                        onClick={() => playSound(work.id)}
                        type="button"
                      >
                        {current && isPlaying ? <PauseGlyph className="h-3 w-3" /> : <PlayGlyph className="h-3 w-3" />}
                        Listen
                      </button>
                      <Button
                        active={saved}
                        onClick={() => toggleSavedSound(work.id)}
                        size="sm"
                        type="button"
                        variant={saved ? "secondary" : "ghost"}
                      >
                        <BookmarkGlyph className="h-3.5 w-3.5" filled={saved} />
                        {saved ? "Saved" : "Save"}
                      </Button>
                      <ButtonLink href={`/track/${work.id}`} size="sm" variant="secondary">
                        <ExternalGlyph className="h-3.5 w-3.5" />
                        Open Track
                      </ButtonLink>
                      {playerTrack ? (
                        <TrackActionMenu
                          compact
                          moment={{
                            djId: dj?.id ?? work.dj_id,
                            energy: "High",
                            momentLabel,
                            roomType: "Warehouse",
                            timestamp: moment.seconds,
                            timestampLabel: moment.timestamp
                          }}
                          onNotice={setActionNotice}
                          track={playerTrack}
                        />
                      ) : null}
                      {dj ? (
                        <Link className="room-tiny self-center text-bone underline underline-offset-4" href={`/dj/${dj.id}`}>
                          Dossier
                        </Link>
                      ) : null}
                    </div>
                    <div className="lg:col-start-2 lg:col-end-7">
                      <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_auto] lg:items-center">
                        <MiniWaveform active={current} seed={work.id} />
                        <div className="flex min-w-0 flex-wrap items-center gap-2 font-mono text-[10px] uppercase text-mutedText">
                          <span className={cx("shrink-0", current ? "text-acidGreen" : "text-mutedText")}>{momentLabel}</span>
                          <span className="shrink-0">{work.play_count ?? 0} plays</span>
                          <span className="shrink-0">{work.like_count ?? 0} saves</span>
                          <span className="shrink-0 border border-roomBorder px-2 py-1 text-acidGreen">Signal</span>
                          <span className="min-w-0 max-w-full break-words text-mutedText md:max-w-[44ch]">
                            {signal.reasons[0] ?? "Matched by genre, BPM and listener archive."}
                          </span>
                          {signal.tags.slice(0, 2).map((tag, tagIndex) => (
                            <span
                              className="shrink-0 border border-roomBorder px-2 py-1 text-ash"
                              key={`${work.id}-signal-tag-${tag}-${tagIndex}`}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
            </div>

            <aside className="border border-roomBorder bg-black p-5 xl:sticky xl:top-24 xl:self-start">
              <div className="flex items-center justify-between border-b border-roomBorder pb-4">
                <p className="font-mono text-xs font-black uppercase tracking-[0.28em] text-paperWhite">
                  Related Artists
                </p>
                <span className="room-tiny text-acidGreen">{displayCards.length}</span>
              </div>
              <div className="mt-5 space-y-5">
                {displayCards.slice(0, 3).map((artist) => {
                  const hasArtistImage = Boolean(artist.avatarUrl);

                  return (
                    <Link
                      className="block border border-roomBorder bg-panelBlack transition hover:border-paperWhite"
                      href={artist.kind === "live" ? `/dj/${artist.id}` : "/register?role=dj"}
                      key={`${artist.kind}-related-${artist.id}`}
                    >
                      <div
                        className={cx(
                          "h-36 border-b border-roomBorder bg-cover bg-center grayscale",
                          hasArtistImage ? "bg-inkPanel" : "room-photo"
                        )}
                        style={
                          hasArtistImage
                            ? { backgroundImage: cssImageUrl(artist.avatarUrl) }
                            : { backgroundPosition: artist.imagePosition }
                        }
                      />
                      <div className="p-4">
                        <h3 className="font-display text-xl uppercase text-paperWhite">{artist.name}</h3>
                        <p className="mt-2 font-mono text-[10px] uppercase text-mutedText">
                          {artist.location} / {artist.genre}
                        </p>
                        <div className="mt-4 flex items-center gap-2">
                          <span className="flex-1 border border-roomBorder px-3 py-2 text-center font-mono text-[10px] uppercase text-paperWhite">
                            Open Artist
                          </span>
                          <span className="grid h-8 w-8 place-items-center border border-roomBorder text-acidGreen">+</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </aside>
          </div>
        </div>
      </section>

      {!isLoading && !error && displayCards.length > 0 && hasMore ? (
        <section className="px-5 py-8 md:px-6">
          <div className="mx-auto flex max-w-[1680px] justify-center">
            <button
              className="room-outline-button min-w-[220px]"
              type="button"
              onClick={() => loadDjs(page + 1, true)}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? "Loading..." : "Load More DJs"}
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function CompactSelect({
  label,
  value,
  values,
  onChange
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="room-label">{label}</span>
      <Select
        className="min-h-10 py-2 text-xs"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {values.map((item) => (
          <option className="bg-black text-bone" key={item} value={item}>
            {item}
          </option>
        ))}
      </Select>
    </label>
  );
}

function AdvancedSoundFiltersPanel({
  bpmFilter,
  genreFilter,
  genreOptions,
  locationFilter,
  roomTypeFilters,
  onBpmFilterChange,
  onClose,
  onGenreFilterChange,
  onLocationFilterChange,
  onReset,
  onRoomTypeToggle
}: {
  bpmFilter: string;
  genreFilter: string;
  genreOptions: string[];
  locationFilter: string;
  roomTypeFilters: string[];
  onBpmFilterChange: (value: string) => void;
  onClose: () => void;
  onGenreFilterChange: (value: string) => void;
  onLocationFilterChange: (value: string) => void;
  onReset: () => void;
  onRoomTypeToggle: (value: string) => void;
}) {
  const bpmOptions = ["All", "120-130", "130-145", "145+"];

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="flex items-start justify-between gap-4 border-b border-roomBorder pb-4">
        <div>
          <p className="room-tiny text-acidGreen">Command / Sound Filters</p>
          <h2 className="room-heading mt-2 text-xl">Refine signal</h2>
          <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-mutedText">Esc closes the drawer</p>
        </div>
        <button
          className="border border-roomBorder px-3 py-2 font-mono text-[10px] uppercase text-mutedText transition hover:border-paperWhite hover:text-paperWhite"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </div>

      <div className="mt-5 grid gap-4">
        <div className="border border-roomBorder bg-black p-3">
          <div className="flex items-center justify-between">
            <p className="room-tiny">BPM Range</p>
            <span className="font-mono text-xs uppercase text-paperWhite">{bpmFilter === "All" ? "Any" : bpmFilter}</span>
          </div>
          <input
            aria-label="BPM range"
            className="mt-4 w-full accent-acidGreen"
            max={3}
            min={0}
            type="range"
            value={Math.max(0, bpmOptions.indexOf(bpmFilter))}
            onChange={(event) => onBpmFilterChange(bpmOptions[Number(event.target.value)])}
          />
        </div>

        <div className="border border-roomBorder bg-black p-3">
          <p className="room-tiny mb-3">Genre Weight</p>
          <div className="grid grid-cols-2 gap-2">
            {genreOptions.filter((genre) => genre !== "All").slice(0, 6).map((genre) => (
              <Button
                active={genreFilter === genre}
                className="justify-center"
                key={genre}
                onClick={() => onGenreFilterChange(genreFilter === genre ? "All" : genre)}
                size="sm"
                type="button"
                variant={genreFilter === genre ? "primary" : "ghost"}
              >
                {genre}
              </Button>
            ))}
          </div>
        </div>

        <div className="border border-roomBorder bg-black p-3">
          <p className="room-tiny mb-3">Room Type</p>
          <div className="grid gap-2 font-mono text-xs uppercase text-mutedText">
            {["Warehouse", "Basement club", "Open air"].map((room) => {
              const checked = roomTypeFilters.includes(room);
              return (
                <button
                  className={cx(
                    "flex items-center gap-3 border px-3 py-2 text-left transition",
                    checked ? "border-acidGreen bg-[#121d05] text-acidGreen" : "border-roomBorder bg-panelBlack hover:border-paperWhite"
                  )}
                  key={room}
                  onClick={() => onRoomTypeToggle(room)}
                  type="button"
                >
                  <span className={cx("grid h-4 w-4 place-items-center border", checked ? "border-acidGreen bg-acidGreen text-black" : "border-strongBorder")}>
                    {checked ? <span className="h-1.5 w-1.5 bg-black" /> : null}
                  </span>
                  {room}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border border-roomBorder bg-black p-3">
          <p className="room-tiny mb-3">Location</p>
          <button
            className="flex w-full items-center justify-between border border-roomBorder px-3 py-4 text-left font-mono text-xs uppercase text-paperWhite hover:border-paperWhite"
            onClick={() => onLocationFilterChange(locationFilter === "All" ? "Berlin" : "All")}
            type="button"
          >
            {locationFilter === "All" ? "Global" : locationFilter}
            <span className="text-mutedText">+</span>
          </button>
          <Button className="mt-3 w-full justify-center" onClick={onReset} size="sm" type="button" variant="ghost">
            Reset Sound Filters
          </Button>
        </div>
      </div>
    </div>
  );
}

function ActiveTag({ label, onClear }: { label: string; onClear?: () => void }) {
  return (
    <button
      className="inline-flex items-center gap-2 border border-roomBorder px-3 py-2 font-mono text-[10px] uppercase text-mutedText hover:border-paperWhite hover:text-paperWhite"
      type="button"
      onClick={onClear}
    >
      {label}
      <span className="text-sm leading-none">x</span>
    </button>
  );
}

function MiniWaveform({ active, seed }: { active: boolean; seed: string }) {
  return <Room9Waveform active={active} barCount={64} progressRatio={active ? 0.32 : null} seed={seed} selectedRatio={0.56} />;
}

function soundMatchesRoomType(work: Work, dj: DjProfile | null, roomType: string) {
  const text = [work.genre, work.description, dj?.genres, dj?.profile_theme, dj?.city, dj?.country]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const normalizedRoom = roomType.toLowerCase();

  if (normalizedRoom.includes("warehouse")) {
    return /industrial|hard|warehouse|rave|techno|peak/.test(text);
  }

  if (normalizedRoom.includes("basement")) {
    return /hypnotic|deep|basement|acid|groove|techno/.test(text);
  }

  if (normalizedRoom.includes("open")) {
    return /open|air|house|melodic|festival|live/.test(text);
  }

  return true;
}

function hasActiveFilters(
  query: string,
  genre: string,
  location: string,
  bpm: string,
  fee: string,
  availability: string,
  liveReadyOnly = false,
  verifiedOnly = false
) {
  return (
    Boolean(query.trim()) ||
    genre !== "All" ||
    location !== "All" ||
    bpm !== "All" ||
    fee !== "Any" ||
    availability !== "All" ||
    liveReadyOnly ||
    verifiedOnly
  );
}

function feeMatches(price: number | null, fee: string) {
  if (fee === "Any") {
    return true;
  }

  const value = Number(price) || 0;
  if (fee === "Under 500") {
    return value > 0 && value < 500;
  }

  if (fee === "500-1000") {
    return value >= 500 && value <= 1000;
  }

  return value > 1000;
}

function isVerifiedDj(dj: DjProfile) {
  return Boolean(dj.stage_name && dj.genres && (dj.avatar_url || dj.cover_image_url));
}
