"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BackButton } from "@/components/BackButton";
import { Panel, Select, StatusBadge, cx } from "@/components/room9-ui";
import { streamArchive, streamUpcoming } from "@/lib/room9Design";
import { fallbackStreams, formatStreamDate, getStreamViewerCount } from "@/lib/streams";
import {
  formatSupabaseError,
  getSupabase,
  hasSupabaseConfig,
  logSupabaseError
} from "@/lib/supabase";
import type { LiveStream } from "@/lib/types";

export default function StreamsPage() {
  const [streams, setStreams] = useState<LiveStream[]>(fallbackStreams);
  const [selectedId, setSelectedId] = useState(fallbackStreams[0].id);
  const [genre, setGenre] = useState("All");
  const [location, setLocation] = useState("Global");
  const [status, setStatus] = useState("All");
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(72);
  const [progress, setProgress] = useState(38);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      return;
    }

    async function loadStreams() {
      try {
        const supabase = getSupabase();
        const { data, error: streamError } = await supabase
          .from("live_streams")
          .select("*")
          .order("created_at", { ascending: false });

        if (streamError) {
          logSupabaseError("Streams load failed", streamError);
          setError(
            formatSupabaseError(
              streamError,
              "Live streams table is not ready, so ROOM_9 is showing demo streams."
            )
          );
          return;
        }

        const loaded = (data as LiveStream[]) ?? [];
        if (loaded.length > 0) {
          setStreams(loaded);
          setSelectedId(loaded[0].id);
        }
      } catch (caughtError) {
        logSupabaseError("Streams unexpected load failure", caughtError);
        setError(
          formatSupabaseError(
            caughtError,
            "Live streams table is not ready, so ROOM_9 is showing demo streams."
          )
        );
      }
    }

    loadStreams();
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const timer = window.setInterval(() => {
      setProgress((current) => (current >= 99 ? 0 : current + 1));
    }, 900);

    return () => window.clearInterval(timer);
  }, [isPlaying]);

  const filteredStreams = useMemo(() => {
    return streams.filter((stream) => {
      const genreMatches = genre === "All" || stream.genre === genre;
      const locationMatches = location === "Global" || stream.location === location;
      const statusMatches = status === "All" || stream.status === status.toLowerCase();
      return genreMatches && locationMatches && statusMatches;
    });
  }, [streams, genre, location, status]);

  const selected = streams.find((stream) => stream.id === selectedId) ?? streams[0];
  const genres = ["All", ...Array.from(new Set(streams.map((stream) => stream.genre).filter(Boolean)))] as string[];
  const locations = [
    "Global",
    ...Array.from(new Set(streams.map((stream) => stream.location).filter(Boolean)))
  ] as string[];
  const statuses = ["All", ...Array.from(new Set(streams.map((stream) => stream.status).filter(Boolean)))] as string[];

  return (
    <main className="room-page">
      <section className="border-b border-roomBorder px-5 py-6 md:px-6">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-start justify-between gap-6">
          <div>
            <BackButton fallbackHref="/" />
            <p className="room-tiny mt-6">Live rooms / archived sets</p>
            <h1 className="room-heading mt-3 text-[38px] leading-[0.9] sm:text-[56px]">
              Live Streams
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-ash">
              Live and archived DJ sets for listening context. Watch the current room, save upcoming
              sessions, and open archive sets without leaving the ROOM_9 system.
            </p>
          </div>
          <Link className="room-outline-button" href="/dashboard">
            Workspace
          </Link>
        </div>
      </section>

      <section className="border-b border-roomBorder px-5 py-3 md:px-6">
        <Panel className="mx-auto grid max-w-[1680px] gap-3 p-3 md:grid-cols-3">
          <CompactStreamFilter label="Genre" value={genre} values={genres} onChange={setGenre} />
          <CompactStreamFilter label="Location" value={location} values={locations} onChange={setLocation} />
          <CompactStreamFilter label="Status" value={status} values={statuses} onChange={setStatus} />
        </Panel>
      </section>

      {error ? (
        <div className="border-b border-line px-6 py-3 text-sm text-neutral-300 md:px-10 lg:px-20">{error}</div>
      ) : null}
      {notice ? (
        <div className="border-b border-line px-6 py-3 text-sm text-neutral-300 md:px-10 lg:px-20">{notice}</div>
      ) : null}

      <section className="mx-auto grid max-w-[1680px] gap-4 px-5 py-6 md:px-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div>
          <StreamPlayer
            stream={selected}
            isPlaying={isPlaying}
            progress={progress}
            volume={volume}
            onPlayToggle={() => setIsPlaying((current) => !current)}
            onProgressChange={setProgress}
            onVolumeChange={setVolume}
          />
        </div>

        <aside className="min-h-[440px] border border-roomBorder bg-panelBlack p-5">
          <p className="room-tiny">Now selected</p>
          <h2 className="room-heading mt-2 text-3xl">{selected.artist_name}</h2>
          <p className="mt-2 font-mono text-xs uppercase text-ash">{selected.title}</p>
          <div className="mt-5 grid gap-px bg-line">
            <StreamMeta label="Status" value={selected.status} />
            <StreamMeta label="Genre" value={selected.genre || "Techno"} />
            <StreamMeta label="Location" value={selected.location || "Global"} />
            <StreamMeta label="Volume" value={`${volume}%`} />
          </div>
          <button className="room-white-button mt-5 w-full" type="button" onClick={() => setIsPlaying((current) => !current)}>
            {isPlaying ? "Pause Stream" : "Play Stream"}
          </button>
        </aside>
      </section>

      <section className="mx-auto max-w-[1680px] px-5 pb-6 md:px-6">
        <h2 className="border-b border-roomBorder pb-4 font-display text-2xl uppercase">Upcoming Streams</h2>
        {streamUpcoming.map((item) => (
          <article
            className="grid gap-4 border-b border-line py-4 last:border-b-0 md:grid-cols-[110px_1fr_150px] md:items-center"
            key={item.artist}
          >
            <div className="font-mono text-[11px] uppercase text-bone">
              <p>{item.date}</p>
              <p className="mt-1 text-ash">{item.time}</p>
            </div>
            <div>
              <h3 className="room-heading text-3xl">{item.artist}</h3>
              <p className="room-tiny mt-1 text-bone">{item.place}</p>
            </div>
            <button
              className="room-outline-button w-full"
              type="button"
              onClick={() => setNotice(`Reminder set for ${item.artist}.`)}
            >
              Set Reminder
            </button>
          </article>
        ))}
      </section>

      <section id="archive" className="mx-auto max-w-[1680px] px-5 pb-10 md:px-6">
        <div className="flex items-center justify-between border-b border-roomBorder pb-4">
          <h2 className="room-heading text-2xl">Archive</h2>
          <Link className="room-tiny font-black text-bone underline underline-offset-4" href="/streams">
            View all
          </Link>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {(filteredStreams.length > 0 ? filteredStreams : streams).map((stream, index) => (
            <article
              className={cx(
                "border p-4 text-left transition",
                selected.id === stream.id
                  ? "border-acidGreen bg-panel"
                  : "border-roomBorder bg-black hover:border-bone"
              )}
              key={stream.id}
            >
              <div
                className="room-stream-photo relative h-36 border border-roomBorder bg-black"
                style={{ backgroundPosition: streamArchive[index % streamArchive.length].imagePosition }}
              >
                <span className="absolute bottom-2 right-2 bg-black">
                  <StatusBadge status={stream.status} />
                </span>
              </div>
              <h3 className="room-heading mt-4 text-xl">{stream.artist_name}</h3>
              <p className="room-tiny mt-1 text-bone">{stream.title}</p>
              <p className="mt-3 font-mono text-[10px] uppercase text-ash">
                {formatStreamDate(stream.starts_at)}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  className="room-outline-button"
                  onClick={() => {
                    setSelectedId(stream.id);
                    setIsPlaying(false);
                  }}
                  type="button"
                >
                  Preview
                </button>
                <Link
                  className="room-outline-button border-acidGreen bg-acidGreen text-black hover:bg-paperWhite"
                  href={`/streams/${stream.id}`}
                >
                  Open Room
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function StreamPlayer({
  stream,
  isPlaying,
  progress,
  volume,
  onPlayToggle,
  onProgressChange,
  onVolumeChange
}: {
  stream: LiveStream;
  isPlaying: boolean;
  progress: number;
  volume: number;
  onPlayToggle: () => void;
  onProgressChange: (value: number) => void;
  onVolumeChange: (value: number) => void;
}) {
  return (
    <div
      className="relative min-h-[440px] border border-roomBorder bg-black"
    >
      <div className="absolute inset-0 bg-black/55" />
      {stream.embed_url ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={stream.embed_url}
          title={`${stream.artist_name} stream`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : stream.stream_url ? (
        <video
          className="absolute inset-0 h-full w-full object-cover grayscale"
          controls
          src={stream.stream_url}
          poster={stream.thumbnail_url ?? undefined}
        >
          <track kind="captions" />
        </video>
      ) : (
          <div className="room-live-bars absolute inset-x-10 top-16 flex h-40 items-end justify-between gap-2 opacity-70">
          {Array.from({ length: 36 }).map((_, index) => (
            <span className="block w-full bg-bone" key={index} />
          ))}
        </div>
      )}

      <div className="relative z-10 flex min-h-[440px] flex-col justify-between p-5 sm:p-6">
        <div className="flex items-start justify-between">
          <StatusBadge status={stream.status} />
          <span className="border border-roomBorder bg-black px-3 py-2 font-mono text-[10px] uppercase text-mutedText">
            {getStreamViewerCount(stream).toLocaleString("en-US")}{" "}
            {stream.status === "archived" ? "plays" : "viewers"}
          </span>
        </div>
        <div>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h2 className="room-heading text-3xl sm:text-4xl">{stream.artist_name}</h2>
              <p className="room-tiny mt-2 text-bone">{stream.title}</p>
            </div>
            <button
              className="grid h-11 w-16 place-items-center border border-acidGreen bg-acidGreen font-mono text-[10px] font-black uppercase text-black hover:border-paperWhite hover:bg-paperWhite"
              onClick={onPlayToggle}
              type="button"
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
          </div>

          <div className="mt-6 grid gap-4 border border-roomBorder bg-black/85 p-4 md:grid-cols-[1fr_140px]">
            <label className="block">
              <span className="room-tiny">Stream progress</span>
              <input
                className="mt-2 h-[3px] w-full accent-acidGreen"
                max="100"
                min="0"
                onChange={(event) => onProgressChange(Number(event.target.value))}
                type="range"
                value={progress}
              />
            </label>
            <label className="block">
              <span className="room-tiny">Volume</span>
              <input
                className="mt-2 h-[3px] w-full accent-paperWhite"
                max="100"
                min="0"
                onChange={(event) => onVolumeChange(Number(event.target.value))}
                type="range"
                value={volume}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompactStreamFilter({
  label,
  value,
  values,
  onChange
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="room-label">{label}</span>
      <Select className="min-h-10 py-2 text-xs" value={value} onChange={(event) => onChange(event.target.value)}>
        {values.map((item) => (
          <option className="bg-black text-bone" key={item} value={item}>
            {item}
          </option>
        ))}
      </Select>
    </label>
  );
}

function StreamMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-black p-4">
      <p className="room-tiny">{label}</p>
      <p className="mt-2 font-display text-xl uppercase">{value}</p>
    </div>
  );
}
