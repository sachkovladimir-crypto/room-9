import type { LiveStream } from "@/lib/types";

export const fallbackStreams: LiveStream[] = [
  {
    id: "fallback-live",
    owner_id: null,
    title: "Exhale / Tresor Berlin",
    artist_name: "Amelie Lens",
    location: "Berlin",
    genre: "Techno",
    status: "live",
    starts_at: "2026-10-24T22:00:00.000Z",
    embed_url: null,
    stream_url: null,
    thumbnail_url: null,
    created_at: "2026-10-24T18:00:00.000Z"
  },
  {
    id: "fallback-ben-klock",
    owner_id: null,
    title: "Awakenings Festival",
    artist_name: "Ben Klock",
    location: "Amsterdam",
    genre: "Techno",
    status: "archived",
    starts_at: "2026-09-12T22:00:00.000Z",
    embed_url: null,
    stream_url: null,
    thumbnail_url: null,
    created_at: "2026-09-12T18:00:00.000Z"
  },
  {
    id: "fallback-nina",
    owner_id: null,
    title: "Time Warp DE",
    artist_name: "Nina Kraviz",
    location: "Mannheim",
    genre: "Acid",
    status: "archived",
    starts_at: "2026-04-06T22:00:00.000Z",
    embed_url: null,
    stream_url: null,
    thumbnail_url: null,
    created_at: "2026-04-06T18:00:00.000Z"
  }
];

export function formatStreamDate(value: string | null) {
  if (!value) {
    return "Runtime TBA";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Runtime TBA";
  }

  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date);
  const day = new Intl.DateTimeFormat("en-US", { day: "2-digit", timeZone: "UTC" }).format(date);
  const hour = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "UTC"
  }).format(date);

  return `${month} ${day} / ${hour} UTC`;
}

export function getStreamViewerCount(stream: Pick<LiveStream, "id" | "status">) {
  if (stream.status === "archived") {
    return 8200 + stableNumberFromId(stream.id, 4200);
  }

  if (stream.status === "upcoming") {
    return 120 + stableNumberFromId(stream.id, 380);
  }

  return 1240 + stableNumberFromId(stream.id, 5400);
}

function stableNumberFromId(id: string, max: number) {
  const seed = Array.from(id).reduce((total, char) => total + char.charCodeAt(0), 0);
  return seed % max;
}

