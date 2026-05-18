"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BackButton } from "@/components/BackButton";
import { EmptyState } from "@/components/EmptyState";
import {
  Button,
  ButtonLink,
  Panel,
  SectionHeader,
  StatusBadge,
  Text
} from "@/components/room9-ui";
import { fallbackStreams, formatStreamDate, getStreamViewerCount } from "@/lib/streams";
import {
  formatSupabaseError,
  getSupabase,
  hasSupabaseConfig,
  logSupabaseError
} from "@/lib/supabase";
import type { DjProfile, LiveStream } from "@/lib/types";

type StreamArtist = Pick<DjProfile, "id" | "stage_name" | "city" | "country" | "genres">;

export default function StreamRoomPage() {
  const params = useParams<{ streamId: string }>();
  const streamId = params.streamId;
  const fallback = useMemo(
    () => fallbackStreams.find((stream) => stream.id === streamId) ?? fallbackStreams[0],
    [streamId]
  );

  const [stream, setStream] = useState<LiveStream>(fallback);
  const [artist, setArtist] = useState<StreamArtist | null>(null);
  const [isPlaying, setIsPlaying] = useState(stream.status === "live");
  const [progress, setProgress] = useState(stream.status === "archived" ? 68 : 31);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      return;
    }

    async function loadStreamRoom() {
      try {
        const supabase = getSupabase();
        const { data: streamData, error: streamError } = await supabase
          .from("live_streams")
          .select("*")
          .eq("id", streamId)
          .maybeSingle();

        if (streamError) {
          logSupabaseError("Stream room load failed", streamError);
          setError(formatSupabaseError(streamError, "Could not load stream room."));
          return;
        }

        if (!streamData) {
          return;
        }

        const loadedStream = streamData as LiveStream;
        setStream(loadedStream);
        setIsPlaying(loadedStream.status === "live");
        setProgress(loadedStream.status === "archived" ? 68 : 31);

        if (loadedStream.owner_id) {
          const { data: artistData, error: artistError } = await supabase
            .from("dj_profiles")
            .select("id, stage_name, city, country, genres")
            .eq("user_id", loadedStream.owner_id)
            .maybeSingle();

          if (artistError) {
            logSupabaseError("Stream room artist load failed", artistError);
          } else if (artistData) {
            setArtist(artistData as StreamArtist);
          }
        }
      } catch (caughtError) {
        logSupabaseError("Stream room unexpected load failure", caughtError);
        setError(formatSupabaseError(caughtError, "Could not load stream room."));
      }
    }

    loadStreamRoom();
  }, [streamId]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const timer = window.setInterval(() => {
      setProgress((current) => (current >= 98 ? 0 : current + 0.8));
    }, 800);

    return () => window.clearInterval(timer);
  }, [isPlaying]);

  if (error && stream.id !== fallback.id) {
    return (
      <main className="room-page">
        <section className="room-shell py-12">
          <EmptyState title="Stream unavailable" message={error} href="/streams" action="Back to Streams" />
        </section>
      </main>
    );
  }

  return (
    <main className="room-page pb-32">
      <nav className="flex min-h-16 items-center justify-between border-b border-roomBorder px-5 md:px-6">
        <div className="flex items-center gap-4">
          <BackButton fallbackHref="/streams" />
          <Link className="room-heading text-xl text-bone" href="/">
            ROOM_9
          </Link>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.22em] text-mutedText sm:inline">
            Stream Room / {stream.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ButtonLink href="/streams" size="sm" variant="secondary">
            Streams
          </ButtonLink>
          <ButtonLink href="/dashboard/streams" size="sm" variant="secondary">
            Workspace
          </ButtonLink>
        </div>
      </nav>

      <section className="mx-auto grid max-w-[1680px] gap-0 border-b border-roomBorder md:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-h-[calc(100vh-168px)] border-r border-roomBorder p-5 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={stream.status}>{stream.status}</StatusBadge>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-mutedText">
                  {formatStreamDate(stream.starts_at)}
                </span>
              </div>
              <h1 className="room-heading mt-6 text-5xl leading-none sm:text-7xl">
                {stream.artist_name}
              </h1>
              <p className="mt-4 max-w-2xl text-lg text-mutedText">
                {stream.title}. {stream.genre ?? "Underground"} transmission from{" "}
                {stream.location ?? "global room"}.
              </p>
            </div>
            <span className="border border-roomBorder bg-black px-3 py-2 font-mono text-[10px] uppercase text-mutedText">
              {getStreamViewerCount(stream).toLocaleString("en-US")}{" "}
              {stream.status === "archived" ? "plays" : "viewers"}
            </span>
          </div>

          <StreamStage
            isPlaying={isPlaying}
            progress={progress}
            stream={stream}
            onToggle={() => setIsPlaying((current) => !current)}
          />
        </div>

        <aside className="p-5 md:p-8">
          <Panel className="p-room-3">
            <SectionHeader eyebrow="Room Signal" title="Live Context" />
            <div className="mt-room-3 grid gap-room-2">
              <StreamFact label="Artist" value={artist?.stage_name ?? stream.artist_name} />
              <StreamFact label="Location" value={stream.location ?? "Global"} />
              <StreamFact label="Genre" value={stream.genre ?? "Unlisted"} />
              <StreamFact label="Runtime" value={formatStreamDate(stream.starts_at)} />
            </div>
          </Panel>

          <Panel className="mt-room-3 p-room-3">
            <SectionHeader eyebrow="Stream Ops" title="Actions" />
            <div className="mt-room-3 grid gap-room-2">
              <Button variant="primary" onClick={() => setIsPlaying((current) => !current)}>
                {isPlaying ? "Pause Room" : "Enter Stream"}
              </Button>
              {artist ? (
                <ButtonLink href={`/dj/${artist.id}`} variant="secondary">
                  Open Artist Dossier
                </ButtonLink>
              ) : (
                <ButtonLink href="/explore" variant="secondary">
                  Explore Artists
                </ButtonLink>
              )}
              <ButtonLink href="/library" variant="ghost">
                Save to Vault
              </ButtonLink>
            </div>
          </Panel>

          <Panel className="mt-room-3 p-room-3">
            <SectionHeader eyebrow="Archive Proof" title="What This Unlocks" />
            <Text className="mt-room-3" variant="small">
              Stream rooms can become archive proof for artist dossiers, saved moments, and future booking briefs.
              Live clipping remains a V3 streaming upgrade, while this room already gives the product a public
              stream destination.
            </Text>
          </Panel>
        </aside>
      </section>
    </main>
  );
}

function StreamStage({
  stream,
  isPlaying,
  progress,
  onToggle
}: {
  stream: LiveStream;
  isPlaying: boolean;
  progress: number;
  onToggle: () => void;
}) {
  return (
    <section className="mt-10 overflow-hidden border border-roomBorder bg-black">
      <div className="relative min-h-[420px]">
        {stream.embed_url ? (
          <iframe
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
            src={stream.embed_url}
            title={`${stream.artist_name} stream`}
          />
        ) : stream.stream_url ? (
          <video
            className="absolute inset-0 h-full w-full object-cover grayscale"
            controls
            poster={stream.thumbnail_url ?? undefined}
            src={stream.stream_url}
          >
            <track kind="captions" />
          </video>
        ) : (
          <div
            className="absolute inset-0 bg-cover bg-center grayscale"
            style={{ backgroundImage: `url(${stream.thumbnail_url || "/reference/live-crowd-clean.png"})` }}
          />
        )}
        <div className="absolute inset-0 bg-black/65" />
        <div className="room-live-bars absolute inset-x-8 bottom-24 flex h-32 items-end justify-between gap-2 opacity-80">
          {Array.from({ length: 42 }).map((_, index) => (
            <span
              className={index < Math.round(progress / 2.38) ? "block w-full bg-acidGreen" : "block w-full bg-bone/30"}
              key={index}
            />
          ))}
        </div>
        <button
          className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center border border-paperWhite bg-paperWhite font-mono text-[10px] font-black uppercase text-black hover:bg-acidGreen"
          onClick={onToggle}
          type="button"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
      </div>
      <div className="border-t border-roomBorder p-4">
        <div className="h-[3px] bg-inkPanel">
          <div className="h-full bg-acidGreen" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase text-mutedText">
          <span>{isPlaying ? "Signal active" : "Signal paused"}</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>
    </section>
  );
}

function StreamFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-roomBorder bg-black p-room-2">
      <Text variant="mono">{label}</Text>
      <Text className="mt-room-1 text-base" variant="title">
        {value}
      </Text>
    </div>
  );
}
