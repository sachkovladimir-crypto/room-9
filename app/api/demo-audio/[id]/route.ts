import { NextRequest } from "next/server";

export const dynamic = "force-static";

const STATIC_AUDIO_BY_ID: Record<string, string> = {
  "acid-phase": "/demo-audio/acid-phase.wav",
  "berlin-warehouse": "/demo-audio/berlin-warehouse.wav",
  "industrial-complex": "/demo-audio/industrial-complex.wav",
  moncler: "/demo-audio/moncler.wav"
};

async function redirectToStaticAudio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pathname = STATIC_AUDIO_BY_ID[id] ?? STATIC_AUDIO_BY_ID.moncler;

  return new Response(null, {
    headers: {
      Location: pathname,
      "Cache-Control": "public, max-age=31536000, immutable"
    },
    status: 308
  });
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return redirectToStaticAudio(context);
}

export async function HEAD(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return redirectToStaticAudio(context);
}
