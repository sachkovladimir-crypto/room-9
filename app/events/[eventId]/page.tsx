"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BackButton } from "@/components/BackButton";
import { EmptyState } from "@/components/EmptyState";
import { eventRows } from "@/lib/room9Design";
import {
  formatSupabaseError,
  getSupabase,
  hasSupabaseConfig,
  logSupabaseError
} from "@/lib/supabase";
import type { EventPost, Profile } from "@/lib/types";

export default function EventDetailsPage() {
  const params = useParams<{ eventId: string }>();
  const fallbackEvent = useMemo(() => getFallbackEvent(params.eventId), [params.eventId]);
  const [event, setEvent] = useState<EventPost | null>(fallbackEvent);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(hasSupabaseConfig() && !fallbackEvent));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasSupabaseConfig() || !params.eventId || fallbackEvent) {
      return;
    }

    async function loadEvent() {
      setIsLoading(true);
      setError("");

      try {
        const supabase = getSupabase();
        const [{ data: eventData, error: eventError }, { data: sessionData }] = await Promise.all([
          supabase.from("events").select("*").eq("id", params.eventId).maybeSingle(),
          supabase.auth.getSession()
        ]);

        if (eventError || !eventData) {
          if (eventError) {
            logSupabaseError("Event details load failed", eventError);
          }
          setError(
            eventError
              ? formatSupabaseError(eventError, "Could not load event.")
              : "This event page is not available."
          );
          return;
        }

        setEvent(eventData as EventPost);

        const user = sessionData.session?.user ?? null;
        if (user) {
          const { data: profileData, error: profileError } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();

          if (profileError) {
            logSupabaseError("Event details profile load failed", profileError);
          } else {
            setProfile((profileData as Profile | null) ?? null);
          }
        }
      } catch (caughtError) {
        logSupabaseError("Event details unexpected failure", caughtError);
        setError(formatSupabaseError(caughtError, "Could not load event."));
      } finally {
        setIsLoading(false);
      }
    }

    loadEvent();
  }, [fallbackEvent, params.eventId]);

  if (isLoading) {
    return (
      <main className="room-page">
        <section className="room-shell py-12">
          <div className="room-card min-h-[560px] animate-pulse" />
        </section>
      </main>
    );
  }

  if (error || !event) {
    return (
      <main className="room-page">
        <section className="room-shell py-12">
          <EmptyState title="Event unavailable" message={error || "This event page is not available."} href="/events" action="Events" />
        </section>
      </main>
    );
  }

  const canEdit = profile?.id && event.organizer_id === profile.id;

  return (
    <main className="room-page">
      <section className="mx-auto max-w-[1680px] px-5 py-6 md:px-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <BackButton fallbackHref="/events" />
          {canEdit ? (
            <Link className="room-white-button" href="/dashboard/events">
              Open Event Desk
            </Link>
          ) : null}
        </div>

        <section
          className={`relative min-h-[420px] overflow-hidden border border-roomBorder bg-black p-6 md:p-8 ${
            event.poster_url ? "bg-cover bg-center" : "room-stream-photo"
          }`}
          style={event.poster_url ? { backgroundImage: `url(${event.poster_url})` } : undefined}
        >
          <div className="absolute inset-0 bg-black/75" />
          <div className="relative z-10 flex min-h-[340px] flex-col justify-end">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ash">
              {[event.event_type, event.city, event.country].filter(Boolean).join(" / ")}
            </p>
            <h1 className="room-heading mt-5 max-w-5xl text-[44px] leading-[0.9] md:text-[72px]">
              {event.title}
            </h1>
          </div>
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
          <section className="room-card p-5">
            <p className="room-tiny">Event Brief</p>
            <p className="mt-4 text-sm leading-6 text-neutral-200">
              {event.description || "Underground event page for ROOM_9 organizers and guests."}
            </p>
            <div className="mt-6 border-t border-line pt-5">
              <p className="room-tiny">Lineup</p>
              <p className="mt-3 font-mono text-xs uppercase leading-6 text-bone">
                {event.lineup || "Lineup TBA"}
              </p>
            </div>
          </section>

          <aside className="room-card h-fit p-5">
            <p className="room-tiny">Info</p>
            <div className="mt-5 grid gap-px bg-line">
              <InfoCell label="Date" value={formatEventDate(event.event_date)} />
              <InfoCell label="Venue" value={event.venue_name || "Venue TBA"} />
              <InfoCell label="City" value={[event.city, event.country].filter(Boolean).join(", ") || "Location TBA"} />
              <InfoCell label="Type" value={event.event_type || "Event"} />
            </div>
            <Link className="room-white-button mt-6 w-full" href="/explore">
              Book DJs
            </Link>
          </aside>
        </div>
      </section>
    </main>
  );
}

function getFallbackEvent(id: string | undefined): EventPost | null {
  if (!id?.startsWith("fallback-")) {
    return null;
  }

  const index = Number(id.replace("fallback-", ""));
  const source = eventRows[index];
  if (!source) {
    return null;
  }

  return {
    id,
    organizer_id: null,
    title: source.title,
    description: "Curated underground experience from the ROOM_9 event archive.",
    venue_name: source.venue.split(",")[0],
    city: source.venue.split(",")[1]?.trim() ?? "Berlin",
    country: null,
    event_date: `2026-${index === 0 ? "10-24" : index === 1 ? "11-08" : "12-15"}`,
    event_type: index === 2 ? "Live" : index === 1 ? "Experimental" : "Techno",
    status: "public",
    capacity: null,
    budget: null,
    lineup: source.lineup,
    poster_url: null,
    created_at: "2026-01-01T00:00:00.000Z"
  };
}

function formatEventDate(value: string | null) {
  if (!value) {
    return "Date TBA";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-black p-4">
      <p className="room-tiny">{label}</p>
      <p className="mt-2 font-display text-xl uppercase">{value}</p>
    </div>
  );
}
