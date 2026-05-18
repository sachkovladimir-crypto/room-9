import type { DjProfile, Work } from "@/lib/types";
import { createFallbackWaveform } from "@/lib/waveform";

const createdAt = "2026-05-01T12:00:00.000Z";

export const demoDjProfiles: DjProfile[] = [
  {
    id: "demo-dj-stonik",
    user_id: "demo-user-stonik",
    stage_name: "DJ STONIK",
    bio:
      "Emerging from the concrete basements of Kyiv, DJ STONIK builds industrial techno sets around controlled tension, long pressure arcs, and precise peak-time release.",
    country: "Ukraine",
    city: "Kyiv",
    genres: "Industrial Techno, Hard Groove",
    bpm_range: "118-135",
    price: 2500,
    avatar_url: "/reference/dossier-hero.png",
    cover_image_url: "/reference/dossier-hero.png",
    profile_theme: "warehouse / basement / high-pressure",
    soundcloud_url: "https://soundcloud.com",
    mixcloud_url: "https://mixcloud.com",
    is_available: true,
    created_at: createdAt
  },
  {
    id: "demo-dj-kicks",
    user_id: "demo-user-kicks",
    stage_name: "KLANGKUENSTLER",
    bio:
      "A hard techno operator for late-room systems, focused on dense drums, functional transitions, and live-ready energy.",
    country: "DE",
    city: "Berlin",
    genres: "Hard Techno, Industrial",
    bpm_range: "132-145",
    price: 4500,
    avatar_url: "/reference/explore.png",
    cover_image_url: "/reference/explore.png",
    profile_theme: "peak-time / main room / live-ready",
    soundcloud_url: "https://soundcloud.com",
    mixcloud_url: "https://mixcloud.com",
    is_available: true,
    created_at: createdAt
  },
  {
    id: "demo-dj-coles",
    user_id: "demo-user-coles",
    stage_name: "MAYA JANE COLES",
    bio:
      "Deep, warm and club-ready selections for rooms that need patient groove rather than maximum pressure.",
    country: "UK",
    city: "London",
    genres: "Deep Techno, Lounge",
    bpm_range: "120-126",
    price: 3200,
    avatar_url: "/reference/home.png",
    cover_image_url: "/reference/home.png",
    profile_theme: "warmup / deep room / late lounge",
    soundcloud_url: "https://soundcloud.com",
    mixcloud_url: "https://mixcloud.com",
    is_available: true,
    created_at: createdAt
  }
];

export const demoWorks: Work[] = [
  {
    id: "demo-work-moncler",
    dj_id: "demo-dj-stonik",
    title: "MONCLER",
    type: "track",
    link: "/demo-audio/moncler.wav",
    description: "Industrial pressure tool with a clear bookable peak moment.",
    cover_image: "/reference/dossier-hero.png",
    lyrics: null,
    genre: "Industrial Techno",
    bpm: "120",
    key: "KYIV",
    visibility: "public",
    play_count: 12400,
    like_count: 890,
    duration_seconds: 174,
    waveform_peaks: createFallbackWaveform(156, "MONCLER"),
    waveform_analyzed_at: createdAt,
    is_deleted: false,
    created_at: createdAt
  },
  {
    id: "demo-work-industrial-complex",
    dj_id: "demo-dj-kicks",
    title: "Industrial Complex (Live Edit)",
    type: "track",
    link: "/demo-audio/industrial-complex.wav",
    description: "Hard techno live edit for warehouse rooms and closing energy.",
    cover_image: "/reference/explore.png",
    lyrics: null,
    genre: "Hard Techno",
    bpm: "138.5",
    key: "Am",
    visibility: "public",
    play_count: 24200,
    like_count: 1420,
    duration_seconds: 402,
    waveform_peaks: createFallbackWaveform(156, "Industrial Complex"),
    waveform_analyzed_at: createdAt,
    is_deleted: false,
    created_at: createdAt
  },
  {
    id: "demo-work-berlin-warehouse",
    dj_id: "demo-dj-stonik",
    title: "Berlin Warehouse 04",
    type: "track",
    link: "/demo-audio/berlin-warehouse.wav",
    description: "Long-form warehouse pressure with a controlled mid-set build.",
    cover_image: "/reference/live-crowd-clean.png",
    lyrics: null,
    genre: "Peak Techno",
    bpm: "135",
    key: "Fm",
    visibility: "public",
    play_count: 9800,
    like_count: 540,
    duration_seconds: 322,
    waveform_peaks: createFallbackWaveform(156, "Berlin Warehouse"),
    waveform_analyzed_at: createdAt,
    is_deleted: false,
    created_at: createdAt
  },
  {
    id: "demo-work-acid-phase",
    dj_id: "demo-dj-coles",
    title: "Acid Phase (Remaster)",
    type: "track",
    link: "/demo-audio/acid-phase.wav",
    description: "Acid-led room mover with a softer booking profile.",
    cover_image: "/reference/home.png",
    lyrics: null,
    genre: "Acid Techno",
    bpm: "133",
    key: "Gm",
    visibility: "public",
    play_count: 7600,
    like_count: 430,
    duration_seconds: 435,
    waveform_peaks: createFallbackWaveform(156, "Acid Phase"),
    waveform_analyzed_at: createdAt,
    is_deleted: false,
    created_at: createdAt
  }
];

export function getDemoDjLookup() {
  return demoDjProfiles.reduce<Record<string, DjProfile>>((acc, dj) => {
    acc[dj.id] = dj;
    return acc;
  }, {});
}

export function getDemoDjProfile(id: string | null | undefined) {
  return demoDjProfiles.find((dj) => dj.id === id) ?? null;
}

export function getDemoWork(id: string | null | undefined) {
  return demoWorks.find((work) => work.id === id) ?? null;
}

export function getDemoWorksByDjId(djId: string | null | undefined) {
  return demoWorks.filter((work) => work.dj_id === djId);
}

export function isDemoWorkId(id: string | null | undefined) {
  return Boolean(id?.startsWith("demo-work-"));
}

export function isDemoDjId(id: string | null | undefined) {
  return Boolean(id?.startsWith("demo-dj-"));
}
