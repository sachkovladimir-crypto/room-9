import {
  createLocalPlaylist,
  deleteLocalPlaylist,
  moveTrackInPlaylist,
  readFavoriteTrackIds,
  readListeningHistoryIds,
  readPlaylists,
  readSavedMoments,
  recordListeningHistory,
  removeSavedMoment,
  saveLocalMoment,
  toggleFavoriteTrackId,
  toggleTrackInPlaylist,
  updateLocalPlaylist,
  writeFavoriteTrackIds,
  writePlaylists,
  writeSavedMoments,
  type LocalPlaylist,
  type LocalSavedMoment
} from "@/lib/localMusic";
import {
  formatSupabaseError,
  getSupabase,
  hasSupabaseConfig,
  isMissingAuthSession,
  logSupabaseError
} from "@/lib/supabase";
import { trackUserInteraction } from "@/lib/interactions";

export type VaultPlaylist = LocalPlaylist;
export type VaultSavedMoment = LocalSavedMoment;

type SavedMomentRow = {
  id: string;
  user_id: string;
  work_id: string;
  dj_id: string | null;
  timestamp_seconds: number;
  timestamp_label: string | null;
  moment_label: string | null;
  energy: string | null;
  room_type: string | null;
  notes: string | null;
  status: LocalSavedMoment["status"] | null;
  created_at: string;
};

type PlaylistRow = {
  id: string;
  name: string;
  description: string | null;
  cover_image: string | null;
  created_at: string;
  updated_at: string | null;
};

type PlaylistTrackRow = {
  playlist_id: string;
  work_id: string;
  position: number | null;
};

export const VAULT_FAVORITES_EVENT = "room9:vault-favorites";
export const VAULT_PLAYLISTS_EVENT = "room9:vault-playlists";
export const VAULT_MOMENTS_EVENT = "room9:vault-moments";

function emitVaultFavorites(trackIds: string[], scope?: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(VAULT_FAVORITES_EVENT, { detail: { scope: scope ?? null, trackIds } }));
}

function emitVaultPlaylists(playlists: LocalPlaylist[], scope?: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(VAULT_PLAYLISTS_EVENT, { detail: { playlists, scope: scope ?? null } }));
}

function emitVaultMoments(moments: LocalSavedMoment[], scope?: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(VAULT_MOMENTS_EVENT, { detail: { moments, scope: scope ?? null } }));
}

function mapPlaylistRow(playlist: PlaylistRow): LocalPlaylist {
  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    coverImage: playlist.cover_image,
    trackIds: [],
    createdAt: playlist.created_at,
    updatedAt: playlist.updated_at ?? playlist.created_at
  };
}

function sortVaultPlaylists(playlists: LocalPlaylist[]) {
  return [...playlists].sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt).getTime();
    return bTime - aTime;
  });
}

function toggleLocalFavoriteAndEmit(trackId: string, scope?: string | null) {
  const next = toggleFavoriteTrackId(trackId, scope);
  emitVaultFavorites(next, scope);
  return next;
}

async function getUserId(scope?: string | null) {
  if (scope) {
    return scope;
  }

  if (!hasSupabaseConfig()) {
    return null;
  }

  try {
    const { data, error } = await getSupabase().auth.getSession();
    if (error && !isMissingAuthSession(error)) {
      logSupabaseError("Sound Vault session lookup failed", error);
    }

    return data.session?.user?.id ?? null;
  } catch (error) {
    logSupabaseError("Sound Vault session lookup crashed", error);
    return null;
  }
}

export async function readVaultSavedTrackIds(scope?: string | null) {
  const userId = await getUserId(scope);
  if (!userId) {
    return readFavoriteTrackIds(scope);
  }

  try {
    const { data, error } = await getSupabase()
      .from("saved_tracks")
      .select("work_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(240);

    if (error) {
      logSupabaseError("Sound Vault saved tracks load failed", error);
      return readFavoriteTrackIds(userId);
    }

    const remoteIds = Array.from(new Set(((data as Array<{ work_id: string }> | null) ?? []).map((row) => row.work_id)));
    writeFavoriteTrackIds(remoteIds, userId);
    return remoteIds;
  } catch (error) {
    logSupabaseError("Sound Vault saved tracks unexpected failure", error);
    return readFavoriteTrackIds(userId);
  }
}

export async function toggleVaultSavedTrackId(trackId: string, scope?: string | null) {
  const userId = await getUserId(scope);
  if (!userId) {
    return toggleLocalFavoriteAndEmit(trackId, scope);
  }

  try {
    const { data, error: selectError } = await getSupabase()
      .from("saved_tracks")
      .select("id")
      .eq("user_id", userId)
      .eq("work_id", trackId)
      .maybeSingle();

    if (selectError) {
      logSupabaseError("Sound Vault saved track select failed", selectError);
      return toggleLocalFavoriteAndEmit(trackId, userId);
    }

    if (data?.id) {
      const { error } = await getSupabase().from("saved_tracks").delete().eq("id", data.id);
      if (error) {
        logSupabaseError("Sound Vault saved track delete failed", error);
        return toggleLocalFavoriteAndEmit(trackId, userId);
      }
      trackUserInteraction({
        interactionType: "remove_saved_track",
        metadata: { action: "toggle_saved_track" },
        scope: userId,
        workId: trackId
      });
    } else {
      const { error } = await getSupabase().from("saved_tracks").insert({ user_id: userId, work_id: trackId });
      if (error) {
        logSupabaseError("Sound Vault saved track insert failed", error);
        return toggleLocalFavoriteAndEmit(trackId, userId);
      }
      trackUserInteraction({
        interactionType: "save_track",
        metadata: { action: "toggle_saved_track" },
        scope: userId,
        workId: trackId
      });
    }

    const next = await readVaultSavedTrackIds(userId);
    writeFavoriteTrackIds(next, userId);
    emitVaultFavorites(next, userId);
    return next;
  } catch (error) {
    logSupabaseError("Sound Vault saved track toggle crashed", error);
    return toggleLocalFavoriteAndEmit(trackId, userId);
  }
}

export async function recordVaultListeningHistory(trackId: string, scope?: string | null) {
  const userId = await getUserId(scope);
  const localNext = recordListeningHistory(trackId, userId ?? scope);
  if (!userId) {
    return localNext;
  }

  try {
    const { error } = await getSupabase()
      .from("listening_history")
      .insert({ user_id: userId, work_id: trackId, position_seconds: 0 });

    if (error) {
      logSupabaseError("Sound Vault listening history insert failed", error);
    } else {
      trackUserInteraction({
        interactionType: "play",
        metadata: { source: "listening_history" },
        scope: userId,
        workId: trackId
      });
    }
  } catch (error) {
    logSupabaseError("Sound Vault listening history crashed", error);
  }

  return localNext;
}

export async function readVaultListeningHistoryIds(scope?: string | null) {
  const userId = await getUserId(scope);
  if (!userId) {
    return readListeningHistoryIds(scope);
  }

  try {
    const { data, error } = await getSupabase()
      .from("listening_history")
      .select("work_id, played_at")
      .eq("user_id", userId)
      .order("played_at", { ascending: false })
      .limit(80);

    if (error) {
      logSupabaseError("Sound Vault listening history load failed", error);
      return readListeningHistoryIds(userId);
    }

    return Array.from(
      new Set(((data as Array<{ work_id: string }> | null) ?? []).map((row) => row.work_id))
    ).slice(0, 40);
  } catch (error) {
    logSupabaseError("Sound Vault listening history crashed", error);
    return readListeningHistoryIds(userId);
  }
}

export async function readVaultPlaylists(scope?: string | null): Promise<LocalPlaylist[]> {
  const userId = await getUserId(scope);
  if (!userId) {
    return readPlaylists(scope);
  }

  try {
    const { data: playlistRows, error: playlistError } = await getSupabase()
      .from("playlists")
      .select("id, name, description, cover_image, created_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(60);

    if (playlistError) {
      logSupabaseError("Sound Vault playlists load failed", playlistError);
      return readPlaylists(userId);
    }

    const playlists = sortVaultPlaylists(((playlistRows as PlaylistRow[] | null) ?? []).map(mapPlaylistRow));

    if (playlists.length === 0) {
      writePlaylists([], userId);
      return [];
    }

    const { data: trackRows, error: tracksError } = await getSupabase()
      .from("playlist_tracks")
      .select("playlist_id, work_id, position")
      .in("playlist_id", playlists.map((playlist) => playlist.id))
      .order("position", { ascending: true })
      .limit(600);

    if (tracksError) {
      logSupabaseError("Sound Vault playlist tracks load failed", tracksError);
      writePlaylists(playlists, userId);
      return playlists;
    }

    const tracksByPlaylist = ((trackRows as PlaylistTrackRow[] | null) ?? []).reduce<Record<string, string[]>>(
      (acc, row) => {
        acc[row.playlist_id] = [...(acc[row.playlist_id] ?? []), row.work_id];
        return acc;
      },
      {}
    );

    const next = sortVaultPlaylists(playlists.map((playlist) => ({
      ...playlist,
      trackIds: Array.from(new Set(tracksByPlaylist[playlist.id] ?? []))
    })));
    writePlaylists(next, userId);
    return next;
  } catch (error) {
    logSupabaseError("Sound Vault playlists crashed", error);
    return readPlaylists(userId);
  }
}

export async function createVaultPlaylist(name: string, scope?: string | null) {
  const userId = await getUserId(scope);
  if (!userId) {
    const next = createLocalPlaylist(name, scope);
    emitVaultPlaylists(next, scope);
    return next;
  }

  try {
    const { data, error } = await getSupabase()
      .from("playlists")
      .insert({ user_id: userId, name: name.trim() || "Untitled playlist", visibility: "private" })
      .select("id, name, description, cover_image, created_at, updated_at")
      .single();

    if (error) {
      logSupabaseError("Sound Vault playlist create failed", error);
      const next = createLocalPlaylist(name, userId);
      emitVaultPlaylists(next, userId);
      return next;
    }

    const created = data ? mapPlaylistRow(data as PlaylistRow) : null;
    const loaded = await readVaultPlaylists(userId);
    const next = created
      ? [created, ...loaded.filter((playlist) => playlist.id !== created.id)]
      : loaded;
    writePlaylists(next, userId);
    emitVaultPlaylists(next, userId);
    trackUserInteraction({
      interactionType: "create_playlist",
      metadata: { playlist_id: created?.id ?? null, playlist_name: name.trim() || "Untitled playlist" },
      scope: userId
    });
    return next;
  } catch (error) {
    logSupabaseError("Sound Vault playlist create crashed", error);
    const next = createLocalPlaylist(name, userId);
    emitVaultPlaylists(next, userId);
    return next;
  }
}

export async function deleteVaultPlaylist(playlistId: string, scope?: string | null) {
  const userId = await getUserId(scope);
  const localNext = deleteLocalPlaylist(playlistId, userId ?? scope);
  if (!userId) {
    emitVaultPlaylists(localNext, scope);
    return localNext;
  }

  try {
    const { error } = await getSupabase()
      .from("playlists")
      .delete()
      .eq("id", playlistId)
      .eq("user_id", userId);

    if (error) {
      logSupabaseError("Sound Vault playlist delete failed", error);
      emitVaultPlaylists(localNext, userId);
      return localNext;
    }

    const next = await readVaultPlaylists(userId);
    emitVaultPlaylists(next, userId);
    return next;
  } catch (error) {
    logSupabaseError("Sound Vault playlist delete crashed", error);
    emitVaultPlaylists(localNext, userId);
    return localNext;
  }
}

export async function updateVaultPlaylist(
  playlistId: string,
  updates: Partial<Pick<LocalPlaylist, "coverImage" | "description" | "name">>,
  scope?: string | null
) {
  const userId = await getUserId(scope);
  const localNext = updateLocalPlaylist(playlistId, updates, userId ?? scope);
  if (!userId) {
    emitVaultPlaylists(localNext, scope);
    return localNext;
  }

  try {
    const payload: { cover_image?: string | null; description?: string | null; name?: string; updated_at: string } = {
      updated_at: new Date().toISOString()
    };
    if ("coverImage" in updates) {
      payload.cover_image = updates.coverImage || null;
    }
    if ("description" in updates) {
      payload.description = updates.description || null;
    }
    if ("name" in updates && updates.name?.trim()) {
      payload.name = updates.name.trim();
    }

    const { error } = await getSupabase()
      .from("playlists")
      .update(payload)
      .eq("id", playlistId)
      .eq("user_id", userId);

    if (error) {
      logSupabaseError("Sound Vault playlist update failed", error);
      emitVaultPlaylists(localNext, userId);
      return localNext;
    }

    const next = await readVaultPlaylists(userId);
    emitVaultPlaylists(next, userId);
    return next;
  } catch (error) {
    logSupabaseError("Sound Vault playlist update crashed", error);
    emitVaultPlaylists(localNext, userId);
    return localNext;
  }
}

export async function toggleVaultTrackInPlaylist(playlistId: string, trackId: string, scope?: string | null) {
  const userId = await getUserId(scope);
  if (!userId) {
    const next = toggleTrackInPlaylist(playlistId, trackId, scope);
    emitVaultPlaylists(next, scope);
    return next;
  }

  try {
    const ownsPlaylist = await canManageRemotePlaylist(playlistId, userId);
    if (!ownsPlaylist) {
      const next = await readVaultPlaylists(userId);
      emitVaultPlaylists(next, userId);
      return next;
    }

    const { data, error: selectError } = await getSupabase()
      .from("playlist_tracks")
      .select("playlist_id, work_id")
      .eq("playlist_id", playlistId)
      .eq("work_id", trackId)
      .maybeSingle();

    if (selectError) {
      logSupabaseError("Sound Vault playlist track select failed", selectError);
      const next = toggleTrackInPlaylist(playlistId, trackId, userId);
      emitVaultPlaylists(next, userId);
      return next;
    }

    if (data?.work_id) {
      const { error } = await getSupabase()
        .from("playlist_tracks")
        .delete()
        .eq("playlist_id", playlistId)
        .eq("work_id", trackId);
      if (error) {
        logSupabaseError("Sound Vault playlist track delete failed", error);
        const next = toggleTrackInPlaylist(playlistId, trackId, userId);
        emitVaultPlaylists(next, userId);
        return next;
      }
      trackUserInteraction({
        interactionType: "remove_from_playlist",
        metadata: { playlist_id: playlistId },
        scope: userId,
        workId: trackId
      });
    } else {
      const { data: existing } = await getSupabase()
        .from("playlist_tracks")
        .select("work_id")
        .eq("playlist_id", playlistId);
      const position = Array.isArray(existing) ? existing.length : 0;
      const { error } = await getSupabase()
        .from("playlist_tracks")
        .insert({ playlist_id: playlistId, work_id: trackId, position });

      if (error) {
        logSupabaseError("Sound Vault playlist track insert failed", error);
        const next = toggleTrackInPlaylist(playlistId, trackId, userId);
        emitVaultPlaylists(next, userId);
        return next;
      }
      trackUserInteraction({
        interactionType: "add_to_playlist",
        metadata: { playlist_id: playlistId, position },
        scope: userId,
        workId: trackId
      });
    }

    const next = await readVaultPlaylists(userId);
    emitVaultPlaylists(next, userId);
    return next;
  } catch (error) {
    logSupabaseError("Sound Vault playlist track toggle crashed", error);
    const next = toggleTrackInPlaylist(playlistId, trackId, userId);
    emitVaultPlaylists(next, userId);
    return next;
  }
}

export async function moveVaultTrackInPlaylist(
  playlistId: string,
  trackId: string,
  direction: "up" | "down",
  scope?: string | null
) {
  const userId = await getUserId(scope);
  if (!userId) {
    const localNext = moveTrackInPlaylist(playlistId, trackId, direction, scope);
    emitVaultPlaylists(localNext, scope);
    return localNext;
  }

  try {
    const ownsPlaylist = await canManageRemotePlaylist(playlistId, userId);
    if (!ownsPlaylist) {
      const next = await readVaultPlaylists(userId);
      emitVaultPlaylists(next, userId);
      return next;
    }

    const localNext = moveTrackInPlaylist(playlistId, trackId, direction, userId);
    const targetPlaylist = localNext.find((playlist) => playlist.id === playlistId);
    if (!targetPlaylist) {
      emitVaultPlaylists(localNext, userId);
      return localNext;
    }

    const updates = await Promise.all(
      targetPlaylist.trackIds.map((workId, position) =>
        getSupabase()
          .from("playlist_tracks")
          .update({ position })
          .eq("playlist_id", playlistId)
          .eq("work_id", workId)
      )
    );
    const updateError = updates.find((result) => result.error)?.error;
    if (updateError) {
      logSupabaseError("Sound Vault playlist reorder update failed", updateError);
      emitVaultPlaylists(localNext, userId);
      return localNext;
    }

    const next = await readVaultPlaylists(userId);
    emitVaultPlaylists(next, userId);
    return next;
  } catch (error) {
    logSupabaseError("Sound Vault playlist reorder crashed", error);
    const localNext = moveTrackInPlaylist(playlistId, trackId, direction, userId);
    emitVaultPlaylists(localNext, userId);
    return localNext;
  }
}

async function canManageRemotePlaylist(playlistId: string, userId: string) {
  try {
    const { data, error } = await getSupabase()
      .from("playlists")
      .select("id")
      .eq("id", playlistId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      logSupabaseError("Sound Vault playlist ownership check failed", error);
      return false;
    }

    return Boolean(data?.id);
  } catch (error) {
    logSupabaseError("Sound Vault playlist ownership check crashed", error);
    return false;
  }
}

export async function readVaultSavedMoments(scope?: string | null): Promise<LocalSavedMoment[]> {
  const userId = await getUserId(scope);
  if (!userId) {
    return readSavedMoments(scope);
  }

  try {
    const { data, error } = await getSupabase()
      .from("saved_moments")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(160);

    if (error) {
      logSupabaseError("Sound Vault saved references load failed", error);
      return readSavedMoments(userId);
    }

    const rows = (data as SavedMomentRow[] | null) ?? [];
    const workIds = Array.from(new Set(rows.map((row) => row.work_id)));
    const djIds = Array.from(new Set(rows.map((row) => row.dj_id).filter((id): id is string => Boolean(id))));

    const [{ data: workRows }, { data: djRows }] = await Promise.all([
      workIds.length > 0
        ? getSupabase().from("works").select("id, title, bpm").in("id", workIds.slice(0, 160))
        : Promise.resolve({ data: [] }),
      djIds.length > 0
        ? getSupabase().from("dj_profiles").select("id, stage_name").in("id", djIds.slice(0, 120))
        : Promise.resolve({ data: [] })
    ]);

    const workLookup = ((workRows as Array<{ id: string; title: string | null; bpm: string | null }> | null) ?? []).reduce<
      Record<string, { title: string | null; bpm: string | null }>
    >((acc, work) => {
      acc[work.id] = { title: work.title, bpm: work.bpm };
      return acc;
    }, {});
    const djLookup = ((djRows as Array<{ id: string; stage_name: string | null }> | null) ?? []).reduce<
      Record<string, { stage_name: string | null }>
    >((acc, dj) => {
      acc[dj.id] = { stage_name: dj.stage_name };
      return acc;
    }, {});

    const moments = rows.map((row) => mapSavedMomentRow(row, workLookup[row.work_id], row.dj_id ? djLookup[row.dj_id] : undefined));
    writeSavedMoments(moments, userId);
    emitVaultMoments(moments, userId);
    return moments;
  } catch (error) {
    logSupabaseError("Sound Vault saved references crashed", error);
    return readSavedMoments(userId);
  }
}

export async function saveVaultMoment(
  moment: Omit<LocalSavedMoment, "id" | "createdAt" | "status"> & {
    status?: LocalSavedMoment["status"];
  },
  scope?: string | null
) {
  const userId = await getUserId(scope);
  const localMoments = saveLocalMoment(moment, userId ?? scope);

  if (!userId) {
    emitVaultMoments(localMoments, scope);
    return localMoments;
  }

  try {
    const { error } = await getSupabase()
      .from("saved_moments")
      .upsert(
        {
          user_id: userId,
          work_id: moment.trackId,
          dj_id: moment.djId ?? null,
          timestamp_seconds: Math.round(moment.timestamp),
          timestamp_label: moment.timestampLabel,
          moment_label: moment.momentLabel,
          energy: moment.energy ?? null,
          room_type: moment.roomType ?? null,
          status: moment.status ?? "saved",
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id,work_id,timestamp_seconds" }
      );

    if (error) {
      logSupabaseError("Sound Vault saved reference upsert failed", error);
      emitVaultMoments(localMoments, userId);
      return localMoments;
    }

    const next = await readVaultSavedMoments(userId);
    emitVaultMoments(next, userId);
    trackUserInteraction({
      djId: moment.djId,
      interactionType: "save_moment",
      metadata: {
        energy: moment.energy ?? null,
        moment_label: moment.momentLabel,
        room_type: moment.roomType ?? null,
        timestamp_label: moment.timestampLabel
      },
      scope: userId,
      timestampSeconds: moment.timestamp,
      workId: moment.trackId
    });
    return next;
  } catch (error) {
    logSupabaseError("Sound Vault saved reference crashed", error);
    emitVaultMoments(localMoments, userId);
    return localMoments;
  }
}

export async function removeVaultSavedMoment(momentId: string, scope?: string | null) {
  const userId = await getUserId(scope);
  const localNext = removeSavedMoment(momentId, userId ?? scope);
  if (!userId) {
    emitVaultMoments(localNext, scope);
    return localNext;
  }

  try {
    const { error } = await getSupabase()
      .from("saved_moments")
      .delete()
      .eq("user_id", userId)
      .eq("id", momentId);

    if (error) {
      logSupabaseError("Sound Vault saved reference delete failed", error);
      emitVaultMoments(localNext, userId);
      return localNext;
    }

    const next = await readVaultSavedMoments(userId);
    emitVaultMoments(next, userId);
    trackUserInteraction({
      interactionType: "remove_moment",
      metadata: { saved_moment_id: momentId },
      scope: userId
    });
    return next;
  } catch (error) {
    logSupabaseError("Sound Vault saved reference delete crashed", error);
    emitVaultMoments(localNext, userId);
    return localNext;
  }
}

function mapSavedMomentRow(
  row: SavedMomentRow,
  work?: { title: string | null; bpm: string | null },
  dj?: { stage_name: string | null }
): LocalSavedMoment {
  const seconds = Number(row.timestamp_seconds) || 0;
  const trackTitle = work?.title || "Saved track";
  const artist = dj?.stage_name || "ROOM_9 Artist";
  return {
    id: row.id,
    trackId: row.work_id,
    djId: row.dj_id,
    trackTitle,
    artist,
    timestamp: seconds,
    timestampLabel: row.timestamp_label || formatSeconds(seconds),
    momentLabel: row.moment_label || "Sound Reference",
    bpm: work?.bpm || null,
    energy: row.energy,
    roomType: row.room_type,
    status: row.status ?? "saved",
    createdAt: row.created_at
  };
}

function formatSeconds(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function getSoundVaultError(error: unknown) {
  return formatSupabaseError(error, "Sound Vault request failed.");
}
