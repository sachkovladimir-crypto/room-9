import Link from "next/link";
import { ButtonLink, StatusBadge } from "@/components/room9-ui";
import { cssImageUrl, getWorkCoverUrl } from "@/lib/media";
import { roomEvents } from "@/lib/room9Design";
import { formatTrackTime, getPrimaryTrackMoment } from "@/lib/trackMoments";
import type { DjProfile, LiveStream, Work } from "@/lib/types";

export const revalidate = 60;
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const demoMode = process.env.NEXT_PUBLIC_ROOM9_DEMO_MODE === "true";

type HomeSignal = {
  artist: string;
  artistHref: string;
  bpm: string;
  coverUrl: string;
  duration: string;
  genre: string;
  href: string;
  id: string;
  references: string;
  title: string;
  peakTime: string;
};

type HomeData = {
  activeEvents: number;
  liveStreams: number;
  publicSounds: number;
  signals: HomeSignal[];
};

export default async function HomePage() {
  const homeData = await loadHomeData();
  const primarySignal = homeData.signals[0] ?? null;

  return (
    <main className="room-page">
      <section className="mx-auto max-w-[1920px] border-b border-roomBorder">
        <div className="grid min-h-[640px] xl:grid-cols-[minmax(0,1fr)_430px]">
          <div className="relative overflow-hidden border-b border-roomBorder bg-black xl:border-b-0 xl:border-r">
            <div className="room-home-photo absolute inset-0 opacity-80" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.05),rgba(0,0,0,0.78)),linear-gradient(90deg,rgba(0,0,0,0.82),rgba(0,0,0,0.18))]" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-roomBorder" />

            <div className="relative z-10 flex min-h-[640px] flex-col justify-between px-6 pb-8 pt-10 md:px-10 xl:px-14">
              <div className="flex items-start justify-between gap-4 font-mono text-[10px] uppercase text-mutedText">
                <span>Now playing / {primarySignal ? primarySignal.title : "waiting for public sounds"}</span>
                <span className="border border-roomBorder bg-black/70 px-3 py-2 text-paperWhite">
                  {primarySignal ? `${primarySignal.peakTime} / ${primarySignal.duration}` : "00:00 / 00:00"}
                </span>
              </div>

              <div className="max-w-3xl">
                <StatusBadge status="live">{homeData.liveStreams > 0 ? "Live now" : "Music-first"}</StatusBadge>
                <p className="mt-4 font-mono text-[10px] uppercase text-mutedText">Music platform first / booking layer second</p>
                <h1 className="mt-3 max-w-[760px] font-display text-[54px] uppercase leading-[0.84] text-paperWhite drop-shadow-[0_0_18px_rgba(255,255,255,0.22)] md:text-[82px] xl:text-[104px]">
                  SOUND LEADS.
                  <br />
                  BOOKING FOLLOWS.
                </h1>
                <p className="mt-5 max-w-xl text-sm leading-6 text-mutedText">
                  Discover published tracks and DJ sets, keep the player running, save exact sound
                  references, then open artist dossiers and book only when the sound fits the room.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <ButtonLink href="/explore" variant="primary">
                    Start Listening
                  </ButtonLink>
                  <ButtonLink href="/library" variant="secondary">
                    Open Sound Vault
                  </ButtonLink>
                </div>
              </div>
            </div>
          </div>

          <aside className="grid bg-black xl:grid-rows-[1fr_auto]">
            <section className="border-b border-roomBorder p-6">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-mutedText">Trending vault</p>
                <Link className="font-mono text-[10px] uppercase text-mutedText hover:text-acidGreen" href="/explore">
                  +
                </Link>
              </div>
              <div className="mt-5 space-y-4">
                {homeData.signals.length > 0 ? (
                  homeData.signals.slice(0, 3).map((signal) => (
                    <Link
                      className="grid grid-cols-[72px_1fr] gap-3 border border-roomBorder p-2 transition hover:border-paperWhite"
                      href={signal.href}
                      key={signal.id}
                    >
                      <div
                        className="h-16 bg-inkPanel bg-cover bg-center grayscale"
                        style={{ backgroundImage: cssImageUrl(signal.coverUrl) }}
                      />
                      <div className="min-w-0">
                        <h2 className="truncate font-display text-sm uppercase text-paperWhite">{signal.title}</h2>
                        <p className="mt-1 truncate font-mono text-[10px] uppercase text-mutedText">
                          {signal.artist} / {signal.duration}
                        </p>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="border border-roomBorder bg-panelBlack p-4">
                    <p className="font-display text-base uppercase text-paperWhite">No public sounds yet</p>
                    <p className="mt-2 text-sm leading-6 text-mutedText">
                      Trending Vault now waits for real published tracks from Supabase.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section className="grid grid-cols-2 gap-px bg-roomBorder p-px">
              <Metric label="Public sounds" value={homeData.publicSounds.toString()} accent={homeData.publicSounds > 0} />
              <Metric label="Live streams" value={homeData.liveStreams.toString()} />
            </section>
          </aside>
        </div>
      </section>

      <section className="mx-auto max-w-[1760px] px-5 py-8 md:px-10">
        <div className="mb-8 grid gap-px bg-roomBorder lg:grid-cols-[0.75fr_1fr_1fr]">
          <div className="bg-panelBlack p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-mutedText">Product logic</p>
            <h2 className="mt-4 max-w-lg font-display text-4xl uppercase leading-[0.92] text-paperWhite md:text-5xl">
              Sound leads. Booking follows.
            </h2>
          </div>
          <LogicCell number="01" title="Listen" body="Discover published sounds by BPM, energy, room type, city and atmosphere briefs." />
          <LogicCell number="02" title="Brief" body="Attach the exact sound reference to a request, case file and booking timeline." />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl uppercase leading-none text-paperWhite">Sound Vault</h2>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-mutedText">
              Real public sounds / saved references / booking intent
            </p>
          </div>
          <ButtonLink href="/explore" size="sm" variant="secondary">
            Filters
          </ButtonLink>
        </div>

        <div className="mt-6 grid gap-4">
          {homeData.signals.length > 0 ? (
            homeData.signals.map((signal, index) => (
              <article className="grid border border-roomBorder bg-black lg:grid-cols-[240px_1fr]" key={signal.id}>
                <div
                  className="min-h-[220px] border-b border-roomBorder bg-inkPanel bg-cover bg-center grayscale lg:border-b-0 lg:border-r"
                  style={{ backgroundImage: cssImageUrl(signal.coverUrl), backgroundPosition: index === 0 ? "38% 38%" : "62% 38%" }}
                />
                <div className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <StatusBadge status="verified">Published</StatusBadge>
                      <h3 className="mt-4 break-words font-display text-2xl uppercase leading-none text-paperWhite">{signal.title}</h3>
                      <p className="mt-2 font-mono text-[10px] uppercase text-mutedText">
                        Duration {signal.duration} / {signal.genre}
                      </p>
                    </div>
                    <Link className="font-mono text-[10px] uppercase text-acidGreen hover:text-paperWhite" href={signal.href}>
                      Open vault signal +
                    </Link>
                  </div>

                  <div className="mt-8 flex h-16 items-end gap-[6px] border border-roomBorder bg-voidBlack px-4 pb-3">
                    {Array.from({ length: 34 }, (_, barIndex) => (
                      <span
                        className={barIndex === 19 ? "bg-acidGreen" : "bg-strongBorder"}
                        key={barIndex}
                        style={{ height: `${18 + ((barIndex * 13 + index * 9) % 56)}%`, width: "100%" }}
                      />
                    ))}
                  </div>

                  <div className="mt-5 grid gap-3 border-t border-roomBorder pt-4 font-mono text-[10px] uppercase text-mutedText md:grid-cols-4">
                    <Link className="truncate hover:text-paperWhite" href={signal.artistHref}>{signal.artist}</Link>
                    <span>Sound references: {signal.references}</span>
                    <span>Avg BPM: {signal.bpm}</span>
                    <span className="text-acidGreen">Peak at {signal.peakTime}</span>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <div className="border border-roomBorder bg-panelBlack p-6">
              <p className="font-display text-2xl uppercase text-paperWhite">Sound Vault is waiting for real music</p>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-mutedText">
                The home feed now uses published tracks from Supabase. Publish tracks from a DJ account or open Explore after real music is loaded.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <ButtonLink href="/explore" size="sm" variant="secondary">Open Explore</ButtonLink>
                <ButtonLink href="/dashboard/settings" size="sm" variant="primary">Unlock DJ tools</ButtonLink>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="border-t border-roomBorder px-5 py-10 md:px-10">
        <div className="mx-auto grid max-w-[1760px] gap-6 lg:grid-cols-[0.75fr_1fr]">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-acidGreen">Prototype programme</p>
            <h2 className="mt-3 font-display text-4xl uppercase leading-none text-paperWhite md:text-5xl">
              Listen.
              <br />
              Save moment.
              <br />
              Open artist.
              <br />
              Use sound as brief.
            </h2>
          </div>
          <div className="grid gap-px bg-roomBorder md:grid-cols-2">
            {roomEvents.slice(0, 4).map((event) => (
              <Link className="bg-panelBlack p-5 transition hover:bg-inkPanel" href="/events" key={event.title}>
                <p className="font-mono text-[10px] uppercase text-acidGreen">
                  {event.month} / {event.day}
                </p>
                <h3 className="mt-3 font-display text-2xl uppercase text-paperWhite">{event.title}</h3>
                <p className="mt-2 text-sm leading-6 text-mutedText">{event.venue}</p>
                <p className="mt-4 truncate font-mono text-[10px] uppercase text-mutedText">Sample programme / open events</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-panelBlack p-5">
      <p className="font-mono text-[10px] uppercase text-mutedText">{label}</p>
      <p className={`mt-4 font-display text-4xl uppercase leading-none ${accent ? "text-acidGreen" : "text-paperWhite"}`}>
        {value}
      </p>
    </div>
  );
}

function LogicCell({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div className="bg-black p-6">
      <p className="font-mono text-[10px] uppercase text-mutedText">{number}</p>
      <h3 className="mt-8 font-display text-xl uppercase text-paperWhite">{title}</h3>
      <p className="mt-3 max-w-sm text-sm leading-6 text-mutedText">{body}</p>
    </div>
  );
}

async function loadHomeData(): Promise<HomeData> {
  if (!supabaseUrl || !supabaseKey || demoMode) {
    return { activeEvents: 0, liveStreams: 0, publicSounds: 0, signals: [] };
  }

  try {
    const [works, liveStreams, events] = await Promise.all([
      readSupabaseRows<Work>("works", {
        is_deleted: "eq.false",
        limit: "6",
        order: "play_count.desc.nullslast,created_at.desc",
        select: "id,dj_id,title,type,link,description,cover_image,genre,bpm,visibility,play_count,like_count,duration_seconds,is_deleted,created_at",
        visibility: "eq.public"
      }),
      readSupabaseRows<LiveStream>("live_streams", {
        limit: "20",
        select: "id,status",
        status: "eq.live"
      }),
      readSupabaseRows<{ id: string }>("events", {
        limit: "20",
        select: "id"
      })
    ]);

    const playableWorks = works.filter((work) => Boolean(work.link));
    const djIds = Array.from(new Set(playableWorks.map((work) => work.dj_id).filter(Boolean)));
    const djs = djIds.length > 0
      ? await readSupabaseRows<DjProfile>("dj_profiles", {
          id: `in.(${djIds.join(",")})`,
          select: "id,stage_name,city,country,genres,bpm_range,avatar_url,cover_image_url"
        })
      : [];
    const djLookup = djs.reduce<Record<string, DjProfile>>((acc, dj) => {
      acc[dj.id] = dj;
      return acc;
    }, {});

    return {
      activeEvents: events.length,
      liveStreams: liveStreams.length,
      publicSounds: playableWorks.length,
      signals: playableWorks.slice(0, 4).map((work) => {
        const dj = djLookup[work.dj_id] ?? null;
        const peak = getPrimaryTrackMoment(work.duration_seconds);

        return {
          artist: dj?.stage_name || "ROOM_9 Artist",
          artistHref: dj ? `/dj/${dj.id}` : "/explore",
          bpm: work.bpm || dj?.bpm_range || "N/A",
          coverUrl: getWorkCoverUrl(work, dj),
          duration: formatTrackTime(work.duration_seconds),
          genre: work.genre || dj?.genres || "Public sound",
          href: `/track/${work.id}`,
          id: work.id,
          references: String(work.like_count ?? work.play_count ?? 0),
          title: work.title || "Untitled sound",
          peakTime: formatTrackTime(peak.seconds)
        };
      })
    };
  } catch {
    return { activeEvents: 0, liveStreams: 0, publicSounds: 0, signals: [] };
  }
}

async function readSupabaseRows<T>(table: string, params: Record<string, string>) {
  if (!supabaseUrl || !supabaseKey) {
    return [] as T[];
  }

  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`
    },
    next: { revalidate: 60 }
  });

  if (!response.ok) {
    return [] as T[];
  }

  return (await response.json()) as T[];
}
