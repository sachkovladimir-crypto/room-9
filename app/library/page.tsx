"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { type AudioPlayerTrack, useAudioPlayer } from "@/components/GlobalAudioPlayer";
import { ExternalGlyph, HeartGlyph, PlaylistGlyph, PlayGlyph, QueueGlyph } from "@/components/room9-icons";
import {
  Button,
  ButtonLink,
  Input,
  Panel,
  Select,
  StatusBadge,
  Textarea,
  cx
} from "@/components/room9-ui";
import { demoWorks, getDemoDjLookup } from "@/lib/demoContent";
import { cssImageUrl, getDjAvatarUrl, getWorkCoverUrl } from "@/lib/media";
import {
  VAULT_FAVORITES_EVENT,
  VAULT_MOMENTS_EVENT,
  VAULT_PLAYLISTS_EVENT,
  createVaultPlaylist,
  deleteVaultPlaylist,
  moveVaultTrackInPlaylist,
  readVaultListeningHistoryIds,
  readVaultPlaylists,
  readVaultSavedMoments,
  readVaultSavedTrackIds,
  removeVaultSavedMoment,
  toggleVaultSavedTrackId,
  toggleVaultTrackInPlaylist,
  updateVaultPlaylist,
  type VaultPlaylist,
  type VaultSavedMoment
} from "@/lib/soundVault";
import {
  formatSupabaseError,
  getSupabase,
  hasSupabaseConfig,
  isMissingAuthSession,
  isRoom9DemoMode,
  logSupabaseError
} from "@/lib/supabase";
import { loadRoleAccess } from "@/lib/roleAccess";
import {
  buildSignalRecommendationGroups,
  buildSignalIntentFromArchive,
  formatSignalScore,
  getUserSoundProfileSummary,
  rankTracksBySignal
} from "@/lib/signalEngine";
import { buildUserSoundProfileModel, userSoundProfileToSignalIntent } from "@/lib/userSoundProfile";
import { persistUserSoundProfile } from "@/lib/userSoundProfileStore";
import { hasRoleAccess, type DjProfile, type Profile, type Release, type ReleaseType, type Role, type Work } from "@/lib/types";

type VaultTab =
  | "saved-tracks"
  | "saved-moments"
  | "playlists"
  | "uploads"
  | "followed-djs"
  | "queue"
  | "history"
  | "booking-ready";

type VaultMode = "overview" | "tracks" | "briefs" | "playlists" | "uploads" | "network";

type UploadForm = {
  bpm: string;
  description: string;
  genre: string;
  key: string;
  releaseType: "track" | "single" | "set";
  title: string;
  visibility: "public" | "private";
};

type EditForm = UploadForm & {
  coverImage: string;
};

type ReleaseForm = {
  coverImage: string;
  description: string;
  releaseType: ReleaseType;
  title: string;
  visibility: "public" | "private";
};

const emptyUploadForm: UploadForm = {
  bpm: "",
  description: "",
  genre: "",
  key: "",
  releaseType: "track",
  title: "",
  visibility: "public"
};

const emptyReleaseForm: ReleaseForm = {
  coverImage: "",
  description: "",
  releaseType: "ep",
  title: "",
  visibility: "public"
};

const vaultModes: Array<{ id: VaultMode; href: string; label: string; tab: VaultTab; note: string }> = [
  { id: "overview", href: "/library", label: "Overview", tab: "saved-moments", note: "signals + next action" },
  { id: "tracks", href: "/library/tracks", label: "Tracks", tab: "saved-tracks", note: "liked + history" },
  { id: "briefs", href: "/library/moments", label: "Briefs", tab: "saved-moments", note: "moments + bookings" },
  { id: "playlists", href: "/library/playlists", label: "Playlists", tab: "playlists", note: "CRUD + order" },
  { id: "uploads", href: "/library/uploads", label: "Uploads", tab: "uploads", note: "DJ releases" },
  { id: "network", href: "/library/network", label: "Network", tab: "followed-djs", note: "artists" }
];

export default function LibraryPage({ initialMode }: { initialMode?: VaultMode } = {}) {
  const [scope, setScope] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeRoles, setActiveRoles] = useState<Role[]>(["listener"]);
  const [djProfile, setDjProfile] = useState<DjProfile | null>(null);
  const [activeTab, setActiveTab] = useState<VaultTab>(getVaultTabForMode(initialMode ?? "overview"));
  const [activeMode, setActiveMode] = useState<VaultMode>(initialMode ?? "overview");
  const [hiddenModules, setHiddenModules] = useState<Record<string, boolean>>({});
  const [bootProgress, setBootProgress] = useState(0);
  const [bootComplete, setBootComplete] = useState(false);
  const [query, setQuery] = useState("");
  const [playlistName, setPlaylistName] = useState("");
  const [playlistEditName, setPlaylistEditName] = useState("");
  const [playlistCoverImage, setPlaylistCoverImage] = useState("");
  const [playlistCoverFile, setPlaylistCoverFile] = useState<File | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [historyIds, setHistoryIds] = useState<string[]>([]);
  const [playlists, setPlaylists] = useState<VaultPlaylist[]>([]);
  const [savedMoments, setSavedMoments] = useState<VaultSavedMoment[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [releaseTracks, setReleaseTracks] = useState<Record<string, string[]>>({});
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [releaseForm, setReleaseForm] = useState<ReleaseForm>(emptyReleaseForm);
  const [releaseCoverFile, setReleaseCoverFile] = useState<File | null>(null);
  const [djLookup, setDjLookup] = useState<Record<string, DjProfile>>({});
  const [uploadForm, setUploadForm] = useState<UploadForm>(emptyUploadForm);
  const [trackFile, setTrackFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isPlaylistSaving, setIsPlaylistSaving] = useState(false);
  const [isReleaseSaving, setIsReleaseSaving] = useState(false);
  const [isTrackSaving, setIsTrackSaving] = useState(false);
  const {
    addToQueue,
    currentIndex,
    currentTrack,
    playNext,
    playPrevious,
    playQueue,
    queue,
    repeatOne,
    seekTo,
    setSelectedTimestamp,
    toggleRepeatOne
  } = useAudioPlayer();

  useEffect(() => {
    const mode = normalizeVaultMode(new URLSearchParams(window.location.search).get("view"));
    if (mode) {
      selectVaultMode(mode);
      return;
    }

    if (initialMode) {
      selectVaultMode(initialMode);
    }
  }, [initialMode]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setBootProgress((current) => {
        if (current >= 100) {
          window.clearInterval(timer);
          window.setTimeout(() => setBootComplete(true), 180);
          return 100;
        }

        return Math.min(100, current + 4);
      });
    }, 22);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function handleFavoritesChange(event: Event) {
      const detail = (event as CustomEvent<{ scope?: string | null; trackIds?: string[] }>).detail;
      if (scope && detail?.scope && detail.scope !== scope) {
        return;
      }
      if (Array.isArray(detail?.trackIds)) {
        setFavoriteIds(detail.trackIds);
      }
    }

    function handlePlaylistsChange(event: Event) {
      const detail = (event as CustomEvent<{ playlists?: VaultPlaylist[]; scope?: string | null }>).detail;
      if (scope && detail?.scope && detail.scope !== scope) {
        return;
      }
      if (Array.isArray(detail?.playlists)) {
        setPlaylists(detail.playlists);
        setSelectedPlaylistId((current) => {
          if (current && detail.playlists?.some((playlist) => playlist.id === current)) {
            return current;
          }

          return detail.playlists?.[0]?.id ?? null;
        });
      }
    }

    function handleMomentsChange(event: Event) {
      const detail = (event as CustomEvent<{ moments?: VaultSavedMoment[]; scope?: string | null }>).detail;
      if (scope && detail?.scope && detail.scope !== scope) {
        return;
      }
      if (Array.isArray(detail?.moments)) {
        setSavedMoments(detail.moments);
      }
    }

    window.addEventListener(VAULT_FAVORITES_EVENT, handleFavoritesChange);
    window.addEventListener(VAULT_PLAYLISTS_EVENT, handlePlaylistsChange);
    window.addEventListener(VAULT_MOMENTS_EVENT, handleMomentsChange);
    return () => {
      window.removeEventListener(VAULT_FAVORITES_EVENT, handleFavoritesChange);
      window.removeEventListener(VAULT_PLAYLISTS_EVENT, handlePlaylistsChange);
      window.removeEventListener(VAULT_MOMENTS_EVENT, handleMomentsChange);
    };
  }, [scope]);

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      Promise.all([
        readVaultSavedTrackIds(),
        readVaultListeningHistoryIds(),
        readVaultPlaylists(),
        readVaultSavedMoments()
      ])
        .then(([favorites, history, nextPlaylists, moments]) => {
          setFavoriteIds(favorites);
          setHistoryIds(history);
          setPlaylists(nextPlaylists);
          setSavedMoments(moments);
          setSelectedPlaylistId(nextPlaylists[0]?.id ?? null);
          const ids = collectVaultWorkIds(favorites, history, nextPlaylists, moments);
          setWorks(demoWorks.filter((work) => ids.includes(work.id)));
          setDjLookup(getDemoDjLookup());
        })
        .finally(() => setIsLoading(false));
      return;
    }

    async function loadVault() {
      setIsLoading(true);
      setError("");

      try {
        const supabase = getSupabase();
        const { data: userData, error: userError } = await supabase.auth.getSession();
        if (userError && !isMissingAuthSession(userError)) {
          logSupabaseError("Sound Vault user scope failed", userError);
        }

        const nextScope = userData.session?.user?.id ?? null;
        setScope(nextScope);

        let loadedProfile: Profile | null = null;
        let loadedDjProfile: DjProfile | null = null;
        let ownWorks: Work[] = [];
        let loadedRoles: Role[] = ["listener"];

        if (nextScope) {
          const { data: profileData, error: profileError } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", nextScope)
            .maybeSingle();

          if (profileError) {
            logSupabaseError("Sound Vault profile lookup failed", profileError);
          } else {
            loadedProfile = (profileData as Profile | null) ?? null;
            setProfile(loadedProfile);
            if (loadedProfile) {
              loadedRoles = await loadRoleAccess(supabase, loadedProfile.id, loadedProfile.role);
              setActiveRoles(loadedRoles);
            }
          }

          if (loadedProfile && hasRoleAccess(loadedRoles, ["dj"])) {
            const { data: djData, error: djError } = await supabase
              .from("dj_profiles")
              .select("*")
              .eq("user_id", loadedProfile.id)
              .maybeSingle();

            if (djError) {
              logSupabaseError("Sound Vault DJ profile lookup failed", djError);
            } else {
              loadedDjProfile = (djData as DjProfile | null) ?? null;
              setDjProfile(loadedDjProfile);
            }

            if (loadedDjProfile) {
              const { data: ownWorkData, error: ownWorkError } = await supabase
                .from("works")
                .select("*")
                .eq("dj_id", loadedDjProfile.id)
                .order("created_at", { ascending: false })
                .limit(120);

              if (ownWorkError) {
                logSupabaseError("Sound Vault DJ works lookup failed", ownWorkError);
              } else {
                ownWorks = ((ownWorkData as Work[]) ?? []).filter((work) => !work.is_deleted);
              }

              const { data: releaseData, error: releaseError } = await supabase
                .from("releases")
                .select("*")
                .eq("dj_id", loadedDjProfile.id)
                .order("created_at", { ascending: false })
                .limit(60);

              if (releaseError) {
                logSupabaseError("Sound Vault releases lookup failed", releaseError);
                setReleases([]);
                setReleaseTracks({});
              } else {
                const loadedReleases = ((releaseData as Release[]) ?? []);
                setReleases(loadedReleases);
                setSelectedReleaseId((current) =>
                  current && loadedReleases.some((release) => release.id === current)
                    ? current
                    : loadedReleases[0]?.id ?? null
                );

                const releaseIds = loadedReleases.map((release) => release.id);
                if (releaseIds.length > 0) {
                  const { data: releaseTrackData, error: releaseTrackError } = await supabase
                    .from("release_tracks")
                    .select("release_id, work_id, position")
                    .in("release_id", releaseIds)
                    .order("position", { ascending: true })
                    .limit(500);

                  if (releaseTrackError) {
                    logSupabaseError("Sound Vault release tracks lookup failed", releaseTrackError);
                    setReleaseTracks({});
                  } else {
                    setReleaseTracks(mapReleaseTracks(releaseTrackData as Array<{ release_id: string; work_id: string }> | null));
                  }
                } else {
                  setReleaseTracks({});
                }
              }
            }
          }
        } else {
          setActiveRoles(["listener"]);
          setReleases([]);
          setReleaseTracks({});
          setSelectedReleaseId(null);
        }

        const [nextFavorites, nextHistory, nextPlaylists, nextMoments] = await Promise.all([
          readVaultSavedTrackIds(nextScope),
          readVaultListeningHistoryIds(nextScope),
          readVaultPlaylists(nextScope),
          readVaultSavedMoments(nextScope)
        ]);
        setFavoriteIds(nextFavorites);
        setHistoryIds(nextHistory);
        setPlaylists(nextPlaylists);
        setSavedMoments(nextMoments);
        setSelectedPlaylistId(nextPlaylists[0]?.id ?? null);

        const ids = collectVaultWorkIds(nextFavorites, nextHistory, nextPlaylists, nextMoments);
        const demoLoadedWorks = isRoom9DemoMode() ? demoWorks.filter((work) => ids.includes(work.id)) : [];
        const supabaseIds = ids.filter(isUuidLike).slice(0, 160);

        let loadedWorks = demoLoadedWorks;
        if (supabaseIds.length > 0) {
          const { data: workData, error: workError } = await supabase
            .from("works")
            .select("*")
            .in("id", supabaseIds);

          if (workError) {
            logSupabaseError("Sound Vault works load failed", workError);
            setError(formatSupabaseError(workError, "Could not load saved music."));
            setWorks(demoLoadedWorks);
            setDjLookup(isRoom9DemoMode() ? getDemoDjLookup() : {});
            return;
          }

          loadedWorks = [
            ...((workData as Work[]) ?? []).filter((work) => !work.is_deleted),
            ...demoLoadedWorks
          ];
        }

        loadedWorks = mergeWorks([...ownWorks, ...loadedWorks]);
        setWorks(loadedWorks);

        const djIds = Array.from(new Set(loadedWorks.map((work) => work.dj_id).filter(Boolean)));
        const realDjIds = djIds.filter(isUuidLike).slice(0, 80);
        const nextDjLookup = isRoom9DemoMode() ? getDemoDjLookup() : {};
        if (loadedDjProfile) {
          nextDjLookup[loadedDjProfile.id] = loadedDjProfile;
        }

        if (realDjIds.length === 0) {
          setDjLookup(nextDjLookup);
          return;
        }

        const { data: djData, error: djError } = await supabase
          .from("dj_profiles")
          .select("*")
          .in("id", realDjIds);

        if (djError) {
          logSupabaseError("Sound Vault DJ lookup failed", djError);
          setDjLookup(nextDjLookup);
          return;
        }

        setDjLookup(
          ((djData as DjProfile[]) ?? []).reduce<Record<string, DjProfile>>((acc, dj) => {
            acc[dj.id] = dj;
            return acc;
          }, nextDjLookup)
        );
      } catch (caughtError) {
        logSupabaseError("Sound Vault unexpected load failure", caughtError);
        setError(formatSupabaseError(caughtError, "Could not load Sound Vault."));
      } finally {
        setIsLoading(false);
      }
    }

    loadVault();
  }, []);

  const selectedPlaylist = playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? playlists[0] ?? null;
  const selectedRelease = releases.find((release) => release.id === selectedReleaseId) ?? releases[0] ?? null;
  const uploadedWorks = useMemo(
    () => (djProfile ? works.filter((work) => work.dj_id === djProfile.id) : []),
    [djProfile, works]
  );

  const bookingReadyMoments = useMemo(
    () => savedMoments.filter((moment) => moment.status !== "in-case-file"),
    [savedMoments]
  );

  const filteredWorks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const byId = new Map(works.map((work) => [work.id, work]));
    let ids: string[] = [];

    if (activeTab === "saved-tracks") {
      ids = favoriteIds;
    } else if (activeTab === "uploads") {
      ids = uploadedWorks.map((work) => work.id);
    } else if (activeTab === "history") {
      ids = historyIds;
    } else if (activeTab === "queue") {
      ids = queue.map((track) => track.id);
    } else if (activeTab === "playlists") {
      ids = selectedPlaylistId
        ? playlists.find((playlist) => playlist.id === selectedPlaylistId)?.trackIds ?? []
        : playlists[0]?.trackIds ?? [];
    } else if (activeTab === "booking-ready") {
      ids = bookingReadyMoments.map((moment) => moment.trackId);
    } else if (activeTab === "followed-djs") {
      ids = works.map((work) => work.id);
    } else {
      ids = [
        ...favoriteIds,
        ...historyIds,
        ...queue.map((track) => track.id),
        ...uploadedWorks.map((work) => work.id),
        ...playlists.flatMap((playlist) => playlist.trackIds),
        ...savedMoments.map((moment) => moment.trackId)
      ];
    }

    return Array.from(new Set(ids))
      .map((id) => byId.get(id))
      .filter((work): work is Work => Boolean(work))
      .filter((work) => {
        if (!normalized) {
          return true;
        }

        const dj = djLookup[work.dj_id];
        return [work.title, work.genre, work.bpm, dj?.stage_name, dj?.city]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      });
  }, [activeTab, bookingReadyMoments, djLookup, favoriteIds, historyIds, playlists, query, queue, savedMoments, selectedPlaylistId, uploadedWorks, works]);

  const filteredMoments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const sourceMoments = activeTab === "booking-ready" ? bookingReadyMoments : savedMoments;
    return sourceMoments.filter((moment) => {
      if (!normalized) {
        return true;
      }

      return [moment.trackTitle, moment.artist, moment.momentLabel, moment.roomType, moment.bpm]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [activeTab, bookingReadyMoments, query, savedMoments]);

  const followedDjs = useMemo(() => {
    const djIds = Array.from(new Set(works.map((work) => work.dj_id).filter(Boolean)));
    return djIds.map((id) => djLookup[id]).filter((dj): dj is DjProfile => Boolean(dj));
  }, [djLookup, works]);

  const archiveSignalIntent = useMemo(
    () =>
      buildSignalIntentFromArchive({
        playlists,
        savedMoments,
        savedTrackIds: favoriteIds,
        works
      }),
    [favoriteIds, playlists, savedMoments, works]
  );
  const soundProfileModel = useMemo(
    () =>
      buildUserSoundProfileModel({
        playlists,
        savedMoments,
        savedTrackIds: favoriteIds,
        works
      }),
    [favoriteIds, playlists, savedMoments, works]
  );
  const soundProfileTags = useMemo(() => {
    const seen = new Set<string>();
    return [
      ...(soundProfileModel.preferred_genres ?? []),
      ...(soundProfileModel.preferred_room_types ?? []),
      ...(soundProfileModel.top_dna_tags ?? [])
    ]
      .map((tag) => tag.trim())
      .filter((tag) => {
        if (!tag) {
          return false;
        }

        const normalizedTag = tag.toLowerCase();
        if (seen.has(normalizedTag)) {
          return false;
        }

        seen.add(normalizedTag);
        return true;
      })
      .slice(0, 8);
  }, [soundProfileModel.preferred_genres, soundProfileModel.preferred_room_types, soundProfileModel.top_dna_tags]);
  const signalIntent = useMemo(
    () => userSoundProfileToSignalIntent(soundProfileModel, archiveSignalIntent),
    [archiveSignalIntent, soundProfileModel]
  );
  const soundProfile = useMemo(
    () =>
      getUserSoundProfileSummary({
        savedMoments,
        savedTrackIds: favoriteIds,
        works
      }),
    [favoriteIds, savedMoments, works]
  );
  const rankedSignalTracks = useMemo(
    () => rankTracksBySignal({ djLookup, intent: signalIntent, works }),
    [djLookup, signalIntent, works]
  );
  const signalIndex = useMemo(() => rankedSignalTracks.slice(0, 4), [rankedSignalTracks]);
  const recommendationGroups = useMemo(
    () =>
      buildSignalRecommendationGroups({
        rankedTracks: rankedSignalTracks,
        savedMoments,
        savedTrackIds: favoriteIds
      }),
    [favoriteIds, rankedSignalTracks, savedMoments]
  );

  useEffect(() => {
    if (!bootComplete || !scope) {
      return;
    }
    void persistUserSoundProfile(soundProfileModel, scope);
  }, [bootComplete, scope, soundProfileModel]);

  const visibleQueue = useMemo(() => buildPlayerQueue(filteredWorks, djLookup), [djLookup, filteredWorks]);
  const nextQueueTrack = queue.length > 0 ? queue[(currentIndex + 1) % queue.length] : null;
  const activeModeConfig = vaultModes.find((mode) => mode.id === activeMode) ?? vaultModes[0];
  const activeTabLabel = activeModeConfig.label;

  function selectVaultMode(mode: VaultMode) {
    const config = vaultModes.find((item) => item.id === mode);
    setActiveMode(mode);
    if (config) {
      setActiveTab(config.tab);
    }
  }

  function toggleVaultModule(moduleId: string) {
    setHiddenModules((current) => ({ ...current, [moduleId]: !current[moduleId] }));
  }

  function canShowVaultModule(moduleId: string, modes: VaultMode[]) {
    return !hiddenModules[moduleId] && (activeMode === "overview" || modes.includes(activeMode));
  }

  function playWork(work: Work) {
    if (!work.link) {
      return;
    }

    const playable = buildPlayerQueue(filteredWorks, djLookup);

    const startIndex = playable.findIndex((track) => track.id === work.id);
    playQueue(playable, startIndex >= 0 ? startIndex : 0);
  }

  function playVisibleQueue() {
    if (visibleQueue.length === 0) {
      return;
    }

    playQueue(visibleQueue);
  }

  function playMoment(moment: VaultSavedMoment) {
    const work = works.find((item) => item.id === moment.trackId);
    if (work) {
      playWork(work);
      window.setTimeout(() => {
        seekTo(moment.timestamp);
        setSelectedTimestamp(moment.timestamp);
      }, 140);
    }
  }

  async function deleteMoment(momentId: string) {
    const next = await removeVaultSavedMoment(momentId, scope);
    setSavedMoments(next);
    setNotice("Saved reference removed from this account.");
  }

  async function toggleFavoriteTrack(trackId: string) {
    const next = await toggleVaultSavedTrackId(trackId, scope);
    setFavoriteIds(next);
    setNotice(next.includes(trackId) ? "Track added to liked tracks." : "Track removed from liked tracks.");
  }

  function queueWork(work: Work) {
    const track = buildPlayerQueue([work], djLookup)[0];
    if (!track) {
      setError("This track has no playable audio URL.");
      return;
    }

    addToQueue(track);
    setNotice("Track added to queue.");
  }

  async function createPlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = await createVaultPlaylist(playlistName || "New playlist", scope);
    setPlaylists(next);
    setSelectedPlaylistId(next[0]?.id ?? null);
    setPlaylistName("");
    setNotice("Playlist created in your personal Sound Vault.");
  }

  async function toggleTrackInSelectedPlaylist(trackId: string) {
    if (!selectedPlaylist) {
      const next = await createVaultPlaylist("Room selection", scope);
      const created = next[0];
      if (!created) {
        setPlaylists(next);
        return;
      }
      setSelectedPlaylistId(created.id);
      setPlaylists(await toggleVaultTrackInPlaylist(created.id, trackId, scope));
      setNotice("Playlist created and track added.");
      return;
    }

    setPlaylists(await toggleVaultTrackInPlaylist(selectedPlaylist.id, trackId, scope));
    setNotice("Playlist updated.");
  }

  async function deletePlaylist(playlistId: string) {
    const playlist = playlists.find((item) => item.id === playlistId);
    if (!window.confirm(`Delete "${playlist?.name || "this playlist"}"? Tracks stay in your vault.`)) {
      return;
    }

    const next = await deleteVaultPlaylist(playlistId, scope);
    setPlaylists(next);
    setSelectedPlaylistId((current) => (current === playlistId ? next[0]?.id ?? null : current));
    setNotice("Playlist deleted.");
  }

  async function savePlaylistDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPlaylist) {
      return;
    }

    const allowedImages = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (playlistCoverFile?.type && !allowedImages.includes(playlistCoverFile.type)) {
      setError("Upload a JPG, PNG, WEBP, or GIF playlist cover.");
      return;
    }

    setIsPlaylistSaving(true);
    setError("");
    setNotice("");

    try {
      let coverImage = playlistCoverImage || selectedPlaylist.coverImage || null;
      if (playlistCoverFile) {
        if (!scope) {
          setError("Log in before uploading playlist covers.");
          return;
        }

        coverImage = await uploadImageFile(playlistCoverFile, `${scope}/playlist-${selectedPlaylist.id}`);
      }

      const next = await updateVaultPlaylist(
        selectedPlaylist.id,
        {
          coverImage,
          name: playlistEditName || selectedPlaylist.name
        },
        scope
      );
      setPlaylists(next);
      setSelectedPlaylistId(selectedPlaylist.id);
      setPlaylistCoverFile(null);
      setPlaylistCoverImage(coverImage ?? "");
      setNotice("Playlist details saved.");
    } catch (caughtError) {
      logSupabaseError("Sound Vault playlist details failed", caughtError);
      setError(formatSupabaseError(caughtError, "Could not save playlist details."));
    } finally {
      setIsPlaylistSaving(false);
    }
  }

  async function movePlaylistTrack(trackId: string, direction: "up" | "down") {
    if (!selectedPlaylist) {
      return;
    }

    setPlaylists(await moveVaultTrackInPlaylist(selectedPlaylist.id, trackId, direction, scope));
  }

  async function uploadTrack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !djProfile) {
      setError("Unlock DJ tools in Settings before uploading tracks.");
      return;
    }

    if (!uploadForm.title.trim()) {
      setError("Track title is required.");
      return;
    }

    if (!trackFile) {
      setError("Choose an MP3 or WAV file before uploading.");
      return;
    }

    const allowedAudio = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"];
    if (trackFile.type && !allowedAudio.includes(trackFile.type)) {
      setError("Upload an MP3 or WAV file.");
      return;
    }

    const allowedImages = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (coverFile?.type && !allowedImages.includes(coverFile.type)) {
      setError("Upload a JPG, PNG, WEBP, or GIF cover image.");
      return;
    }

    setIsUploading(true);
    setError("");
    setNotice("");

    try {
      const cleanName = trackFile.name.replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
      const trackPath = `${profile.id}/${Date.now()}-${cleanName}`;
      const { error: uploadError } = await getSupabase().storage.from("tracks").upload(trackPath, trackFile, {
        cacheControl: "3600",
        upsert: false
      });

      if (uploadError) {
        logSupabaseError("Sound Vault track upload failed", uploadError);
        setError(formatSupabaseError(uploadError, 'Upload failed. Create a public "tracks" bucket and retry.'));
        return;
      }

      const coverUrl = coverFile ? await uploadImageFile(coverFile, `${profile.id}/track-cover`) : null;
      const audioUrl = getSupabase().storage.from("tracks").getPublicUrl(trackPath).data.publicUrl;
      const { data, error: insertError } = await getSupabase()
        .from("works")
        .insert({
          bpm: uploadForm.bpm,
          cover_image: coverUrl,
          description: uploadForm.description,
          dj_id: djProfile.id,
          genre: uploadForm.genre,
          is_deleted: false,
          key: uploadForm.key,
          like_count: 0,
          link: audioUrl,
          play_count: 0,
          title: uploadForm.title,
          type: uploadForm.releaseType,
          visibility: uploadForm.visibility
        })
        .select("*")
        .single();

      if (insertError) {
        logSupabaseError("Sound Vault work insert failed", insertError);
        setError(formatSupabaseError(insertError, "Track uploaded, but metadata could not save."));
        return;
      }

      setWorks((current) => mergeWorks([data as Work, ...current]));
      setUploadForm(emptyUploadForm);
      setTrackFile(null);
      setCoverFile(null);
      setActiveTab("saved-moments");
      setNotice("Track uploaded and added to Sound Vault.");
    } catch (caughtError) {
      logSupabaseError("Sound Vault upload unexpected failure", caughtError);
      setError(formatSupabaseError(caughtError, "Upload failed."));
    } finally {
      setIsUploading(false);
    }
  }

  function beginEditTrack(work: Work) {
    setEditingWorkId(work.id);
    setEditForm({
      bpm: work.bpm ?? "",
      coverImage: work.cover_image ?? "",
      description: work.description ?? "",
      genre: work.genre ?? "",
      key: work.key ?? "",
      releaseType: (["track", "single", "set"].includes(work.type ?? "") ? work.type : "track") as UploadForm["releaseType"],
      title: work.title ?? "",
      visibility: work.visibility ?? "public"
    });
    setEditCoverFile(null);
  }

  async function saveTrackEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingWorkId || !editForm) {
      return;
    }

    const work = works.find((item) => item.id === editingWorkId);
    if (!work) {
      return;
    }

    if (!editForm.title.trim()) {
      setError("Track title is required.");
      return;
    }

    setIsTrackSaving(true);
    setError("");
    setNotice("");

    try {
      let coverImage = editForm.coverImage || null;
      if (editCoverFile) {
        if (editCoverFile.type && !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(editCoverFile.type)) {
          setError("Upload a JPG, PNG, WEBP, or GIF cover image.");
          return;
        }
        coverImage = await uploadImageFile(editCoverFile, `${scope ?? "local"}/track-cover-${editingWorkId}`);
      }

      const { data, error: updateError } = await getSupabase()
        .from("works")
        .update({
          bpm: editForm.bpm,
          cover_image: coverImage,
          description: editForm.description,
          genre: editForm.genre,
          key: editForm.key,
          type: editForm.releaseType,
          title: editForm.title,
          visibility: editForm.visibility
        })
        .eq("id", work.id)
        .eq("dj_id", work.dj_id)
        .select("*")
        .single();

      if (updateError) {
        logSupabaseError("Sound Vault track update failed", updateError);
        setError(formatSupabaseError(updateError, "Could not save track metadata."));
        return;
      }

      setWorks((current) => current.map((item) => (item.id === work.id ? (data as Work) : item)));
      setEditingWorkId(null);
      setEditForm(null);
      setEditCoverFile(null);
      setNotice("Track metadata saved.");
    } catch (caughtError) {
      logSupabaseError("Sound Vault track edit unexpected failure", caughtError);
      setError(formatSupabaseError(caughtError, "Could not save track metadata."));
    } finally {
      setIsTrackSaving(false);
    }
  }

  async function archiveTrack(work: Work) {
    if (!window.confirm(`Remove "${work.title || "this track"}" from your Sound Vault?`)) {
      return;
    }

    const { error: updateError } = await getSupabase()
      .from("works")
      .update({ is_deleted: true, visibility: "private" })
      .eq("id", work.id)
      .eq("dj_id", work.dj_id);

    if (updateError) {
      logSupabaseError("Sound Vault track archive failed", updateError);
      setError(formatSupabaseError(updateError, "Could not remove track."));
      return;
    }

    setWorks((current) => current.filter((item) => item.id !== work.id));
    setNotice("Track removed from public and private views.");
  }

  async function reloadReleases(djId: string, selectedId?: string | null) {
    const { data: releaseData, error: releaseError } = await getSupabase()
      .from("releases")
      .select("*")
      .eq("dj_id", djId)
      .order("created_at", { ascending: false });

    if (releaseError) {
      logSupabaseError("Sound Vault releases reload failed", releaseError);
      setError(formatSupabaseError(releaseError, "Could not reload releases."));
      return;
    }

    const nextReleases = ((releaseData as Release[]) ?? []);
    setReleases(nextReleases);
    setSelectedReleaseId(
      selectedId && nextReleases.some((release) => release.id === selectedId)
        ? selectedId
        : nextReleases[0]?.id ?? null
    );

    const releaseIds = nextReleases.map((release) => release.id);
    if (releaseIds.length === 0) {
      setReleaseTracks({});
      return;
    }

    const { data: releaseTrackData, error: releaseTrackError } = await getSupabase()
      .from("release_tracks")
      .select("release_id, work_id, position")
      .in("release_id", releaseIds)
      .order("position", { ascending: true });

    if (releaseTrackError) {
      logSupabaseError("Sound Vault release tracks reload failed", releaseTrackError);
      setReleaseTracks({});
      return;
    }

    setReleaseTracks(mapReleaseTracks(releaseTrackData as Array<{ release_id: string; work_id: string }> | null));
  }

  async function createRelease(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !djProfile) {
      setError("Unlock DJ tools in Settings before creating releases.");
      return;
    }

    if (!releaseForm.title.trim()) {
      setError("Release title is required.");
      return;
    }

    if (releaseCoverFile?.type && !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(releaseCoverFile.type)) {
      setError("Upload a JPG, PNG, WEBP, or GIF release cover.");
      return;
    }

    setIsReleaseSaving(true);
    setError("");
    setNotice("");

    try {
      const coverImage = releaseCoverFile
        ? await uploadImageFile(releaseCoverFile, `${profile.id}/release-cover`)
        : releaseForm.coverImage || null;

      const { data, error: insertError } = await getSupabase()
        .from("releases")
        .insert({
          cover_image: coverImage,
          description: releaseForm.description,
          dj_id: djProfile.id,
          release_type: releaseForm.releaseType,
          title: releaseForm.title.trim(),
          visibility: releaseForm.visibility
        })
        .select("*")
        .single();

      if (insertError) {
        logSupabaseError("Sound Vault release create failed", insertError);
        setError(formatSupabaseError(insertError, "Could not create release. Run the latest schema.sql if the releases table is missing."));
        return;
      }

      const created = data as Release;
      setReleaseForm(emptyReleaseForm);
      setReleaseCoverFile(null);
      await reloadReleases(djProfile.id, created.id);
      setNotice(`${created.release_type.toUpperCase()} release created. Add tracks below.`);
    } catch (caughtError) {
      logSupabaseError("Sound Vault release create crashed", caughtError);
      setError(formatSupabaseError(caughtError, "Could not create release."));
    } finally {
      setIsReleaseSaving(false);
    }
  }

  async function deleteRelease(release: Release) {
    if (!djProfile) {
      return;
    }

    if (!window.confirm(`Delete release "${release.title}"? Tracks stay uploaded.`)) {
      return;
    }

    const { error: deleteError } = await getSupabase()
      .from("releases")
      .delete()
      .eq("id", release.id)
      .eq("dj_id", djProfile.id);

    if (deleteError) {
      logSupabaseError("Sound Vault release delete failed", deleteError);
      setError(formatSupabaseError(deleteError, "Could not delete release."));
      return;
    }

    await reloadReleases(djProfile.id);
    setNotice("Release deleted. Tracks remain in your uploads.");
  }

  async function toggleTrackInSelectedRelease(trackId: string) {
    if (!djProfile || !selectedRelease) {
      return;
    }

    const currentTrackIds = releaseTracks[selectedRelease.id] ?? [];
    const alreadyInRelease = currentTrackIds.includes(trackId);
    if (alreadyInRelease) {
      const { error: deleteError } = await getSupabase()
        .from("release_tracks")
        .delete()
        .eq("release_id", selectedRelease.id)
        .eq("work_id", trackId);

      if (deleteError) {
        logSupabaseError("Sound Vault release track delete failed", deleteError);
        setError(formatSupabaseError(deleteError, "Could not remove track from release."));
        return;
      }
    } else {
      const { error: insertError } = await getSupabase()
        .from("release_tracks")
        .insert({ release_id: selectedRelease.id, work_id: trackId, position: currentTrackIds.length });

      if (insertError) {
        logSupabaseError("Sound Vault release track insert failed", insertError);
        setError(formatSupabaseError(insertError, "Could not add track to release."));
        return;
      }
    }

    await reloadReleases(djProfile.id, selectedRelease.id);
    setNotice(alreadyInRelease ? "Track removed from release." : "Track added to release.");
  }

  async function uploadImageFile(file: File, prefix: string) {
    const cleanCoverName = file.name.replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
    const coverPath = `${prefix}-${Date.now()}-${cleanCoverName}`;
    const { error: coverError } = await getSupabase().storage.from("images").upload(coverPath, file, {
      cacheControl: "60",
      upsert: false
    });

    if (coverError) {
      throw coverError;
    }

    return getSupabase().storage.from("images").getPublicUrl(coverPath).data.publicUrl;
  }

  useEffect(() => {
    setPlaylistEditName(selectedPlaylist?.name ?? "");
    setPlaylistCoverImage(selectedPlaylist?.coverImage ?? "");
    setPlaylistCoverFile(null);
  }, [selectedPlaylist?.coverImage, selectedPlaylist?.id, selectedPlaylist?.name]);

  if (!bootComplete) {
    return (
      <main className="min-h-screen bg-[#030603] text-acidGreen">
        <section className="grid min-h-screen place-items-center px-6">
          <div className="w-full max-w-2xl border border-acidGreen/60 bg-black p-6 shadow-[0_0_40px_rgba(186,255,0,0.12)]">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em]">ROOM_9 / Sound Vault terminal</p>
            <h1 className="mt-6 font-mono text-3xl uppercase leading-none md:text-5xl">Booting Vault</h1>
            <div className="mt-8 h-3 border border-acidGreen/70 bg-[#071006]">
              <div className="h-full bg-acidGreen transition-[width]" style={{ width: `${bootProgress}%` }} />
            </div>
            <div className="mt-4 flex justify-between font-mono text-[11px] uppercase">
              <span>Loading saved signal index</span>
              <span>{bootProgress}%</span>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-voidBlack text-paperWhite">
      <div className="min-h-screen">
      <section className="border-b border-roomBorder px-4 py-5 sm:px-5 md:px-10">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="room-tiny text-mutedText">Listener system / saved atmosphere briefs</p>
            <h1 className="mt-2 overflow-hidden break-words font-display text-[clamp(2rem,11vw,2.65rem)] leading-none text-paperWhite md:text-[42px]">
              Your Sound Vault
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-mutedText">
              Saved tracks, atmosphere briefs, queue, listening history and booking-ready
              references live here before they become case files.
            </p>
          </div>

          <div className="flex w-full max-w-[620px] flex-col gap-3">
            <label>
              <span className="sr-only">Search your vault</span>
              <input
                className="h-11 w-full border border-roomBorder bg-panelBlack px-4 font-mono text-[11px] uppercase text-paperWhite outline-none placeholder:text-neutral-700 focus:border-paperWhite"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tracks, moments, DJs, BPM..."
                value={query}
              />
            </label>
            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end">
              <Button disabled={visibleQueue.length === 0} onClick={playVisibleQueue} size="sm" type="button" variant="primary">
                Play Visible
              </Button>
              <ButtonLink href="/explore" size="sm" variant="secondary">
                Discover
              </ButtonLink>
              <ButtonLink href="/dashboard/settings" size="sm" variant="ghost">
                Profile Tools
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-roomBorder px-4 sm:px-5 md:px-10">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-4 py-4">
          <div className="room-mobile-scrollbar -mx-1 flex w-full items-center gap-2 overflow-x-auto px-1 pb-1 font-mono text-[11px] uppercase lg:w-auto lg:overflow-visible lg:pb-0">
            {vaultModes.map((mode) => (
              <Link
                className={cx(
                  "min-w-[132px] shrink-0 border px-3 py-2 transition",
                  activeMode === mode.id
                    ? "border-acidGreen bg-acidGreen text-voidBlack"
                    : "border-roomBorder bg-black text-mutedText hover:border-paperWhite hover:text-paperWhite"
                )}
                href={mode.href}
                key={mode.id}
                onClick={() => selectVaultMode(mode.id)}
              >
                <span className="room-one-line block font-black">{mode.label}</span>
                <span className="room-one-line mt-1 block text-[9px] opacity-70">{mode.note}</span>
              </Link>
            ))}
          </div>
          <Link className="room-outline-button min-h-9 px-3" href="/explore">
            Exit to Explore
          </Link>
        </div>
      </section>

      {Object.values(hiddenModules).some(Boolean) ? (
        <section className="border-b border-roomBorder px-5 py-3 md:px-10">
          <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-[10px] uppercase text-mutedText">
              Hidden modules stay hidden until restored.
            </p>
            <Button onClick={() => setHiddenModules({})} size="sm" type="button" variant="secondary">
              Restore Modules
            </Button>
          </div>
        </section>
      ) : null}

      {error ? <p className="border-b border-roomBorder px-5 py-3 text-sm text-errorRed md:px-10">{error}</p> : null}
      {notice ? <p className="border-b border-roomBorder px-5 py-3 font-mono text-[11px] uppercase text-acidGreen md:px-10">{notice}</p> : null}

      <section className="border-b border-roomBorder px-4 py-4 sm:px-5 md:px-10">
        <div className="mx-auto grid max-w-[1680px] gap-3 lg:grid-cols-4">
          <VaultSignal label="Active source" value={activeTabLabel} meta={`${filteredWorks.length} tracks / ${filteredMoments.length} moments`} tone="accent" />
          <VaultSignal label="Now playing" value={currentTrack?.title ?? "No active track"} meta={currentTrack?.artist ?? "Start a queue"} />
          <VaultSignal label="Next in queue" value={nextQueueTrack?.title ?? "Queue empty"} meta={queue.length > 0 ? `${queue.length} tracks loaded` : "Play a playlist or visible list"} />
          <div className="grid grid-cols-3 gap-2">
            <Button disabled={queue.length < 2} onClick={playPrevious} size="sm" type="button" variant="secondary">
              Prev
            </Button>
            <Button disabled={queue.length < 2} onClick={playNext} size="sm" type="button" variant="secondary">
              Next
            </Button>
            <Button active={repeatOne} disabled={!currentTrack} onClick={toggleRepeatOne} size="sm" type="button" variant={repeatOne ? "primary" : "secondary"}>
              Repeat 1
            </Button>
          </div>
        </div>
      </section>

      {canShowVaultModule("signal-profile", ["overview"]) ? (
      <section className="border-b border-roomBorder px-5 py-7 md:px-10">
        <div className="mx-auto grid max-w-[1680px] gap-5 xl:grid-cols-[0.82fr_1.18fr]">
          <Panel className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="room-tiny">Signal engine / personal model</p>
                <h2 className="mt-4 font-display text-2xl uppercase text-paperWhite">Sound Profile</h2>
              </div>
              <Button onClick={() => toggleVaultModule("signal-profile")} size="sm" type="button" variant="ghost">
                Hide
              </Button>
            </div>
            <p className="mt-2 text-sm leading-6 text-mutedText">
              ROOM_9 reads your saved tracks, playlists and timestamp moments to build a practical booking/listening signal.
            </p>
            <div className="mt-5 grid gap-px border border-roomBorder bg-roomBorder sm:grid-cols-2">
              <VaultMetric label="Taste vector" value={soundProfileModel.headline} />
              <VaultMetric label="High intent" value={soundProfile.highIntentCount} />
              <VaultMetric label="Booking-ready" value={soundProfile.bookingReadyCount} />
              <VaultMetric label="Model confidence" value={`${Math.round((soundProfileModel.confidence ?? 0) * 100)}%`} />
              <VaultMetric label="Avg energy" value={soundProfileModel.avg_energy ?? "0"} />
              <VaultMetric label="Archive size" value={soundProfile.archiveSize} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {soundProfileTags.map((tag, index) => (
                <span className="border border-roomBorder px-3 py-1 font-mono text-[10px] uppercase text-mutedText" key={`${tag}-${index}`}>
                  {tag}
                </span>
              ))}
            </div>
          </Panel>

          <Panel className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="room-tiny">Ranked signal index</p>
                <h2 className="mt-4 font-display text-2xl uppercase text-paperWhite">Best Matches In Vault</h2>
              </div>
              <StatusBadge status="selected">adaptive</StatusBadge>
            </div>
            <div className="mt-5 space-y-2">
              {signalIndex.length === 0 ? (
                <p className="border border-dashed border-roomBorder p-4 text-sm leading-6 text-mutedText">
                  Save tracks and moments first. The model becomes useful after your first listening signals.
                </p>
              ) : (
                signalIndex.map(({ dj, signal, work }, index) => (
                  <article className="grid gap-3 border border-roomBorder bg-black p-3 md:grid-cols-[28px_1fr_auto] md:items-center" key={work.id}>
                    <span className="font-mono text-[10px] uppercase text-acidGreen">{String(index + 1).padStart(2, "0")}</span>
                    <div className="min-w-0">
                      <Link className="font-display text-lg uppercase text-paperWhite hover:text-acidGreen" href={`/track/${work.id}`}>
                        {work.title || "Untitled track"}
                      </Link>
                      <p className="mt-1 font-mono text-[10px] uppercase text-mutedText">
                        {[dj?.stage_name || "ROOM_9 Artist", signal.tags.slice(0, 2).join(" / ")].filter(Boolean).join(" / ")}
                      </p>
                      <p className="mt-2 truncate text-xs text-mutedText">{signal.reasons[0]}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className="border border-acidGreen px-2 py-1 font-mono text-[10px] uppercase text-acidGreen">
                        {formatSignalScore(signal.soundMatch)} match
                      </span>
                      <Button disabled={!work.link} onClick={() => playWork(work)} size="sm" type="button" variant="secondary">
                        Play
                      </Button>
                      <Button onClick={() => queueWork(work)} size="sm" type="button" variant="ghost">
                        Queue
                      </Button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </Panel>
        </div>
      </section>
      ) : null}

      {canShowVaultModule("signal-channels", ["overview"]) ? (
      <section className="border-b border-roomBorder px-5 py-7 md:px-10">
        <div className="mx-auto max-w-[1680px]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="room-tiny">Recommendation intelligence</p>
              <h2 className="mt-3 font-display text-2xl uppercase text-paperWhite">Signal Channels</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-mutedText">
                Explainable groups built from saved moments, playlists, likes and manual DJ Music Lab cues.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={recommendationGroups.length > 0 ? "selected" : "draft"}>
                {recommendationGroups.length > 0 ? "model active" : "needs signals"}
              </StatusBadge>
              <Button onClick={() => toggleVaultModule("signal-channels")} size="sm" type="button" variant="ghost">
                Hide
              </Button>
            </div>
          </div>
          {recommendationGroups.length === 0 ? (
            <p className="mt-5 border border-dashed border-roomBorder bg-black p-4 text-sm leading-6 text-mutedText">
              Save tracks, moments or playlist entries to open recommendation channels.
            </p>
          ) : (
            <div className="mt-5 grid gap-3 xl:grid-cols-4">
              {recommendationGroups.map((group) => (
                <Panel className="p-4" key={group.id}>
                  <p className="room-tiny">{group.id.replace("-", " / ")}</p>
                  <h3 className="mt-3 font-display text-lg uppercase text-paperWhite">{group.title}</h3>
                  <p className="mt-2 min-h-10 text-xs leading-5 text-mutedText">{group.description}</p>
                  <div className="mt-4 space-y-2">
                    {group.items.map(({ dj, reason, signal, work }) => (
                      <article className="border border-roomBorder bg-black p-3" key={`${group.id}-${work.id}`}>
                        <Link className="block truncate font-display text-sm uppercase text-paperWhite hover:text-acidGreen" href={`/track/${work.id}`}>
                          {work.title || "Untitled track"}
                        </Link>
                        <p className="mt-1 truncate font-mono text-[9px] uppercase text-mutedText">
                          {[dj?.stage_name || "ROOM_9 Artist", signal.tags[0]].filter(Boolean).join(" / ")}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-mutedText">{reason}</p>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="font-mono text-[10px] uppercase text-acidGreen">{formatSignalScore(signal.soundMatch)}</span>
                          <div className="flex gap-1">
                            <Button disabled={!work.link} onClick={() => playWork(work)} size="sm" type="button" variant="ghost">
                              Play
                            </Button>
                            <Button onClick={() => queueWork(work)} size="sm" type="button" variant="ghost">
                              Queue
                            </Button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </div>
      </section>
      ) : null}

      {hasRoleAccess(activeRoles, ["dj"]) && canShowVaultModule("uploads", ["uploads"]) ? (
        <section className="border-b border-roomBorder px-5 py-7 md:px-10">
          <div className="mx-auto mb-4 flex max-w-[1680px] flex-wrap items-center justify-between gap-3">
            <div>
              <p className="room-tiny">DJ production layer</p>
              <h2 className="mt-2 font-display text-2xl uppercase text-paperWhite">Uploads / Releases</h2>
            </div>
            <Button onClick={() => toggleVaultModule("uploads")} size="sm" type="button" variant="ghost">
              Hide
            </Button>
          </div>
          <div className="mx-auto grid max-w-[1680px] gap-6 xl:grid-cols-[1fr_0.9fr]">
            {djProfile ? (
              <UploadTrackPanel
                coverFile={coverFile}
                form={uploadForm}
                isUploading={isUploading}
                trackFile={trackFile}
                onCoverChange={(event) => setCoverFile(event.target.files?.[0] ?? null)}
                onFileChange={(event) => setTrackFile(event.target.files?.[0] ?? null)}
                onFormChange={setUploadForm}
                onSubmit={uploadTrack}
              />
            ) : (
              <Panel className="p-5">
                <p className="room-tiny">DJ tools locked</p>
                <h2 className="mt-4 font-display text-2xl uppercase text-paperWhite">Upload unlocks after DJ verification</h2>
                <p className="mt-2 text-sm leading-6 text-mutedText">
                  ROOM_9 keeps every account as a listener first. Uploads and public artist tools open after you enable DJ access in Settings.
                </p>
                <ButtonLink className="mt-5" href="/dashboard/settings" variant="primary">
                  Open Role Verification
                </ButtonLink>
              </Panel>
            )}

            {editingWorkId && editForm ? (
              <EditTrackPanel
                coverFile={editCoverFile}
                form={editForm}
                isSaving={isTrackSaving}
                onCancel={() => {
                  setEditingWorkId(null);
                  setEditForm(null);
                  setEditCoverFile(null);
                }}
                onCoverChange={(event) => setEditCoverFile(event.target.files?.[0] ?? null)}
                onFormChange={setEditForm}
                onSubmit={saveTrackEdit}
              />
            ) : (
              <Panel className="p-5">
                <p className="room-tiny">Library control</p>
                <h2 className="mt-4 font-display text-2xl uppercase text-paperWhite">Metadata stays with the track</h2>
                <p className="mt-2 text-sm leading-6 text-mutedText">
                  Edit cover, title, BPM, key, genre, visibility and notes here. Public tracks appear in artist dossiers and Track Pages.
                </p>
                <div className="mt-5 grid gap-px bg-roomBorder">
                  <VaultMetric label="Uploaded tracks" value={uploadedWorks.length} />
                  <VaultMetric label="Missing covers" value={uploadedWorks.filter((work) => !work.cover_image).length} />
                </div>
              </Panel>
            )}
          </div>
          {djProfile ? (
            <ReleaseManagerPanel
              form={releaseForm}
              isSaving={isReleaseSaving}
              releaseCoverFile={releaseCoverFile}
              releaseTracks={releaseTracks}
              releases={releases}
              selectedRelease={selectedRelease}
              uploadedWorks={uploadedWorks}
              onCreateRelease={createRelease}
              onDeleteRelease={deleteRelease}
              onFormChange={setReleaseForm}
              onReleaseCoverChange={(event) => setReleaseCoverFile(event.target.files?.[0] ?? null)}
              onSelectRelease={setSelectedReleaseId}
              onToggleTrack={toggleTrackInSelectedRelease}
            />
          ) : null}
        </section>
      ) : null}

      <section className="mx-auto grid max-w-[1680px] gap-6 px-5 py-7 md:px-10 xl:grid-cols-[1fr_340px]">
        <div className="space-y-7">
          {canShowVaultModule("playlists", ["playlists"]) ? (
          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl uppercase text-paperWhite">Personal Playlists</h2>
                <p className="mt-2 text-sm text-mutedText">
                  Each playlist is scoped to your account. Use it for listening, references, or pre-booking selections.
                </p>
              </div>
              <form className="flex min-w-[220px] max-w-xl flex-1 gap-2" onSubmit={createPlaylist}>
                <input
                  className="h-10 min-w-0 flex-1 border border-roomBorder bg-panelBlack px-3 font-mono text-[11px] uppercase text-paperWhite outline-none placeholder:text-neutral-700 focus:border-paperWhite"
                  onChange={(event) => setPlaylistName(event.target.value)}
                  placeholder="New playlist name"
                  value={playlistName}
                />
                <Button size="sm" type="submit" variant="primary">
                  Create
                </Button>
              </form>
              <Button onClick={() => toggleVaultModule("playlists")} size="sm" type="button" variant="ghost">
                Hide
              </Button>
            </div>

            {playlists.length === 0 ? (
              <EmptyState
                title="No playlists yet"
                message="Create a personal selection, then add tracks from Track Pages, Explore, or saved track views."
                href="/explore"
                action="Find Tracks"
              />
            ) : (
              <div className="grid gap-3 lg:grid-cols-3">
                {playlists.map((playlist) => {
                  const active = selectedPlaylist?.id === playlist.id;
                  return (
                    <button
                      className={cx(
                        "border p-4 text-left transition",
                        active ? "border-acidGreen bg-[#101700]" : "border-roomBorder bg-panelBlack hover:border-paperWhite"
                      )}
                      key={playlist.id}
                      onClick={() => setSelectedPlaylistId(playlist.id)}
                      type="button"
                    >
                      <StatusBadge status={active ? "selected" : "draft"}>{active ? "active" : "playlist"}</StatusBadge>
                      <h3 className="mt-4 font-display text-xl uppercase text-paperWhite">{playlist.name}</h3>
                      <p className="mt-2 font-mono text-[10px] uppercase text-mutedText">
                        {playlist.trackIds.length} track{playlist.trackIds.length === 1 ? "" : "s"} / personal scope
                      </p>
                    </button>
                  );
                })}
              </div>
            )}

            <PlaylistDetailsPanel
              coverFile={playlistCoverFile}
              isSaving={isPlaylistSaving}
              playlist={selectedPlaylist}
              playlistCoverImage={playlistCoverImage}
              playlistEditName={playlistEditName}
              works={selectedPlaylist ? selectedPlaylist.trackIds.map((id) => works.find((work) => work.id === id)).filter((work): work is Work => Boolean(work)) : []}
              onCoverChange={(event) => setPlaylistCoverFile(event.target.files?.[0] ?? null)}
              onCoverImageChange={setPlaylistCoverImage}
              onDelete={() => selectedPlaylist && deletePlaylist(selectedPlaylist.id)}
              onNameChange={setPlaylistEditName}
              onPlay={() => {
                const playlistWorks = selectedPlaylist
                  ? selectedPlaylist.trackIds.map((id) => works.find((work) => work.id === id)).filter((work): work is Work => Boolean(work))
                  : [];
                playQueue(buildPlayerQueue(playlistWorks, djLookup));
              }}
              onRemoveTrack={(trackId) => toggleTrackInSelectedPlaylist(trackId)}
              onReorder={movePlaylistTrack}
              onSubmit={savePlaylistDetails}
            />
          </section>
          ) : null}

          {canShowVaultModule("moments", ["briefs"]) ? (
          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl uppercase text-paperWhite">High Intent Moments</h2>
                <p className="mt-2 text-sm text-mutedText">
                  Snippets saved from tracks and streams, ready for booking context.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status="selected">{filteredMoments.length} saved</StatusBadge>
                <Button onClick={() => toggleVaultModule("moments")} size="sm" type="button" variant="ghost">
                  Hide
                </Button>
              </div>
            </div>

            {filteredMoments.length === 0 ? (
              <EmptyState
                title="No saved references yet"
                message="Open a track, select a build or peak, then save the timestamp as a Sound Vault reference."
                href="/explore"
                action="Discover Sounds"
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {filteredMoments.map((moment) => (
                  <Panel className="p-5" key={moment.id}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <StatusBadge status="selected">{moment.momentLabel}</StatusBadge>
                        <h3 className="mt-4 font-display text-2xl uppercase leading-none text-paperWhite">
                          {moment.trackTitle}
                        </h3>
                        <p className="mt-2 font-mono text-[10px] uppercase text-mutedText">{moment.artist}</p>
                      </div>
                      <div className="border border-roomBorder px-3 py-2 text-right font-mono text-xs uppercase text-paperWhite">
                        {moment.timestampLabel}
                      </div>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {moment.bpm ? <span className="rounded-none border border-roomBorder px-3 py-1 font-mono text-[10px] uppercase text-mutedText">{moment.bpm} BPM</span> : null}
                      {moment.energy ? <span className="rounded-none border border-roomBorder px-3 py-1 font-mono text-[10px] uppercase text-mutedText">{moment.energy}</span> : null}
                      {moment.roomType ? <span className="rounded-none border border-roomBorder px-3 py-1 font-mono text-[10px] uppercase text-mutedText">{moment.roomType}</span> : null}
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2 border-t border-roomBorder pt-4">
                      <Button onClick={() => playMoment(moment)} size="sm" type="button" variant="primary">
                        Play Moment
                      </Button>
                      <ButtonLink href={`/track/${moment.trackId}`} size="sm" variant="secondary">
                        Open Track
                      </ButtonLink>
                      {moment.djId ? (
                        <ButtonLink
                          href={`/booking/${moment.djId}?workId=${encodeURIComponent(moment.trackId)}&t=${Math.round(moment.timestamp)}`}
                          size="sm"
                          variant="secondary"
                        >
                          Create Booking
                        </ButtonLink>
                      ) : null}
                      <Button onClick={() => deleteMoment(moment.id)} size="sm" type="button" variant="ghost">
                        Remove
                      </Button>
                    </div>
                  </Panel>
                ))}
              </div>
            )}
          </section>
          ) : null}

          {followedDjs.length > 0 && canShowVaultModule("network", ["network"]) ? (
            <section>
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl uppercase text-paperWhite">Followed DJs</h2>
                  <p className="mt-2 text-sm text-mutedText">
                    Artists are inferred from your saved tracks, saved references, queues and playlist selections.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status="verified">{followedDjs.length} artists</StatusBadge>
                  <Button onClick={() => toggleVaultModule("network")} size="sm" type="button" variant="ghost">
                    Hide
                  </Button>
                </div>
              </div>

              {followedDjs.length === 0 ? (
                <EmptyState
                  title="No followed DJs yet"
                  message="Save a track, queue a set, or keep a sound reference to build your artist network."
                  href="/explore"
                  action="Discover Artists"
                />
              ) : (
                <div className="grid gap-4 lg:grid-cols-3">
                  {followedDjs.map((dj) => {
                    const artistWorks = works.filter((work) => work.dj_id === dj.id);
                    const peakMoment = savedMoments.find((moment) => moment.djId === dj.id);
                    return (
                      <Panel className="p-5" key={dj.id}>
                        <div
                          className="h-32 border border-roomBorder bg-inkPanel bg-cover bg-center grayscale"
                          style={{ backgroundImage: cssImageUrl(getDjAvatarUrl(dj)) }}
                        />
                        <h3 className="mt-4 font-display text-2xl uppercase leading-none text-paperWhite">
                          {dj.stage_name || "ROOM_9 Artist"}
                        </h3>
                        <p className="mt-2 font-mono text-[10px] uppercase text-mutedText">
                          {[dj.city, dj.country, dj.genres].filter(Boolean).join(" / ")}
                        </p>
                        <div className="mt-4 grid grid-cols-2 gap-px bg-roomBorder">
                          <VaultMetric label="Vaulted" value={artistWorks.length} />
                          <VaultMetric label="Peak" value={peakMoment?.timestampLabel ?? "--"} />
                        </div>
                        <div className="mt-4 flex gap-2">
                          <ButtonLink className="flex-1" href={`/dj/${dj.id}`} size="sm" variant="secondary">
                            Open Dossier
                          </ButtonLink>
                          {peakMoment ? (
                            <Button onClick={() => playMoment(peakMoment)} size="sm" type="button" variant="primary">
                              Play Peak
                            </Button>
                          ) : null}
                        </div>
                      </Panel>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}

          {canShowVaultModule("tracks", ["tracks", "playlists"]) ? (
          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl uppercase text-paperWhite">
                  Vaulted Tracks
                </h2>
                <p className="mt-2 font-mono text-[10px] uppercase text-mutedText">
                  {filteredWorks.length} tracks / {playlists.length} playlists
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
              {filteredWorks.length > 0 ? (
                <Button
                  onClick={playVisibleQueue}
                  size="sm"
                  type="button"
                  variant="primary"
                >
                  {activeTab === "playlists" ? "Play Playlist" : "Play Visible"}
                </Button>
              ) : (
                <ButtonLink href="/explore" size="sm" variant="secondary">
                  Find Sound
                </ButtonLink>
              )}
                <Button onClick={() => toggleVaultModule("tracks")} size="sm" type="button" variant="ghost">
                  Hide
                </Button>
              </div>
            </div>

            {isLoading ? (
              <div className="h-72 animate-pulse border border-roomBorder bg-panelBlack" />
            ) : filteredWorks.length === 0 ? (
              <EmptyState
                title="No tracks in this view"
                message="Favorite tracks from Explore or Track Page to build your personal music layer."
                href="/explore"
                action="Start Listening"
              />
            ) : (
              <div className="border-t border-roomBorder">
                {filteredWorks.map((work, index) => {
                  const dj = djLookup[work.dj_id];
                  const active = currentTrack?.id === work.id;
                  return (
                    <article
                      className={cx(
                        "grid gap-4 border-b border-roomBorder py-4 md:grid-cols-[36px_56px_minmax(0,1fr)_90px_140px_auto] md:items-center",
                        active && "bg-[#101700]"
                      )}
                      key={work.id}
                    >
                      <span className="font-mono text-[10px] uppercase text-mutedText">{String(index + 1).padStart(2, "0")}</span>
                      <div
                        className="h-14 w-14 border border-roomBorder bg-inkPanel bg-cover bg-center"
                        style={{ backgroundImage: cssImageUrl(getWorkCoverUrl(work, dj)) }}
                      />
                      <div className="min-w-0">
                        <Link className="font-display text-lg uppercase text-paperWhite hover:text-acidGreen" href={`/track/${work.id}`}>
                          {work.title || "Untitled track"}
                        </Link>
                        <p className="mt-1 font-mono text-[10px] uppercase text-mutedText">
                          {[dj?.stage_name || "ROOM_9 Artist", work.genre, work.bpm ? `${work.bpm} BPM` : ""].filter(Boolean).join(" / ")}
                        </p>
                      </div>
                      <span className="font-mono text-[10px] uppercase text-mutedText">{work.bpm || "--"} BPM</span>
                      <span className="font-mono text-[10px] uppercase text-mutedText">
                        {work.play_count ?? 0} plays / {work.like_count ?? 0} saves
                      </span>
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          aria-label={`Play ${work.title || "track"}`}
                          className="px-2"
                          disabled={!work.link}
                          onClick={() => playWork(work)}
                          size="sm"
                          title={`Play ${work.title || "track"}`}
                          type="button"
                          variant={active ? "primary" : "secondary"}
                        >
                          <PlayGlyph className="h-3.5 w-3.5" />
                          <span className="hidden 2xl:inline">Play</span>
                        </Button>
                        <Button
                          active={favoriteIds.includes(work.id)}
                          aria-label={
                            favoriteIds.includes(work.id)
                              ? `Remove ${work.title || "track"} from liked tracks`
                              : `Like ${work.title || "track"}`
                          }
                          className="px-2"
                          onClick={() => toggleFavoriteTrack(work.id)}
                          size="sm"
                          title={favoriteIds.includes(work.id) ? "Remove from liked tracks" : "Like track"}
                          type="button"
                          variant="ghost"
                        >
                          <HeartGlyph className="h-3.5 w-3.5" filled={favoriteIds.includes(work.id)} />
                          <span className="hidden 2xl:inline">{favoriteIds.includes(work.id) ? "Remove" : "Like"}</span>
                        </Button>
                        <Button
                          active={Boolean(selectedPlaylist?.trackIds.includes(work.id))}
                          aria-label={
                            selectedPlaylist?.trackIds.includes(work.id)
                              ? `Remove ${work.title || "track"} from ${selectedPlaylist.name}`
                              : `Add ${work.title || "track"} to playlist`
                          }
                          className="px-2"
                          onClick={() => toggleTrackInSelectedPlaylist(work.id)}
                          size="sm"
                          title={selectedPlaylist?.trackIds.includes(work.id) ? "Remove from playlist" : "Add to playlist"}
                          type="button"
                          variant="secondary"
                        >
                          <PlaylistGlyph className="h-3.5 w-3.5" />
                          <span className="hidden 2xl:inline">
                            {selectedPlaylist?.trackIds.includes(work.id) ? "In Playlist" : "Add"}
                          </span>
                        </Button>
                        <Button
                          aria-label={`Add ${work.title || "track"} to queue`}
                          className="px-2"
                          disabled={!work.link}
                          onClick={() => queueWork(work)}
                          size="sm"
                          title="Add to queue"
                          type="button"
                          variant="ghost"
                        >
                          <QueueGlyph className="h-3.5 w-3.5" />
                          <span className="hidden 2xl:inline">Queue</span>
                        </Button>
                        {djProfile?.id === work.dj_id ? (
                          <>
                            <Button aria-label={`Edit ${work.title || "track"}`} className="px-2" onClick={() => beginEditTrack(work)} size="sm" type="button" variant="ghost">
                              Edit
                            </Button>
                            <Button aria-label={`Remove ${work.title || "track"}`} className="px-2" onClick={() => archiveTrack(work)} size="sm" type="button" variant="destructive">
                              Remove
                            </Button>
                          </>
                        ) : null}
                        <ButtonLink aria-label={`Open ${work.title || "track"}`} className="px-2" href={`/track/${work.id}`} size="sm" variant="ghost">
                          <ExternalGlyph className="h-3.5 w-3.5" />
                          <span className="hidden 2xl:inline">Open</span>
                        </ButtonLink>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
          ) : null}
        </div>

        {canShowVaultModule("side-console", ["overview", "tracks", "playlists"]) ? (
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Panel className="p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="room-tiny">Queue console</p>
              <Button onClick={() => toggleVaultModule("side-console")} size="sm" type="button" variant="ghost">
                Hide
              </Button>
            </div>
            <div className="mt-5 border border-roomBorder bg-black p-4">
              <p className="font-mono text-[10px] uppercase text-mutedText">Current track</p>
              <p className="mt-2 truncate font-display text-xl uppercase text-paperWhite">
                {currentTrack?.title ?? "No track loaded"}
              </p>
              <p className="mt-1 truncate font-mono text-[10px] uppercase text-mutedText">
                {currentTrack?.artist ?? "Play any visible list to start"}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button disabled={queue.length < 2} onClick={playPrevious} size="sm" type="button" variant="secondary">
                Previous
              </Button>
              <Button disabled={queue.length < 2} onClick={playNext} size="sm" type="button" variant="secondary">
                Next
              </Button>
              <Button active={repeatOne} className="col-span-2" disabled={!currentTrack} onClick={toggleRepeatOne} size="sm" type="button" variant={repeatOne ? "primary" : "secondary"}>
                {repeatOne ? "Repeat one active" : "Repeat one"}
              </Button>
            </div>
            <p className="mt-4 text-xs leading-5 text-mutedText">
              Queue and repeat are local to your listening session. Playlists and saved objects stay scoped to your account.
            </p>
          </Panel>

          <Panel className="p-5">
            <p className="room-tiny">Vault status</p>
            <div className="mt-5 grid gap-px bg-roomBorder">
              <VaultMetric label="Saved tracks" value={favoriteIds.length} />
              <VaultMetric label="Sound refs" value={savedMoments.length} />
              <VaultMetric label="History" value={historyIds.length} />
              <VaultMetric label="Playlists" value={playlists.length} />
            </div>
          </Panel>

          <Panel className="p-5">
            <p className="room-tiny">Playlists</p>
            <div className="mt-4 space-y-3">
              {playlists.length === 0 ? (
                <p className="text-sm leading-6 text-mutedText">
                  Personal playlists are stored per account in Supabase when signed in, with a local
                  demo fallback. Create and manage them from this Sound Vault.
                </p>
              ) : (
                playlists.slice(0, 6).map((playlist) => (
                  <div className="border border-roomBorder p-3" key={playlist.id}>
                    <p className="font-display text-lg uppercase text-paperWhite">{playlist.name}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase text-mutedText">{playlist.trackIds.length} tracks</p>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </aside>
        ) : null}
      </section>
      </div>
    </main>
  );
}

function VaultMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-black p-4">
      <p className="room-tiny">{label}</p>
      <p className="mt-2 font-display text-3xl uppercase text-paperWhite">{value}</p>
    </div>
  );
}

function VaultSignal({
  label,
  meta,
  tone = "default",
  value
}: {
  label: string;
  meta?: string;
  tone?: "accent" | "default";
  value: string;
}) {
  return (
    <div className={cx("border border-roomBorder bg-panelBlack p-4", tone === "accent" && "border-acidGreen/70")}>
      <p className="room-tiny">{label}</p>
      <p className={cx("mt-2 truncate font-display text-xl uppercase", tone === "accent" ? "text-acidGreen" : "text-paperWhite")}>
        {value}
      </p>
      {meta ? <p className="mt-1 truncate font-mono text-[10px] uppercase text-mutedText">{meta}</p> : null}
    </div>
  );
}

function UploadTrackPanel({
  coverFile,
  form,
  isUploading,
  trackFile,
  onCoverChange,
  onFileChange,
  onFormChange,
  onSubmit
}: {
  coverFile: File | null;
  form: UploadForm;
  isUploading: boolean;
  trackFile: File | null;
  onCoverChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onFormChange: (form: UploadForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Panel className="p-5">
      <p className="room-tiny">DJ upload</p>
      <h2 className="mt-4 font-display text-2xl uppercase text-paperWhite">Upload Track</h2>
      <form className="mt-5 space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="room-label">Track title</span>
          <Input
            onChange={(event) => onFormChange({ ...form, title: event.target.value })}
            placeholder="VOID_PROTOCOL_MIX"
            required
            value={form.title}
          />
        </label>
        <div className="grid gap-3 md:grid-cols-4">
          <label>
            <span className="room-label">Genre</span>
            <Input onChange={(event) => onFormChange({ ...form, genre: event.target.value })} placeholder="Techno" value={form.genre} />
          </label>
          <label>
            <span className="room-label">BPM</span>
            <Input onChange={(event) => onFormChange({ ...form, bpm: event.target.value })} placeholder="138" value={form.bpm} />
          </label>
          <label>
            <span className="room-label">Key</span>
            <Input onChange={(event) => onFormChange({ ...form, key: event.target.value })} placeholder="Am" value={form.key} />
          </label>
          <label>
            <span className="room-label">Release</span>
            <Select
              onChange={(event) => onFormChange({ ...form, releaseType: event.target.value as UploadForm["releaseType"] })}
              value={form.releaseType}
            >
              <option className="bg-black" value="track">Track</option>
              <option className="bg-black" value="single">Single</option>
              <option className="bg-black" value="set">DJ Set</option>
            </Select>
          </label>
        </div>
        <label className="block">
          <span className="room-label">Visibility</span>
          <Select
            onChange={(event) => onFormChange({ ...form, visibility: event.target.value as "public" | "private" })}
            value={form.visibility}
          >
            <option className="bg-black" value="public">Public</option>
            <option className="bg-black" value="private">Private</option>
          </Select>
        </label>
        <label className="block">
          <span className="room-label">Description</span>
          <Textarea
            onChange={(event) => onFormChange({ ...form, description: event.target.value })}
            placeholder="Room fit, energy, release notes..."
            value={form.description}
          />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label>
            <span className="room-label">MP3 or WAV</span>
            <Input accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav" onChange={onFileChange} type="file" />
            {trackFile ? <p className="mt-2 text-xs text-mutedText">{trackFile.name}</p> : null}
          </label>
          <label>
            <span className="room-label">Cover image</span>
            <Input accept="image/jpeg,image/png,image/webp,image/gif" onChange={onCoverChange} type="file" />
            {coverFile ? <p className="mt-2 text-xs text-mutedText">{coverFile.name}</p> : null}
          </label>
        </div>
        <Button loading={isUploading} type="submit" variant="primary">
          Upload Track
        </Button>
      </form>
    </Panel>
  );
}

function EditTrackPanel({
  coverFile,
  form,
  isSaving,
  onCancel,
  onCoverChange,
  onFormChange,
  onSubmit
}: {
  coverFile: File | null;
  form: EditForm;
  isSaving: boolean;
  onCancel: () => void;
  onCoverChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onFormChange: (form: EditForm) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Panel className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="room-tiny">Track metadata</p>
          <h2 className="mt-4 font-display text-2xl uppercase text-paperWhite">Edit Track</h2>
        </div>
        <Button onClick={onCancel} size="sm" type="button" variant="ghost">
          Cancel
        </Button>
      </div>
      <form className="mt-5 space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="room-label">Track title</span>
          <Input onChange={(event) => onFormChange({ ...form, title: event.target.value })} required value={form.title} />
        </label>
        <div className="grid gap-3 md:grid-cols-4">
          <label>
            <span className="room-label">Genre</span>
            <Input onChange={(event) => onFormChange({ ...form, genre: event.target.value })} value={form.genre} />
          </label>
          <label>
            <span className="room-label">BPM</span>
            <Input onChange={(event) => onFormChange({ ...form, bpm: event.target.value })} value={form.bpm} />
          </label>
          <label>
            <span className="room-label">Key</span>
            <Input onChange={(event) => onFormChange({ ...form, key: event.target.value })} value={form.key} />
          </label>
          <label>
            <span className="room-label">Release</span>
            <Select
              onChange={(event) => onFormChange({ ...form, releaseType: event.target.value as UploadForm["releaseType"] })}
              value={form.releaseType}
            >
              <option className="bg-black" value="track">Track</option>
              <option className="bg-black" value="single">Single</option>
              <option className="bg-black" value="set">DJ Set</option>
            </Select>
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-[112px_1fr]">
          <div
            className="h-28 border border-roomBorder bg-inkPanel bg-cover bg-center"
            style={{ backgroundImage: cssImageUrl(form.coverImage || "/room9-track-placeholder.svg") }}
          />
          <div className="grid gap-3">
            <label>
              <span className="room-label">Cover image URL</span>
              <Input onChange={(event) => onFormChange({ ...form, coverImage: event.target.value })} placeholder="https://..." value={form.coverImage} />
            </label>
            <label>
              <span className="room-label">Upload new cover</span>
              <Input accept="image/jpeg,image/png,image/webp,image/gif" onChange={onCoverChange} type="file" />
              {coverFile ? <p className="mt-2 text-xs text-mutedText">{coverFile.name}</p> : null}
            </label>
          </div>
        </div>
        <label className="block">
          <span className="room-label">Visibility</span>
          <Select
            onChange={(event) => onFormChange({ ...form, visibility: event.target.value as "public" | "private" })}
            value={form.visibility}
          >
            <option className="bg-black" value="public">Public</option>
            <option className="bg-black" value="private">Private</option>
          </Select>
        </label>
        <label className="block">
          <span className="room-label">Description</span>
          <Textarea onChange={(event) => onFormChange({ ...form, description: event.target.value })} value={form.description} />
        </label>
        <Button loading={isSaving} type="submit" variant="primary">
          Save Metadata
        </Button>
      </form>
    </Panel>
  );
}

function ReleaseManagerPanel({
  form,
  isSaving,
  releaseCoverFile,
  releaseTracks,
  releases,
  selectedRelease,
  uploadedWorks,
  onCreateRelease,
  onDeleteRelease,
  onFormChange,
  onReleaseCoverChange,
  onSelectRelease,
  onToggleTrack
}: {
  form: ReleaseForm;
  isSaving: boolean;
  releaseCoverFile: File | null;
  releaseTracks: Record<string, string[]>;
  releases: Release[];
  selectedRelease: Release | null;
  uploadedWorks: Work[];
  onCreateRelease: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteRelease: (release: Release) => void;
  onFormChange: (form: ReleaseForm) => void;
  onReleaseCoverChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSelectRelease: (releaseId: string) => void;
  onToggleTrack: (trackId: string) => void;
}) {
  const selectedTrackIds = selectedRelease ? releaseTracks[selectedRelease.id] ?? [] : [];
  const selectedWorks = selectedTrackIds
    .map((trackId) => uploadedWorks.find((work) => work.id === trackId))
    .filter((work): work is Work => Boolean(work));

  return (
    <Panel className="mx-auto mt-6 max-w-[1680px] p-5">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="room-tiny text-acidGreen">Release system</p>
          <h2 className="mt-3 font-display text-2xl uppercase text-paperWhite">
            Albums, EPs & Sets
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-mutedText">
            Releases are proper collections now. Tracks stay as works; EPs and albums are ordered release objects linked through release_tracks.
          </p>
        </div>
        <StatusBadge status="selected">{releases.length} releases</StatusBadge>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <form className="border border-roomBorder bg-black p-4" onSubmit={onCreateRelease}>
          <p className="room-tiny">Create release</p>
          <div className="mt-4 grid gap-3">
            <label>
              <span className="room-label">Title</span>
              <Input
                onChange={(event) => onFormChange({ ...form, title: event.target.value })}
                placeholder="Concrete pressure EP"
                value={form.title}
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
              <label>
                <span className="room-label">Type</span>
                <Select
                  onChange={(event) => onFormChange({ ...form, releaseType: event.target.value as ReleaseType })}
                  value={form.releaseType}
                >
                  <option className="bg-black" value="single">Single</option>
                  <option className="bg-black" value="ep">EP</option>
                  <option className="bg-black" value="album">Album</option>
                  <option className="bg-black" value="set">DJ Set</option>
                </Select>
              </label>
              <label>
                <span className="room-label">Visibility</span>
                <Select
                  onChange={(event) => onFormChange({ ...form, visibility: event.target.value as "public" | "private" })}
                  value={form.visibility}
                >
                  <option className="bg-black" value="public">Public</option>
                  <option className="bg-black" value="private">Private</option>
                </Select>
              </label>
            </div>
            <label>
              <span className="room-label">Cover URL</span>
              <Input
                onChange={(event) => onFormChange({ ...form, coverImage: event.target.value })}
                placeholder="https://..."
                value={form.coverImage}
              />
            </label>
            <label>
              <span className="room-label">Upload cover</span>
              <Input accept="image/jpeg,image/png,image/webp,image/gif" onChange={onReleaseCoverChange} type="file" />
              {releaseCoverFile ? <p className="mt-2 text-xs text-mutedText">{releaseCoverFile.name}</p> : null}
            </label>
            <label>
              <span className="room-label">Description</span>
              <Textarea
                onChange={(event) => onFormChange({ ...form, description: event.target.value })}
                placeholder="Release note, room fit, label context..."
                value={form.description}
              />
            </label>
            <Button loading={isSaving} type="submit" variant="primary">
              Create Release
            </Button>
          </div>
        </form>

        <div className="grid gap-4">
          {releases.length === 0 ? (
            <EmptyState
              title="No releases yet"
              message="Create an EP, album, single, or set, then attach uploaded tracks."
            />
          ) : (
            <div className="grid gap-3 lg:grid-cols-3">
              {releases.map((release) => {
                const active = selectedRelease?.id === release.id;
                const count = releaseTracks[release.id]?.length ?? 0;
                return (
                  <button
                    className={cx(
                      "grid min-h-[148px] grid-cols-[76px_1fr] gap-3 border p-3 text-left transition",
                      active ? "border-acidGreen bg-[#101700]" : "border-roomBorder bg-black hover:border-paperWhite"
                    )}
                    key={release.id}
                    onClick={() => onSelectRelease(release.id)}
                    type="button"
                  >
                    <div
                      className="h-[76px] border border-roomBorder bg-inkPanel bg-cover bg-center"
                      style={{ backgroundImage: cssImageUrl(release.cover_image || "/room9-track-placeholder.svg") }}
                    />
                    <div className="min-w-0">
                      <StatusBadge status={active ? "selected" : "draft"}>{release.release_type}</StatusBadge>
                      <h3 className="mt-3 truncate font-display text-xl uppercase text-paperWhite">{release.title}</h3>
                      <p className="mt-1 font-mono text-[10px] uppercase text-mutedText">
                        {count} track{count === 1 ? "" : "s"} / {release.visibility}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {selectedRelease ? (
            <div className="border border-roomBorder bg-black p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="room-tiny">Selected release</p>
                  <h3 className="mt-2 font-display text-2xl uppercase text-paperWhite">{selectedRelease.title}</h3>
                  <p className="mt-1 font-mono text-[10px] uppercase text-mutedText">
                    {selectedRelease.release_type} / {selectedWorks.length} selected tracks
                  </p>
                </div>
                <Button onClick={() => onDeleteRelease(selectedRelease)} size="sm" type="button" variant="destructive">
                  Delete Release
                </Button>
                <ButtonLink href={`/release/${selectedRelease.id}`} size="sm" variant="secondary">
                  Open Public Release
                </ButtonLink>
              </div>
              <div className="mt-4 grid gap-2">
                {uploadedWorks.length === 0 ? (
                  <p className="text-sm text-mutedText">Upload tracks first, then attach them to this release.</p>
                ) : (
                  uploadedWorks.map((work) => {
                    const included = selectedTrackIds.includes(work.id);
                    return (
                      <button
                        className={cx(
                          "grid gap-3 border p-3 text-left transition md:grid-cols-[1fr_auto] md:items-center",
                          included ? "border-acidGreen bg-[#101700]" : "border-roomBorder bg-panelBlack hover:border-paperWhite"
                        )}
                        key={work.id}
                        onClick={() => onToggleTrack(work.id)}
                        type="button"
                      >
                        <div className="min-w-0">
                          <h4 className="truncate font-display text-base uppercase text-paperWhite">{work.title || "Untitled track"}</h4>
                          <p className="mt-1 font-mono text-[10px] uppercase text-mutedText">
                            {[work.genre, work.bpm ? `${work.bpm} BPM` : "", work.visibility].filter(Boolean).join(" / ")}
                          </p>
                        </div>
                        <span className={cx("font-mono text-[10px] uppercase", included ? "text-acidGreen" : "text-mutedText")}>
                          {included ? "In release" : "Add"}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

function PlaylistDetailsPanel({
  coverFile,
  isSaving,
  playlist,
  playlistCoverImage,
  playlistEditName,
  works,
  onCoverChange,
  onCoverImageChange,
  onDelete,
  onNameChange,
  onPlay,
  onRemoveTrack,
  onReorder,
  onSubmit
}: {
  coverFile: File | null;
  isSaving: boolean;
  playlist: VaultPlaylist | null;
  playlistCoverImage: string;
  playlistEditName: string;
  works: Work[];
  onCoverChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onCoverImageChange: (value: string) => void;
  onDelete: () => void;
  onNameChange: (value: string) => void;
  onPlay: () => void;
  onRemoveTrack: (trackId: string) => void;
  onReorder: (trackId: string, direction: "up" | "down") => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Panel className="mt-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="room-tiny">Selected playlist</p>
          <h3 className="mt-3 font-display text-2xl uppercase text-paperWhite">
            {playlist?.name || "No playlist selected"}
          </h3>
        </div>
        <div className="flex gap-2">
          <Button disabled={!playlist || works.length === 0} onClick={onPlay} size="sm" type="button" variant="secondary">
            Play Playlist
          </Button>
          <Button disabled={!playlist} onClick={onDelete} size="sm" type="button" variant="destructive">
            Delete
          </Button>
        </div>
      </div>

      <form className="mt-5 grid gap-4 lg:grid-cols-[132px_1fr]" onSubmit={onSubmit}>
        <div
          className="h-32 border border-roomBorder bg-inkPanel bg-cover bg-center"
          style={{ backgroundImage: cssImageUrl(playlistCoverImage || playlist?.coverImage || "/room9-track-placeholder.svg") }}
        />
        <div className="grid gap-3">
          <label>
            <span className="room-label">Playlist name</span>
            <Input disabled={!playlist} onChange={(event) => onNameChange(event.target.value)} value={playlistEditName} />
          </label>
          <label>
            <span className="room-label">Cover image URL</span>
            <Input disabled={!playlist} onChange={(event) => onCoverImageChange(event.target.value)} placeholder="https://..." value={playlistCoverImage} />
          </label>
          <label>
            <span className="room-label">Upload playlist cover</span>
            <Input accept="image/jpeg,image/png,image/webp,image/gif" disabled={!playlist} onChange={onCoverChange} type="file" />
            {coverFile ? <p className="mt-2 text-xs text-mutedText">{coverFile.name}</p> : null}
          </label>
          <Button disabled={!playlist} loading={isSaving} size="sm" type="submit" variant="secondary">
            Save Playlist Details
          </Button>
        </div>
      </form>

      <div className="mt-5 border-t border-roomBorder pt-4">
        <p className="room-tiny">Track order</p>
        <div className="mt-3 space-y-2">
          {works.length === 0 ? (
            <p className="text-sm text-mutedText">No tracks inside yet. Use Add Playlist on any track row.</p>
          ) : (
            works.map((work, index) => (
              <div className="grid gap-3 border border-roomBorder bg-black p-3 md:grid-cols-[1fr_auto] md:items-center" key={work.id}>
                <div className="min-w-0">
                  <h4 className="truncate font-display text-lg uppercase text-paperWhite">
                    {index + 1}. {work.title || "Untitled"}
                  </h4>
                  <p className="mt-1 font-mono text-[10px] uppercase text-mutedText">
                    {[work.genre, work.bpm ? `${work.bpm} BPM` : ""].filter(Boolean).join(" / ") || "Playlist track"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button disabled={index === 0} onClick={() => onReorder(work.id, "up")} size="sm" type="button" variant="ghost">
                    Up
                  </Button>
                  <Button disabled={index === works.length - 1} onClick={() => onReorder(work.id, "down")} size="sm" type="button" variant="ghost">
                    Down
                  </Button>
                  <Button onClick={() => onRemoveTrack(work.id)} size="sm" type="button" variant="destructive">
                    Remove
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Panel>
  );
}

function buildPlayerQueue(works: Work[], djLookup: Record<string, DjProfile>): AudioPlayerTrack[] {
  return works
    .filter((work) => Boolean(work.link))
    .map((work) => {
      const dj = djLookup[work.dj_id];
      return {
        id: work.id,
        title: work.title || "Untitled track",
        artist: dj?.stage_name || "ROOM_9 Artist",
        src: work.link || "",
        djId: work.dj_id,
        coverUrl: getWorkCoverUrl(work, dj),
        description: [work.genre, work.bpm ? `${work.bpm} BPM` : "", dj?.city].filter(Boolean).join(" / "),
        durationSeconds: work.duration_seconds
      };
    });
}

function collectVaultWorkIds(
  favoriteIds: string[],
  historyIds: string[],
  playlists: VaultPlaylist[],
  savedMoments: VaultSavedMoment[]
) {
  return Array.from(
    new Set([
      ...favoriteIds,
      ...historyIds,
      ...savedMoments.map((moment) => moment.trackId),
      ...playlists.flatMap((playlist) => playlist.trackIds)
    ])
  );
}

function mergeWorks(works: Work[]) {
  const byId = new Map<string, Work>();
  works.forEach((work) => {
    if (!work.is_deleted) {
      byId.set(work.id, work);
    }
  });
  return Array.from(byId.values());
}

function normalizeVaultMode(value: string | null): VaultMode | null {
  if (!value) {
    return null;
  }

  return vaultModes.some((mode) => mode.id === value) ? (value as VaultMode) : null;
}

function getVaultTabForMode(mode: VaultMode): VaultTab {
  return vaultModes.find((item) => item.id === mode)?.tab ?? "saved-moments";
}

function mapReleaseTracks(rows: Array<{ release_id: string; work_id: string }> | null) {
  return ((rows ?? [])).reduce<Record<string, string[]>>((acc, row) => {
    acc[row.release_id] = [...(acc[row.release_id] ?? []), row.work_id];
    return acc;
  }, {});
}

function isUuidLike(value: string | null | undefined) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}
