"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BackButton } from "@/components/BackButton";
import { eventRows } from "@/lib/room9Design";
import {
  formatSupabaseError,
  getSupabase,
  hasSupabaseConfig,
  logSupabaseError
} from "@/lib/supabase";
import type { EventPost } from "@/lib/types";

const fallbackEvents: EventPost[] = eventRows.map((event, index) => ({
  id: `fallback-${index}`,
  organizer_id: null,
  title: event.title,
  description: "Curated underground experience from the ROOM_9 event archive.",
  venue_name: event.venue.split(",")[0],
  city: event.venue.split(",")[1]?.trim() ?? "Berlin",
  country: null,
  event_date: `2026-${index === 0 ? "10-24" : index === 1 ? "11-08" : "12-15"}`,
  event_type: index === 2 ? "Live" : index === 1 ? "Experimental" : "Techno",
  status: "public",
  capacity: null,
  budget: null,
  lineup: event.lineup,
  poster_url: null,
  created_at: "2026-01-01T00:00:00.000Z"
}));

export default function EventsPage() {
  const [events, setEvents] = useState<EventPost[]>(fallbackEvents);
  const [filter, setFilter] = useState("All");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      return;
    }

    async function loadEvents() {
      try {
        const supabase = getSupabase();
        const { data, error: loadError } = await supabase
          .from("events")
          .select("*")
          .order("event_date", { ascending: true });

        if (loadError) {
          logSupabaseError("Events load failed", loadError);
          setError(formatSupabaseError(loadError, "Events table is not ready, so ROOM_9 is showing demo events."));
          return;
        }

        const loaded = (data as EventPost[]) ?? [];
        if (loaded.length > 0) {
          setEvents(loaded);
        }
      } catch (caughtError) {
        logSupabaseError("Events unexpected load failure", caughtError);
        setError(formatSupabaseError(caughtError, "Events table is not ready, so ROOM_9 is showing demo events."));
      }
    }

    loadEvents();
  }, []);

  const filters = useMemo(() => {
    return ["All", ...Array.from(new Set(events.map((event) => event.event_type).filter(Boolean)))] as string[];
  }, [events]);

  const visibleEvents = useMemo(() => {
    if (filter === "All") {
      return events;
    }

    return events.filter((event) => event.event_type === filter);
  }, [events, filter]);

  return (
    <main className="room-page">
      <section className="border-b border-roomBorder px-5 py-6 md:px-6">
        <div className="mx-auto max-w-[1680px]">
          <div className="flex flex-wrap justify-between gap-4">
            <BackButton fallbackHref="/" />
            <Link className="room-white-button" href="/dashboard/events">
              Event Desk
            </Link>
          </div>
          <div className="mt-8 grid gap-6 lg:grid-cols-[0.72fr_1fr] lg:items-end">
            <div>
              <p className="room-tiny">Public programme / event pages</p>
              <h1 className="room-heading mt-3 max-w-3xl text-[38px] leading-[0.9] md:text-[56px]">
                Upcoming Events
              </h1>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-ash">
              Curated underground experiences connected to ROOM_9 sound discovery, saved references,
              lineup slots, streams and booking cases.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-2 border-t border-roomBorder pt-4">
            {filters.map((item) => (
              <button
                className={filter === item ? "room-white-button px-4" : "room-outline-button px-4"}
                type="button"
                key={item}
                onClick={() => setFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error ? <p className="border-b border-line px-5 py-3 text-sm text-neutral-300 md:px-6">{error}</p> : null}

      <section className="px-5 py-6 md:px-6">
        <div className="mx-auto max-w-[1680px] border-t border-roomBorder">
          {visibleEvents.map((event) => {
            const date = displayEventDate(event.event_date);

            return (
              <article
                className="grid gap-4 border-b border-roomBorder py-4 md:grid-cols-[108px_1.1fr_1fr_120px] md:items-center"
                key={event.id}
              >
                <div className="font-mono uppercase">
                  <p className="text-[10px] text-mutedText">{date.month}</p>
                  <p className="mt-1 font-display text-3xl leading-none text-paperWhite">{date.day}</p>
                </div>
                <div>
                  <h2 className="room-heading text-2xl">{event.title}</h2>
                  <p className="mt-2 font-mono text-[11px] uppercase text-ash">
                    {[event.venue_name, event.city, event.country].filter(Boolean).join(", ")}
                  </p>
                </div>
                <p className="font-mono text-xs uppercase leading-5 text-ash">{event.lineup}</p>
                <Link className="room-outline-button w-full" href={`/events/${event.id}`}>
                  Details
                </Link>
              </article>
            );
          })}
        </div>
      </section>

    </main>
  );
}

function displayEventDate(value: string | null) {
  if (!value) {
    return { month: "TBA", day: "--" };
  }

  const date = new Date(`${value}T00:00:00`);
  return {
    month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date),
    day: new Intl.DateTimeFormat("en-US", { day: "2-digit" }).format(date)
  };
}
