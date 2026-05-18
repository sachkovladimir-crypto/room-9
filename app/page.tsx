import Link from "next/link";
import { ButtonLink, StatusBadge } from "@/components/room9-ui";
import { roomEvents } from "@/lib/room9Design";

const vaultSignals = [
  {
    artist: "Amelie Lens",
    title: "Awakenings Festival 2023 Set",
    time: "48:15",
    bpm: "138",
    saved: "14"
  },
  {
    artist: "Klangkuenstler",
    title: "Industrial Complex Vol. 4",
    time: "31:20",
    bpm: "145",
    saved: "21"
  }
];

export default function HomePage() {
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
                <span>Now playing / Room signal</span>
                <span className="border border-roomBorder bg-black/70 px-3 py-2 text-paperWhite">02:45 / 06:30</span>
              </div>

              <div className="max-w-3xl">
                <StatusBadge status="live">Live now</StatusBadge>
                <p className="mt-4 font-mono text-[10px] uppercase text-mutedText">Music platform first / booking layer second</p>
                <h1 className="mt-3 max-w-[760px] font-display text-[54px] uppercase leading-[0.84] text-paperWhite drop-shadow-[0_0_18px_rgba(255,255,255,0.22)] md:text-[82px] xl:text-[104px]">
                  SOUND LEADS.
                  <br />
                  BOOKING FOLLOWS.
                </h1>
                <p className="mt-5 max-w-xl text-sm leading-6 text-mutedText">
                  Discover tracks and DJ sets, keep the player running, save exact sound
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
                {vaultSignals.map((signal) => (
                  <Link
                    className="grid grid-cols-[72px_1fr] gap-3 border border-roomBorder p-2 transition hover:border-paperWhite"
                    href="/library"
                    key={signal.title}
                  >
                    <div className="room-home-photo h-16 bg-inkPanel grayscale" />
                    <div className="min-w-0">
                      <h2 className="truncate font-display text-sm uppercase text-paperWhite">{signal.title}</h2>
                      <p className="mt-1 font-mono text-[10px] uppercase text-mutedText">{signal.artist} / 2h 00m</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            <section className="grid grid-cols-2 gap-px bg-roomBorder p-px">
              <Metric label="Live streams" value="142" />
              <Metric label="Active rooms" value="89" accent />
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
          <LogicCell number="01" title="Listen" body="Discover sets by BPM, energy, room type, city and atmosphere briefs." />
          <LogicCell number="02" title="Brief" body="Attach the exact sound reference to a request, case file and booking timeline." />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl uppercase leading-none text-paperWhite">Sound Vault</h2>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-mutedText">
              Discover moments / initiate bookings
            </p>
          </div>
          <ButtonLink href="/explore" size="sm" variant="secondary">
            Filters
          </ButtonLink>
        </div>

        <div className="mt-6 grid gap-4">
          {vaultSignals.map((signal, index) => (
            <article className="grid border border-roomBorder bg-black lg:grid-cols-[240px_1fr]" key={signal.title}>
              <div className="room-home-photo min-h-[220px] border-b border-roomBorder bg-inkPanel grayscale lg:border-b-0 lg:border-r" style={{ backgroundPosition: index === 0 ? "38% 38%" : "62% 38%" }} />
              <div className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <StatusBadge status="verified">Verified</StatusBadge>
                    <h3 className="mt-4 font-display text-2xl uppercase leading-none text-paperWhite">{signal.title}</h3>
                    <p className="mt-2 font-mono text-[10px] uppercase text-mutedText">
                      Recorded 14.07.2025 / 1h 30m
                    </p>
                  </div>
                  <Link className="font-mono text-[10px] uppercase text-acidGreen hover:text-paperWhite" href="/explore">
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
                  <span>{signal.artist}</span>
                  <span>Sound references: {signal.saved}</span>
                  <span>Avg BPM: {signal.bpm}</span>
                  <span className="text-acidGreen">Peak at {signal.time}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-roomBorder px-5 py-10 md:px-10">
        <div className="mx-auto grid max-w-[1760px] gap-6 lg:grid-cols-[0.75fr_1fr]">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-acidGreen">System logic</p>
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
                <p className="mt-4 truncate font-mono text-[10px] uppercase text-mutedText">{event.lineup}</p>
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
