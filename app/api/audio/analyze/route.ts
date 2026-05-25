import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { analyzeAudioBuffer } from "@/lib/serverAudioAnalyzer";
import { getTrackMetadata, interpretRawAudioAnalysis } from "@/lib/llmInterpreter";
import type { RawAudioAnalysis } from "@/lib/audioAnalyzer";
import type { DjProfile, TrackAudioFeature, Work } from "@/lib/types";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 28 * 1024 * 1024;

type AnalyzeBody = {
  audioUrl?: string | null;
  clientAnalysis?: RawAudioAnalysis | null;
  metadata?: {
    artist?: string | null;
    genre?: string | null;
    title?: string | null;
  };
  workId?: string;
};

type FeatureAnalysisStatus = "pending" | "analyzing" | "complete" | "failed";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Authorization required." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "Supabase public configuration is missing." }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as AnalyzeBody;
  if (!body.workId) {
    return NextResponse.json({ error: "workId is required." }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        Authorization: authHeader
      }
    }
  });

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Invalid session." }, { status: 401 });
  }

  const { data: workData, error: workError } = await supabase
    .from("works")
    .select("*")
    .eq("id", body.workId)
    .single();
  if (workError || !workData) {
    return NextResponse.json({ error: "Track was not found." }, { status: 404 });
  }

  const work = workData as Work;
  const { data: djData, error: djError } = await supabase
    .from("dj_profiles")
    .select("*")
    .eq("id", work.dj_id)
    .eq("user_id", user.id)
    .single();
  if (djError || !djData) {
    return NextResponse.json({ error: "Only the owning DJ can analyze this track." }, { status: 403 });
  }

  const djProfile = djData as DjProfile;
  const requestedAt = new Date().toISOString();
  await writeFeatureStatus(supabase, work.id, "analyzing", null, requestedAt);

  try {
    const raw = body.clientAnalysis ? normalizeClientAnalysis(body.clientAnalysis) : await analyzeTrackFromUrl(body.audioUrl || work.link, work);
    const interpreted = interpretRawAudioAnalysis({
      metadata: {
        ...getTrackMetadata(work, djProfile.stage_name),
        ...body.metadata
      },
      raw,
      workId: work.id
    });
    const analyzedAt = new Date().toISOString();
    const waveformPeaks = raw.waveformPeaks;
    const workUpdate: Partial<Work> = {
      waveform_analyzed_at: analyzedAt,
      waveform_peaks: waveformPeaks
    };

    if (!work.duration_seconds && raw.durationSeconds) {
      workUpdate.duration_seconds = raw.durationSeconds;
    }
    if (!work.bpm && raw.estimatedBpm) {
      workUpdate.bpm = String(Math.round(raw.estimatedBpm));
    }

    const { data: updatedWorkData, error: updateWorkError } = await supabase
      .from("works")
      .update(workUpdate)
      .eq("id", work.id)
      .select("id,bpm,duration_seconds,waveform_analyzed_at,waveform_peaks")
      .single();

    if (updateWorkError) {
      throw new Error(updateWorkError.message);
    }

    const featurePayload = {
      analysis_error: null,
      analysis_requested_at: requestedAt,
      analysis_status: "complete",
      analyzed_at: analyzedAt,
      bpm: interpreted.bpm,
      confidence: interpreted.confidence,
      darkness: interpreted.darkness,
      density: interpreted.density,
      energy: interpreted.energy,
      groove: interpreted.groove,
      intensity: interpreted.intensity,
      moment_types: interpreted.moment_types,
      room_fit: interpreted.room_fit,
      sound_dna: interpreted.sound_dna,
      source: interpreted.source,
      updated_at: analyzedAt,
      vocal_presence: interpreted.vocal_presence,
      waveform_profile: {
        ...(interpreted.waveform_profile ?? {}),
        audio_analysis: raw,
        analysisStatus: "complete",
        analyzedAt,
        analyzer: getAnalyzerLabel(raw),
        beatGridPreview: raw.beatGrid,
        bpmConfidence: raw.bpmConfidence,
        decoder: raw.decoder ?? getAnalyzerLabel(raw),
        dynamicRange: raw.dynamicRange,
        energyProfile: raw.energyProfile,
        peakSegment: raw.peakSegment,
        requestedAt,
        waveformPeaks: raw.waveformPeaks
      },
      work_id: work.id
    };

    const { data: featureData, error: featureError } = await supabase
      .from("track_audio_features")
      .upsert(featurePayload, { onConflict: "work_id" })
      .select("*")
      .single();

    if (featureError) {
      throw new Error(featureError.message);
    }

    return NextResponse.json({
      feature: featureData as TrackAudioFeature,
      raw,
      work: updatedWorkData
    });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : "Audio analysis failed.";
    await writeFeatureStatus(supabase, work.id, "failed", message, requestedAt);
    return NextResponse.json({ error: message }, { status: getAnalysisErrorStatus(message) });
  }
}

function isSafeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function analyzeTrackFromUrl(audioUrl: string | null, work: Work): Promise<RawAudioAnalysis> {
  if (!audioUrl || !isSafeHttpUrl(audioUrl)) {
    throw new Error("Track has no analyzable audio URL.");
  }

  const audioResponse = await fetch(audioUrl, {
    headers: {
      Accept: "audio/*,*/*;q=0.8"
    }
  });
  if (!audioResponse.ok) {
    throw new Error("Could not fetch the audio file for analysis.");
  }

  const contentLength = Number(audioResponse.headers.get("content-length") || 0);
  if (contentLength > MAX_AUDIO_BYTES) {
    throw new Error("Audio file is too large for inline analysis. Use Music Lab background analysis later.");
  }

  const arrayBuffer = await audioResponse.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_AUDIO_BYTES) {
    throw new Error("Audio file is too large for inline analysis. Use Music Lab background analysis later.");
  }

  return analyzeAudioBuffer({
    arrayBuffer,
    fallbackSeed: `${work.id}-${work.title ?? "room9"}`,
    length: 156,
    mimeType: audioResponse.headers.get("content-type")
  });
}

function normalizeClientAnalysis(raw: RawAudioAnalysis): RawAudioAnalysis {
  if (!Array.isArray(raw.waveformPeaks) || raw.waveformPeaks.length < 8 || !raw.metrics || !raw.eqProfile) {
    throw new Error("Client audio analysis payload is incomplete.");
  }

  return {
    ...raw,
    analysisMode: "browser",
    source: raw.source || "decoded-audio",
    waveformPeaks: raw.waveformPeaks.slice(0, 240).map((value) => clampUnitNumber(value))
  };
}

function clampUnitNumber(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

async function writeFeatureStatus(
  supabase: SupabaseClient,
  workId: string,
  status: FeatureAnalysisStatus,
  error: string | null,
  requestedAt: string
) {
  await supabase.from("track_audio_features").upsert(
    {
      analysis_error: error,
      analysis_requested_at: requestedAt,
      analysis_status: status,
      updated_at: new Date().toISOString(),
      work_id: workId
    },
    { onConflict: "work_id" }
  );
}

function getAnalyzerLabel(raw: RawAudioAnalysis) {
  if (raw.analysisMode === "browser") {
    return "browser-web-audio-v1";
  }
  if (raw.analysisMode === "server") {
    return raw.decoder === "mp3-wasm" ? "mp3-wasm-meyda-v1" : "wav-pcm-meyda-v1";
  }
  return "music-metadata-fallback-v1";
}

function getAnalysisErrorStatus(message: string) {
  if (message.includes("too large")) {
    return 413;
  }
  if (message.includes("fetch")) {
    return 502;
  }
  return 400;
}
