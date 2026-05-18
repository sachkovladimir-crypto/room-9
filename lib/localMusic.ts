export type LocalPlaylist = {
  id: string;
  name: string;
  description?: string | null;
  coverImage?: string | null;
  trackIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type LocalSavedMoment = {
  id: string;
  trackId: string;
  djId?: string | null;
  trackTitle: string;
  artist: string;
  timestamp: number;
  timestampLabel: string;
  momentLabel: string;
  bpm?: string | null;
  energy?: string | null;
  roomType?: string | null;
  status: "saved" | "used-in-booking" | "in-case-file";
  createdAt: string;
};

const FAVORITE_TRACKS_KEY = "room9_favorite_tracks";
const LEGACY_SAVED_TRACKS_KEY = "room9_saved_tracks";
const PLAYLISTS_KEY = "room9_playlists";
const LISTENING_HISTORY_KEY = "room9_listening_history";
const SAVED_MOMENTS_KEY = "room9_saved_moments";

function scopedKey(key: string, scope?: string | null) {
  return scope ? `${key}:${scope}` : key;
}

function readStringArray(key: string, scope?: string | null) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(scopedKey(key, scope));
    const parsed = stored ? (JSON.parse(stored) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function writeStringArray(key: string, ids: string[], scope?: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(scopedKey(key, scope), JSON.stringify(Array.from(new Set(ids))));
}

export function readFavoriteTrackIds(scope?: string | null) {
  if (scope) {
    return readStringArray(FAVORITE_TRACKS_KEY, scope);
  }

  return Array.from(new Set([...readStringArray(FAVORITE_TRACKS_KEY), ...readStringArray(LEGACY_SAVED_TRACKS_KEY)]));
}

export function writeFavoriteTrackIds(ids: string[], scope?: string | null) {
  writeStringArray(FAVORITE_TRACKS_KEY, ids, scope);
  if (!scope) {
    writeStringArray(LEGACY_SAVED_TRACKS_KEY, ids);
  }
}

export function toggleFavoriteTrackId(trackId: string, scope?: string | null) {
  const current = readFavoriteTrackIds(scope);
  const next = current.includes(trackId) ? current.filter((id) => id !== trackId) : [...current, trackId];
  writeFavoriteTrackIds(next, scope);
  return next;
}

export function readPlaylists(scope?: string | null): LocalPlaylist[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(scopedKey(PLAYLISTS_KEY, scope));
    const parsed = stored ? (JSON.parse(stored) as unknown) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is LocalPlaylist => {
        if (!item || typeof item !== "object") {
          return false;
        }
        const playlist = item as Partial<LocalPlaylist>;
        return typeof playlist.id === "string" && typeof playlist.name === "string" && Array.isArray(playlist.trackIds);
      })
      .map((playlist) => ({
        id: playlist.id,
        name: playlist.name,
        description: typeof playlist.description === "string" ? playlist.description : null,
        coverImage: typeof playlist.coverImage === "string" ? playlist.coverImage : null,
        trackIds: Array.from(new Set(playlist.trackIds)),
        createdAt: playlist.createdAt || new Date().toISOString(),
        updatedAt: playlist.updatedAt || playlist.createdAt || new Date().toISOString()
      }));
  } catch {
    return [];
  }
}

export function writePlaylists(playlists: LocalPlaylist[], scope?: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(scopedKey(PLAYLISTS_KEY, scope), JSON.stringify(playlists));
}

export function createLocalPlaylist(name: string, scope?: string | null) {
  const now = new Date().toISOString();
  const playlist: LocalPlaylist = {
    id: `playlist-${Date.now()}`,
    name: name.trim() || "Untitled playlist",
    description: null,
    coverImage: null,
    trackIds: [],
    createdAt: now,
    updatedAt: now
  };
  const next = [playlist, ...readPlaylists(scope)];
  writePlaylists(next, scope);
  return next;
}

export function deleteLocalPlaylist(playlistId: string, scope?: string | null) {
  const next = readPlaylists(scope).filter((playlist) => playlist.id !== playlistId);
  writePlaylists(next, scope);
  return next;
}

export function updateLocalPlaylist(
  playlistId: string,
  updates: Partial<Pick<LocalPlaylist, "coverImage" | "description" | "name">>,
  scope?: string | null
) {
  const next = readPlaylists(scope).map((playlist) => {
    if (playlist.id !== playlistId) {
      return playlist;
    }

    return {
      ...playlist,
      ...updates,
      name: updates.name?.trim() || playlist.name,
      updatedAt: new Date().toISOString()
    };
  });
  writePlaylists(next, scope);
  return next;
}

export function toggleTrackInPlaylist(playlistId: string, trackId: string, scope?: string | null) {
  const next = readPlaylists(scope).map((playlist) => {
    if (playlist.id !== playlistId) {
      return playlist;
    }

    const trackIds = playlist.trackIds.includes(trackId)
      ? playlist.trackIds.filter((id) => id !== trackId)
      : [...playlist.trackIds, trackId];

    return {
      ...playlist,
      trackIds,
      updatedAt: new Date().toISOString()
    };
  });
  writePlaylists(next, scope);
  return next;
}

export function moveTrackInPlaylist(
  playlistId: string,
  trackId: string,
  direction: "up" | "down",
  scope?: string | null
) {
  const next = readPlaylists(scope).map((playlist) => {
    if (playlist.id !== playlistId) {
      return playlist;
    }

    const index = playlist.trackIds.indexOf(trackId);
    if (index < 0) {
      return playlist;
    }

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= playlist.trackIds.length) {
      return playlist;
    }

    const trackIds = [...playlist.trackIds];
    const [item] = trackIds.splice(index, 1);
    trackIds.splice(targetIndex, 0, item);

    return {
      ...playlist,
      trackIds,
      updatedAt: new Date().toISOString()
    };
  });

  writePlaylists(next, scope);
  return next;
}

export function recordListeningHistory(trackId: string, scope?: string | null) {
  const next = [trackId, ...readStringArray(LISTENING_HISTORY_KEY, scope).filter((id) => id !== trackId)].slice(0, 40);
  writeStringArray(LISTENING_HISTORY_KEY, next, scope);
  return next;
}

export function readListeningHistoryIds(scope?: string | null) {
  return readStringArray(LISTENING_HISTORY_KEY, scope);
}

export function readSavedMoments(scope?: string | null): LocalSavedMoment[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(scopedKey(SAVED_MOMENTS_KEY, scope));
    const parsed = stored ? (JSON.parse(stored) as unknown) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is LocalSavedMoment => {
      if (!item || typeof item !== "object") {
        return false;
      }

      const moment = item as Partial<LocalSavedMoment>;
      return (
        typeof moment.id === "string" &&
        typeof moment.trackId === "string" &&
        typeof moment.trackTitle === "string" &&
        typeof moment.artist === "string" &&
        typeof moment.timestamp === "number" &&
        typeof moment.timestampLabel === "string" &&
        typeof moment.momentLabel === "string"
      );
    });
  } catch {
    return [];
  }
}

export function writeSavedMoments(moments: LocalSavedMoment[], scope?: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(scopedKey(SAVED_MOMENTS_KEY, scope), JSON.stringify(moments));
}

export function saveLocalMoment(
  moment: Omit<LocalSavedMoment, "id" | "createdAt" | "status"> & {
    status?: LocalSavedMoment["status"];
  },
  scope?: string | null
) {
  const current = readSavedMoments(scope);
  const duplicateId = `${moment.trackId}:${Math.round(moment.timestamp)}`;
  const nextMoment: LocalSavedMoment = {
    ...moment,
    id: duplicateId,
    status: moment.status ?? "saved",
    createdAt: new Date().toISOString()
  };

  const next = [nextMoment, ...current.filter((item) => item.id !== duplicateId)].slice(0, 80);
  writeSavedMoments(next, scope);
  return next;
}

export function removeSavedMoment(momentId: string, scope?: string | null) {
  const next = readSavedMoments(scope).filter((moment) => moment.id !== momentId);
  writeSavedMoments(next, scope);
  return next;
}
