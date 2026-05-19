"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { formatAudioTime, type AudioPlayerTrack, useAudioPlayer } from "@/components/GlobalAudioPlayer";
import { BookmarkGlyph, CheckGlyph, HeartGlyph, PlaylistGlyph, QueueGlyph, XGlyph } from "@/components/room9-icons";
import { Button, StatusBadge, cx } from "@/components/room9-ui";
import {
  VAULT_FAVORITES_EVENT,
  VAULT_PLAYLISTS_EVENT,
  createVaultPlaylist,
  readVaultPlaylists,
  readVaultSavedTrackIds,
  saveVaultMoment,
  toggleVaultSavedTrackId,
  toggleVaultTrackInPlaylist,
  type VaultPlaylist
} from "@/lib/soundVault";
import { getSupabase, hasSupabaseConfig, isMissingAuthSession, logSupabaseError } from "@/lib/supabase";

export type TrackActionTrack = AudioPlayerTrack & {
  bpm?: string | number | null;
  genre?: string | null;
};

export type TrackActionMoment = {
  djId?: string | null;
  energy?: string | null;
  momentLabel: string;
  roomType?: string | null;
  timestamp: number;
  timestampLabel?: string;
};

export function TrackActionMenu({
  className,
  compact = false,
  moment,
  onNotice,
  track
}: {
  className?: string;
  compact?: boolean;
  moment?: TrackActionMoment | null;
  onNotice?: (message: string) => void;
  track: TrackActionTrack;
}) {
  const player = useAudioPlayer();
  const [open, setOpen] = useState(false);
  const [musicScope, setMusicScope] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<VaultPlaylist[]>([]);
  const [savedTrackIds, setSavedTrackIds] = useState<string[]>([]);
  const [isWorking, setIsWorking] = useState(false);
  const [scopeReady, setScopeReady] = useState(!hasSupabaseConfig());

  useEffect(() => {
    let mounted = true;

    async function loadScope() {
      if (!hasSupabaseConfig()) {
        const [ids, loadedPlaylists] = await Promise.all([readVaultSavedTrackIds(), readVaultPlaylists()]);
        if (mounted) {
          setSavedTrackIds(ids);
          setPlaylists(loadedPlaylists);
          setScopeReady(true);
        }
        return;
      }

      try {
        const { data, error } = await getSupabase().auth.getSession();
        if (error && !isMissingAuthSession(error)) {
          logSupabaseError("Track action scope load failed", error);
        }

        const scope = data.session?.user?.id ?? null;
        const [ids, loadedPlaylists] = await Promise.all([readVaultSavedTrackIds(scope), readVaultPlaylists(scope)]);
        if (mounted) {
          setMusicScope(scope);
          setSavedTrackIds(ids);
          setPlaylists(loadedPlaylists);
          setScopeReady(true);
        }
      } catch (error) {
        logSupabaseError("Track action scope crashed", error);
        const [ids, loadedPlaylists] = await Promise.all([readVaultSavedTrackIds(), readVaultPlaylists()]);
        if (mounted) {
          setSavedTrackIds(ids);
          setPlaylists(loadedPlaylists);
          setScopeReady(true);
        }
      }
    }

    loadScope();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    function handleFavoritesChange(event: Event) {
      const detail = (event as CustomEvent<{ scope?: string | null; trackIds?: string[] }>).detail;
      if (musicScope && detail?.scope && detail.scope !== musicScope) {
        return;
      }
      if (Array.isArray(detail?.trackIds)) {
        setSavedTrackIds(detail.trackIds);
      }
    }

    function handlePlaylistsChange(event: Event) {
      const detail = (event as CustomEvent<{ playlists?: VaultPlaylist[]; scope?: string | null }>).detail;
      if (musicScope && detail?.scope && detail.scope !== musicScope) {
        return;
      }
      if (Array.isArray(detail?.playlists)) {
        setPlaylists(detail.playlists);
      }
    }

    window.addEventListener(VAULT_FAVORITES_EVENT, handleFavoritesChange);
    window.addEventListener(VAULT_PLAYLISTS_EVENT, handlePlaylistsChange);
    return () => {
      window.removeEventListener(VAULT_FAVORITES_EVENT, handleFavoritesChange);
      window.removeEventListener(VAULT_PLAYLISTS_EVENT, handlePlaylistsChange);
    };
  }, [musicScope]);

  const isLiked = savedTrackIds.includes(track.id);
  const currentPlaylistIds = useMemo(
    () => playlists.filter((playlist) => playlist.trackIds.includes(track.id)).map((playlist) => playlist.id),
    [playlists, track.id]
  );

  async function toggleLike() {
    setIsWorking(true);
    try {
      const next = await toggleVaultSavedTrackId(track.id, musicScope);
      const nextLiked = next.includes(track.id);
      setSavedTrackIds(next);
      if (nextLiked) {
        await createActionNotification("track_saved", "Track saved", `${track.title} added to your Sound Vault.`);
      }
      onNotice?.(nextLiked ? "Track saved to favorites." : "Track removed from favorites.");
    } catch (error) {
      logSupabaseError("Track action favorite toggle failed", error);
      onNotice?.("Could not update liked tracks. Retry from Sound Vault.");
    } finally {
      setIsWorking(false);
    }
  }

  async function saveMoment() {
    const isCurrentTrack = player.currentTrack?.id === track.id;
    const liveTimestamp =
      isCurrentTrack && Number.isFinite(player.currentTime)
        ? Math.max(0, Math.round(player.selectedTimestamp ?? player.currentTime))
        : null;
    const safeLiveTimestamp =
      liveTimestamp !== null && track.durationSeconds
        ? Math.min(liveTimestamp, Math.max(0, Math.floor(track.durationSeconds)))
        : liveTimestamp;
    const effectiveMoment =
      moment ??
      (isCurrentTrack && safeLiveTimestamp !== null
        ? {
            djId: track.djId,
            energy: "High",
            momentLabel: player.selectedTimestamp !== null ? "Selected Moment" : "Current Cue",
            roomType: "Warehouse",
            timestamp: safeLiveTimestamp,
            timestampLabel: formatAudioTime(safeLiveTimestamp)
          }
        : null);

    if (!effectiveMoment) {
      onNotice?.("Start this track first, then save the current cue as a reference.");
      return;
    }

    setIsWorking(true);
    try {
      await saveVaultMoment(
        {
          djId: effectiveMoment.djId ?? track.djId,
          trackId: track.id,
          trackTitle: track.title,
          artist: track.artist,
          timestamp: effectiveMoment.timestamp,
          timestampLabel: effectiveMoment.timestampLabel ?? formatAudioTime(effectiveMoment.timestamp),
          momentLabel: effectiveMoment.momentLabel,
          bpm: track.bpm ? String(track.bpm) : null,
          energy: effectiveMoment.energy,
          roomType: effectiveMoment.roomType
        },
        musicScope
      );
      onNotice?.(`Saved ${effectiveMoment.timestampLabel ?? formatAudioTime(effectiveMoment.timestamp)} as an atmosphere brief.`);
    } catch (error) {
      logSupabaseError("Track action saved reference failed", error);
      onNotice?.("Could not save this reference. Retry from the Track Page.");
    } finally {
      setIsWorking(false);
    }
  }

  async function createPlaylistAndAdd() {
    setIsWorking(true);
    try {
      const next = await createVaultPlaylist("Room selection", musicScope);
      const created = next[0];
      if (created) {
        const updated = await toggleVaultTrackInPlaylist(created.id, track.id, musicScope);
        setPlaylists(updated);
      } else {
        setPlaylists(next);
      }
      onNotice?.("Playlist created and track added.");
    } catch (error) {
      logSupabaseError("Track action playlist create/add failed", error);
      onNotice?.("Could not create playlist. Open Sound Vault and retry.");
    } finally {
      setIsWorking(false);
    }
  }

  async function togglePlaylist(playlistId: string) {
    setIsWorking(true);
    try {
      const next = await toggleVaultTrackInPlaylist(playlistId, track.id, musicScope);
      setPlaylists(next);
      const playlist = next.find((item) => item.id === playlistId);
      onNotice?.(playlist?.trackIds.includes(track.id) ? "Track added to playlist." : "Track removed from playlist.");
    } catch (error) {
      logSupabaseError("Track action playlist toggle failed", error);
      onNotice?.("Could not update playlist. Retry from Sound Vault.");
    } finally {
      setIsWorking(false);
    }
  }

  function addToQueue() {
    if (!track.src) {
      onNotice?.("This track has no audio URL yet.");
      return;
    }

    player.addToQueue(track);
    onNotice?.("Track added to queue.");
  }

  async function createActionNotification(type: string, title: string, body: string) {
    if (!musicScope || !hasSupabaseConfig()) {
      return;
    }

    try {
      const { error } = await getSupabase().from("notifications").insert({
        user_id: musicScope,
        type,
        title,
        body
      });

      if (error) {
        logSupabaseError("Track action notification failed", error);
      }
    } catch (error) {
      logSupabaseError("Track action notification crashed", error);
    }
  }

  return (
    <div
      className={cx("relative inline-flex", className)}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <Button
        active={open || currentPlaylistIds.length > 0}
        disabled={isWorking || !scopeReady}
        onClick={() => setOpen((current) => !current)}
        size={compact ? "sm" : "md"}
        type="button"
        variant="secondary"
      >
        <PlaylistGlyph className="h-4 w-4" />
        {compact ? "Actions" : "Add to Playlist"}
      </Button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[310px] border border-strongBorder bg-black p-room-2 shadow-[0_16px_60px_rgba(0,0,0,0.55)]">
          <div className="flex items-start justify-between gap-room-2 border-b border-roomBorder pb-room-2">
            <div className="min-w-0">
              <p className="room-tiny text-acidGreen">Track menu</p>
              <p className="mt-1 truncate font-display text-lg uppercase text-paperWhite">{track.title}</p>
            </div>
            <button className="room-tiny text-mutedText hover:text-paperWhite" onClick={() => setOpen(false)} type="button">
              Close
            </button>
          </div>

          <div className="mt-room-2 grid gap-room-1">
            <MenuButton active={isLiked} disabled={!scopeReady} icon={<HeartGlyph className="h-4 w-4" filled={isLiked} />} label={isLiked ? "Liked" : "Like"} onClick={toggleLike} />
            <MenuButton
              disabled={!(moment || player.currentTrack?.id === track.id) || !scopeReady}
              icon={<BookmarkGlyph className="h-4 w-4" />}
              label="Save Reference"
              onClick={saveMoment}
            />
            <MenuButton disabled={!track.src} icon={<QueueGlyph className="h-4 w-4" />} label="Add to Queue" onClick={addToQueue} />
          </div>

          <div className="mt-room-3 border-t border-roomBorder pt-room-2">
            <div className="flex items-center justify-between gap-room-2">
              <p className="room-tiny">Playlists</p>
              <StatusBadge status={playlists.length > 0 ? "selected" : "draft"}>{playlists.length}</StatusBadge>
            </div>
            <div className="mt-room-2 space-y-room-1">
              {playlists.length === 0 ? (
                <Button className="w-full justify-center" disabled={isWorking || !scopeReady} onClick={createPlaylistAndAdd} size="sm" type="button" variant="primary">
                  Create Room Selection
                </Button>
              ) : (
                playlists.slice(0, 6).map((playlist) => {
                  const selected = playlist.trackIds.includes(track.id);
                  return (
                    <button
                      className={cx(
                        "grid w-full grid-cols-[1fr_auto] items-center gap-room-2 border px-room-2 py-room-2 text-left font-mono text-[10px] uppercase transition",
                        selected
                          ? "border-acidGreen bg-[#121d05] text-acidGreen"
                          : "border-roomBorder bg-panelBlack text-paperWhite hover:border-paperWhite"
                      )}
                      disabled={isWorking || !scopeReady}
                      key={playlist.id}
                      onClick={() => togglePlaylist(playlist.id)}
                      type="button"
                    >
                      <span>
                        <span className="block truncate">{playlist.name}</span>
                        <span className="mt-1 block text-mutedText">
                          {playlist.trackIds.length} track{playlist.trackIds.length === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        {selected ? <CheckGlyph className="h-3.5 w-3.5" /> : <PlaylistGlyph className="h-3.5 w-3.5" />}
                        {selected ? "Added" : "Add"}
                      </span>
                    </button>
                  );
                })
              )}
              {playlists.length > 0 ? (
                <Button className="w-full justify-center" disabled={isWorking || !scopeReady} onClick={createPlaylistAndAdd} size="sm" type="button" variant="ghost">
                  New Playlist + Add
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MenuButton({
  active = false,
  disabled = false,
  icon,
  label,
  onClick
}: {
  active?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cx(
        "flex min-h-9 items-center justify-between border px-room-2 font-mono text-[10px] uppercase transition disabled:cursor-not-allowed disabled:opacity-35",
        active ? "border-acidGreen bg-acidGreen text-black" : "border-roomBorder bg-panelBlack text-paperWhite hover:border-paperWhite"
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="inline-flex items-center gap-room-1">
        {icon}
        {label}
      </span>
      <span>{active ? <CheckGlyph className="h-3.5 w-3.5" /> : <XGlyph className="h-3.5 w-3.5 rotate-45" />}</span>
    </button>
  );
}
