import type { DjProfile, Release, Work } from "@/lib/types";

export const ROOM9_TRACK_PLACEHOLDER = "/room9-track-placeholder.svg";
export const ROOM9_DOSSIER_PLACEHOLDER = "/reference/dossier-hero.png";

export function getDjAvatarUrl(dj?: Pick<DjProfile, "avatar_url" | "cover_image_url"> | null) {
  return dj?.avatar_url || dj?.cover_image_url || ROOM9_TRACK_PLACEHOLDER;
}

export function getDjCoverUrl(dj?: Pick<DjProfile, "cover_image_url" | "avatar_url"> | null) {
  return dj?.cover_image_url || dj?.avatar_url || ROOM9_DOSSIER_PLACEHOLDER;
}

export function getWorkCoverUrl(
  work?: Pick<Work, "cover_image"> | null,
  dj?: Pick<DjProfile, "avatar_url" | "cover_image_url"> | null
) {
  return work?.cover_image || getDjAvatarUrl(dj);
}

export function getReleaseCoverUrl(
  release?: Pick<Release, "cover_image"> | null,
  dj?: Pick<DjProfile, "avatar_url" | "cover_image_url"> | null
) {
  return release?.cover_image || getDjCoverUrl(dj);
}

export function cssImageUrl(url?: string | null) {
  return url ? `url("${url.replace(/"/g, "%22")}")` : undefined;
}
