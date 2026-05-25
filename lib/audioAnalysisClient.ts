import type { RawAudioAnalysis } from "@/lib/audioAnalyzer";
import { getSupabase } from "@/lib/supabase";
import type { TrackAudioFeature, Work } from "@/lib/types";

export type AudioAnalyzeResponse = {
  feature: TrackAudioFeature;
  raw: RawAudioAnalysis;
  work: Pick<Work, "bpm" | "duration_seconds" | "id" | "waveform_analyzed_at" | "waveform_peaks">;
};

export async function requestTrackAudioAnalysis({
  audioUrl,
  clientAnalysis,
  metadata,
  workId
}: {
  audioUrl?: string | null;
  clientAnalysis?: RawAudioAnalysis | null;
  metadata?: {
    artist?: string | null;
    genre?: string | null;
    title?: string | null;
  };
  workId: string;
}) {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("Login session required before audio analysis.");
  }

  const response = await fetch("/api/audio/analyze", {
    body: JSON.stringify({ audioUrl, clientAnalysis, metadata, workId }),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  const payload = (await response.json().catch(() => null)) as AudioAnalyzeResponse & { error?: string } | null;

  if (!response.ok || !payload) {
    throw new Error(payload?.error || "Audio analysis failed.");
  }

  return payload;
}
