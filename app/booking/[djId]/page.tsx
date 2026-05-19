"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { MissingConfigNotice } from "@/components/AuthNotice";
import { useAudioPlayer } from "@/components/GlobalAudioPlayer";
import {
  formatSupabaseError,
  getSupabase,
  hasSupabaseConfig,
  isMissingAuthSession,
  logSupabaseError
} from "@/lib/supabase";
import { getDemoDjProfile, getDemoWork, isDemoDjId, isDemoWorkId } from "@/lib/demoContent";
import { trackUserInteraction } from "@/lib/interactions";
import { cssImageUrl, getWorkCoverUrl } from "@/lib/media";
import { loadRoleAccess } from "@/lib/roleAccess";
import { clampTrackTimestamp, formatTrackTime, getMomentDisplayLabel, getPrimaryTrackMoment } from "@/lib/trackMoments";
import { hasRoleAccess, isBookingClientRole, type Booking, type DjProfile, type EventPost, type Profile, type Role, type Work } from "@/lib/types";

type BookingForm = {
  event_date: string;
  venue_name: string;
  city: string;
  event_type: string;
  expected_set_time: string;
  capacity: string;
  budget: string;
  message: string;
};

const initialForm: BookingForm = {
  event_date: "",
  venue_name: "",
  city: "",
  event_type: "",
  expected_set_time: "",
  capacity: "",
  budget: "",
  message: ""
};

export default function BookingPage() {
  const params = useParams<{ djId: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeRoles, setActiveRoles] = useState<Role[]>(["listener"]);
  const [dj, setDj] = useState<DjProfile | null>(null);
  const [sourceWork, setSourceWork] = useState<Work | null>(null);
  const [sourceEvent, setSourceEvent] = useState<EventPost | null>(null);
  const [sourceEventId, setSourceEventId] = useState<string | null>(null);
  const [sourceSlotId, setSourceSlotId] = useState<string | null>(null);
  const [sourceSavedMomentId, setSourceSavedMomentId] = useState<string | null>(null);
  const [sourceMomentSeconds, setSourceMomentSeconds] = useState(0);
  const [sourceDurationSeconds, setSourceDurationSeconds] = useState<number | null>(null);
  const [sourceMomentNote, setSourceMomentNote] = useState("");
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [syncWarning, setSyncWarning] = useState("");
  const [success, setSuccess] = useState(false);
  const bookingStartLoggedRef = useRef(false);
  const { playTrack, seekTo, setSelectedTimestamp } = useAudioPlayer();
  const safeSourceMomentSeconds = clampTrackTimestamp(sourceMomentSeconds, sourceDurationSeconds);
  const sourceMoment = getPrimaryTrackMoment(sourceDurationSeconds);

  useEffect(() => {
    if (!profile?.id || !dj?.id || bookingStartLoggedRef.current) {
      return;
    }

    bookingStartLoggedRef.current = true;
    trackUserInteraction({
      djId: dj.id,
      eventId: sourceEvent?.id ?? sourceEventId,
      interactionType: "start_booking",
      metadata: {
        source_slot_id: sourceSlotId,
        source_track_title: sourceWork?.title ?? null
      },
      scope: profile.id,
      timestampSeconds: sourceWork ? safeSourceMomentSeconds : null,
      workId: sourceWork?.id
    });
  }, [dj?.id, profile?.id, safeSourceMomentSeconds, sourceEvent?.id, sourceEventId, sourceSlotId, sourceWork]);

  useEffect(() => {
    if (!hasSupabaseConfig() || !params.djId) {
      return;
    }

    async function load() {
      setIsLoading(true);
      setError("");

      try {
        const supabase = getSupabase();
        const demoDj = getDemoDjProfile(params.djId);

        if (demoDj) {
          setDj(demoDj);
        } else {
          const { data: djData, error: djError } = await supabase
            .from("dj_profiles")
            .select("*")
            .eq("id", params.djId)
            .maybeSingle();

          if (djError || !djData) {
            if (djError) {
              logSupabaseError("Booking DJ profile load failed", djError);
              setError(formatSupabaseError(djError, "Unable to load booking form."));
            }
            return;
          } else {
            setDj((djData as DjProfile | null) ?? null);
          }
        }

        const urlParams =
          typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
        const workId = urlParams.get("workId");
        const eventId = urlParams.get("eventId");
        const safeEventId = eventId && isUuid(eventId) ? eventId : null;
        const slotId = urlParams.get("slotId");
        const safeSlotId = slotId && isUuid(slotId) ? slotId : null;
        const momentId = urlParams.get("momentId");
        const safeMomentId = momentId && isUuid(momentId) ? momentId : null;
        const moment = Number(urlParams.get("t") ?? 0);
        setSourceEventId(safeEventId);
        setSourceSlotId(safeSlotId);
        setSourceSavedMomentId(safeMomentId);
        setSourceMomentSeconds(Number.isFinite(moment) && moment > 0 ? Math.round(moment) : 0);

        if (workId) {
          const demoWork = getDemoWork(workId);
          if (demoWork) {
            setSourceWork(demoWork);
            setSourceDurationSeconds(demoWork.duration_seconds);
          } else if (isDemoWorkId(workId)) {
            setSourceWork(null);
            setSourceDurationSeconds(null);
          } else {
            const { data: workData, error: workError } = await supabase
              .from("works")
              .select("*")
              .eq("id", workId)
              .maybeSingle();

            if (workError || !workData) {
              if (workError) {
                logSupabaseError("Booking source work load failed", workError);
              }
            } else {
              const loadedSourceWork = (workData as Work | null) ?? null;
              setSourceWork(loadedSourceWork);
              if (loadedSourceWork?.duration_seconds) {
                setSourceDurationSeconds(loadedSourceWork.duration_seconds);
              }
            }
          }
        } else {
          setSourceWork(null);
          setSourceDurationSeconds(null);
        }

        if (safeEventId) {
          const { data: eventData, error: eventError } = await supabase
            .from("events")
            .select("*")
            .eq("id", safeEventId)
            .maybeSingle();

          if (eventError) {
            logSupabaseError("Booking source event load failed", eventError);
          } else {
            setSourceEvent((eventData as EventPost | null) ?? null);
          }
        } else {
          setSourceEvent(null);
        }

        const { data: sessionData, error: userError } = await supabase.auth.getSession();

        if (userError && !isMissingAuthSession(userError)) {
          logSupabaseError("Booking auth user load failed", userError);
          setError(formatSupabaseError(userError, "Could not load the current user."));
          return;
        }

        const user = sessionData.session?.user ?? null;
        if (!user) {
          setProfile(null);
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          logSupabaseError("Booking profile load failed", profileError);
          setError(formatSupabaseError(profileError, "Unable to load booking form."));
        } else {
          const loadedProfile = (profileData as Profile | null) ?? null;
          setProfile(loadedProfile);
          if (loadedProfile) {
            try {
              setActiveRoles(await loadRoleAccess(supabase, loadedProfile.id, loadedProfile.role));
            } catch (roleAccessError) {
              logSupabaseError("Booking role access load failed", roleAccessError);
              setActiveRoles(["listener"]);
            }
          }
        }
      } catch (caughtError) {
        logSupabaseError("Booking form unexpected load failure", caughtError);
        setError(formatSupabaseError(caughtError, "Unable to load booking form."));
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [params.djId]);

  useEffect(() => {
    if (!sourceEvent) {
      return;
    }

    setForm((current) => ({
      ...current,
      city: current.city || sourceEvent.city || "",
      event_date: current.event_date || sourceEvent.event_date || "",
      event_type: current.event_type || sourceEvent.event_type || "",
      venue_name: current.venue_name || sourceEvent.venue_name || ""
    }));
  }, [sourceEvent]);

  useEffect(() => {
    if (!sourceWork || form.message.trim() || (sourceWork.link && sourceDurationSeconds === null)) {
      return;
    }

    setForm((current) => ({
      ...current,
      message: `We are using the ${formatTrackTime(safeSourceMomentSeconds)} sound reference in ${sourceWork.title || "your track"} as an atmosphere brief${sourceEvent ? ` for ${sourceEvent.title}` : ""}.`
    }));
  }, [form.message, safeSourceMomentSeconds, sourceDurationSeconds, sourceEvent, sourceWork]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !dj) {
      return;
    }

    setError("");
    setSyncWarning("");
    setCreatedBookingId(null);
    setIsSubmitting(true);

    try {
      if (isDemoDjId(dj.id)) {
        setSuccess(true);
        setForm(initialForm);
        setSourceMomentNote("");
        return;
      }

      const supabase = getSupabase();
      const baseMessage = buildRequestMessage(form, sourceWork, safeSourceMomentSeconds, sourceEvent);
      const legacyMomentLine = sourceWork
        ? [
            "",
            "--- Atmosphere brief ---",
            `Track: ${sourceWork.title || "Untitled track"}`,
            `Timestamp: ${formatTrackTime(safeSourceMomentSeconds)}`,
            sourceEvent ? `Event Desk: ${sourceEvent.title}` : "",
            sourceMomentNote ? `Brief note: ${sourceMomentNote}` : ""
          ]
            .filter(Boolean)
            .join("\n")
        : "";
      const bookingPayload = {
        organizer_id: profile.id,
        dj_id: dj.id,
        event_date: form.event_date,
        venue_name: form.venue_name,
        city: form.city,
        event_type: form.event_type,
        message: baseMessage,
        status: "pending",
        source_work_id: sourceWork?.id ?? null,
        source_event_id: sourceEvent?.id ?? sourceEventId,
        source_slot_id: sourceSlotId,
        source_saved_moment_id: sourceSavedMomentId,
        source_track_title: sourceWork?.title ?? null,
        source_timestamp_seconds: sourceWork ? safeSourceMomentSeconds : null,
        source_timestamp_label: sourceWork ? formatTrackTime(safeSourceMomentSeconds) : null,
        source_moment_note: sourceMomentNote || null
      };

      let { data: insertedBooking, error: submitError } = await supabase.from("bookings").insert(bookingPayload).select("*").single();

      if (submitError && isMissingBookingContextSchema(submitError)) {
        logSupabaseError("Booking request insert missing operation context columns, retrying sound-reference payload", submitError);
        const soundReferencePayload = withoutBookingContextColumns(bookingPayload);
        const retry = await supabase.from("bookings").insert(soundReferencePayload).select("*").single();
        insertedBooking = retry.data;
        submitError = retry.error;
      }

      if (submitError && isMissingSoundMomentSchema(submitError)) {
        logSupabaseError("Booking request insert missing sound reference columns, retrying legacy payload", submitError);
        const legacyPayload = {
          organizer_id: profile.id,
          dj_id: dj.id,
          event_date: form.event_date,
          venue_name: form.venue_name,
          city: form.city,
          event_type: form.event_type,
          message: `${baseMessage}${legacyMomentLine}`,
          status: "pending"
        };
        const retry = await supabase.from("bookings").insert(legacyPayload).select("*").single();
        insertedBooking = retry.data;
        submitError = retry.error;
      }

      if (submitError) {
        logSupabaseError("Booking request insert failed", submitError);
        setError(formatSupabaseError(submitError, "Failed to send request. Try again."));
      } else {
        const createdBooking = insertedBooking as Booking | null;
        if (createdBooking?.id && sourceSlotId) {
          const slotPayload: Record<string, string | null> = {
            booking_id: createdBooking.id,
            dj_id: dj.id,
            status: "hold",
            updated_at: new Date().toISOString()
          };

          if (sourceSavedMomentId) {
            slotPayload.saved_moment_id = sourceSavedMomentId;
          }

          const { error: slotUpdateError } = await supabase
            .from("event_lineup_slots")
            .update(slotPayload)
            .eq("id", sourceSlotId)
            .eq("event_id", sourceEvent?.id ?? sourceEventId ?? "");

          if (slotUpdateError) {
            logSupabaseError("Booking request lineup slot attach failed", slotUpdateError);
            setSyncWarning("Request was created, but the Event Desk slot did not sync. Open the case from Booking CRM if the slot still looks unchanged.");
          }
        }

        if (createdBooking?.id && sourceSavedMomentId) {
          const { error: momentUpdateError } = await supabase
            .from("saved_moments")
            .update({
              status: "used-in-booking",
              updated_at: new Date().toISOString()
            })
            .eq("id", sourceSavedMomentId)
            .eq("user_id", profile.id);

          if (momentUpdateError) {
            logSupabaseError("Booking request saved moment status failed", momentUpdateError);
            setSyncWarning("Request was created, but the saved moment status did not sync. The booking case still contains the sound reference.");
          }
        }

        const { error: notificationError } = await supabase.from("notifications").insert({
          user_id: dj.user_id,
          type: "booking_request",
          title: "New booking request",
          body: `${getBookingRequesterLabel(activeRoles)} request for ${sourceEvent?.title || form.venue_name || "an event"} in ${form.city || "TBA"}.`
        });

        if (notificationError) {
          logSupabaseError("Booking notification insert failed", notificationError);
        }

        trackUserInteraction({
          bookingId: createdBooking?.id,
          djId: dj.id,
          eventId: sourceEvent?.id ?? sourceEventId,
          interactionType: "booking_sent",
          metadata: {
            budget: form.budget || null,
            city: form.city || null,
            event_type: form.event_type || null,
            source_slot_id: sourceSlotId,
            saved_moment_id: sourceSavedMomentId,
            venue_name: form.venue_name || null
          },
          scope: profile.id,
          timestampSeconds: sourceWork ? safeSourceMomentSeconds : null,
          workId: sourceWork?.id
        });

        setCreatedBookingId(createdBooking?.id ?? null);
        setSuccess(true);
        setForm(initialForm);
        setSourceMomentNote("");
      }
    } catch (caughtError) {
      logSupabaseError("Booking request unexpected failure", caughtError);
      setError(formatSupabaseError(caughtError, "Failed to send request. Try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  function playSourcePreview() {
    if (!sourceWork?.link) {
      return;
    }

    playTrack({
      id: sourceWork.id,
      title: sourceWork.title || "Selected track",
      artist: dj?.stage_name || "ROOM_9 Artist",
      src: sourceWork.link,
      djId: dj?.id,
      coverUrl: getWorkCoverUrl(sourceWork, dj),
      description: [sourceWork.genre, sourceWork.bpm ? `${sourceWork.bpm} BPM` : "", dj?.city]
        .filter(Boolean)
        .join(" / "),
      durationSeconds: sourceWork.duration_seconds
    });
    window.setTimeout(() => {
      seekTo(safeSourceMomentSeconds);
      setSelectedTimestamp(safeSourceMomentSeconds);
    }, 140);
  }

  if (!hasSupabaseConfig()) {
    return <MissingConfigNotice />;
  }

  if (isLoading) {
    return (
      <main className="room-page">
        <section className="room-shell py-12">
          <div className="room-card min-h-[520px] animate-pulse" />
        </section>
      </main>
    );
  }

  if (error && !dj) {
    return (
      <main className="room-page">
        <section className="room-shell py-12">
          <EmptyState title="Booking error" message={error} href="/explore" action="Back to DJs" />
        </section>
      </main>
    );
  }

  if (!dj) {
    return (
      <main className="room-page">
        <section className="room-shell py-12">
          <EmptyState title="DJ not found" message="This profile cannot receive bookings." />
        </section>
      </main>
    );
  }

  const contextParams = new URLSearchParams();
  if (sourceWork) {
    contextParams.set("workId", sourceWork.id);
    contextParams.set("t", String(safeSourceMomentSeconds));
  }
  if (sourceEvent?.id || sourceEventId) {
    contextParams.set("eventId", sourceEvent?.id ?? sourceEventId ?? "");
  }
  if (sourceSlotId) {
    contextParams.set("slotId", sourceSlotId);
  }
  if (sourceSavedMomentId) {
    contextParams.set("momentId", sourceSavedMomentId);
  }
  const bookingPathWithContext = `/booking/${dj.id}${contextParams.toString() ? `?${contextParams.toString()}` : ""}`;

  if (!isBookingClientRole(activeRoles)) {
    return (
      <OrganizerGate
        dj={dj}
        isLoggedIn={Boolean(profile)}
        nextPath={bookingPathWithContext}
      />
    );
  }

  const bookingMomentLabel = sourceWork ? formatTrackTime(safeSourceMomentSeconds) : "Profile context";
  const bookingTitle = sourceWork ? `Book DJ with ${bookingMomentLabel} brief` : `Book ${dj.stage_name || "DJ"}`;
  const requestSummary = [
    form.event_date || "Date TBA",
    form.venue_name || "Venue TBA",
    form.city || "City TBA",
    form.budget ? `EUR ${form.budget}` : "Budget TBA"
  ].join(" / ");

  return (
    <main className="min-h-screen bg-[#111111] pb-28 text-paperWhite">
      {sourceWork?.link ? (
        <audio
          preload="metadata"
          src={sourceWork.link}
          onLoadedMetadata={(event) => {
            const duration = event.currentTarget.duration;
            if (Number.isFinite(duration) && duration > 0) {
              setSourceDurationSeconds(duration);
            }
          }}
        >
          <track kind="captions" />
        </audio>
      ) : null}
      <header className="flex min-h-14 items-center justify-between border-b border-roomBorder px-6 font-mono text-[11px] uppercase text-mutedText">
        <Link className="flex items-center gap-3 text-paperWhite" href={sourceWork ? `/track/${sourceWork.id}` : `/dj/${dj.id}`}>
          <span className="text-lg leading-none">&lt;</span>
          <span className="text-acidGreen">.</span>
          <span>ROOM_9</span>
        </Link>
        <p>Booking Request / <span className="text-paperWhite">{sourceEvent ? sourceEvent.title : "Draft"}</span></p>
      </header>

      <section className="mx-auto max-w-[1540px] px-8 py-12">
        <div className="mb-12">
          <h1 className="font-display text-[52px] leading-[0.95] text-paperWhite md:text-[66px]">
            {sourceWork ? (
              <>
                Atmosphere brief <span className="text-acidGreen">{bookingMomentLabel}</span>
              </>
            ) : (
              bookingTitle
            )}
          </h1>
          <p className="mt-4 text-lg text-mutedText">
            The selected sound reference becomes a clear atmosphere brief for the live DJ performance{sourceEvent ? ` at ${sourceEvent.title}.` : "."}
          </p>
        </div>

        <section className="grid gap-10 xl:grid-cols-[420px_minmax(0,1fr)]">
          <aside className="space-y-8">
            <div className="border border-roomBorder bg-[#1A1A1A] p-6">
              <div className="flex items-center justify-between gap-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-mutedText">Sound Reference</p>
                <span className="border border-acidGreen px-3 py-2 font-mono text-[10px] uppercase text-acidGreen">
                  {sourceWork ? getMomentDisplayLabel(sourceMoment) : "Profile"}
                </span>
              </div>
              {sourceWork ? (
                <div className="mt-8">
                  <div className="flex gap-5">
                    <div
                      className="h-20 w-20 shrink-0 border border-roomBorder bg-[#0B0B0B] bg-cover bg-center grayscale"
                      style={{ backgroundImage: cssImageUrl(getWorkCoverUrl(sourceWork, dj)) }}
                    />
                    <div>
                      <h2 className="font-display text-2xl uppercase leading-none text-paperWhite">{sourceWork.title || "Untitled track"}</h2>
                      <p className="mt-2 font-mono text-[11px] uppercase text-mutedText">{dj.stage_name || "ROOM_9 Artist"}</p>
                      <button
                        className="mt-3 font-mono text-[11px] font-black uppercase text-acidGreen"
                        disabled={!sourceWork.link}
                        onClick={playSourcePreview}
                        type="button"
                      >
                        Play {bookingMomentLabel}
                      </button>
                    </div>
                  </div>
                  <div className="mt-6 border-t border-roomBorder pt-5">
                    <div className="grid grid-cols-2 gap-5 text-sm">
                      <EvidenceField label="Genre" value={sourceWork.genre || "Industrial Techno"} />
                      <EvidenceField label="BPM" value={sourceWork.bpm || "TBA"} />
                      <EvidenceField label="Energy" value={sourceMoment.energy} />
                      <EvidenceField label="Room Match" value={sourceMoment.roomType} />
                    </div>
                    <button
                      className="room-outline-button mt-7 w-full"
                      disabled={!sourceWork.link}
                      onClick={playSourcePreview}
                      type="button"
                    >
                      Play Preview
                    </button>
                  </div>
                </div>
              ) : (
                <p className="room-muted mt-6">No sound reference attached. Start from a public track to make the event brief sharper.</p>
              )}
            </div>

            <div className="border border-roomBorder bg-[#1A1A1A] p-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-mutedText">Request Summary</p>
              <div className="mt-7 space-y-4">
                {sourceEvent ? <SummaryLine label="Event" value={sourceEvent.title} /> : null}
                <SummaryLine label="Artist" value={dj.stage_name || "ROOM_9 Artist"} />
                <SummaryLine label="Reference" value={sourceWork ? `${sourceWork.title || "Track"} @ ${bookingMomentLabel}` : "Profile booking"} accent />
                <SummaryLine label="Status" value={success ? "Sent" : "Draft"} />
              </div>
              <p className="mt-5 border-t border-roomBorder pt-4 font-mono text-[10px] uppercase text-mutedText">
                {requestSummary}
              </p>
            </div>
          </aside>

          <div>
            {success ? (
              <div className="border border-roomBorder bg-[#1A1A1A] p-8">
                <p className="font-mono text-xs uppercase text-acidGreen">Request sent</p>
                <h2 className="room-heading mt-3 text-4xl">Request sent</h2>
                <p className="room-muted mt-4">
                  Your request is saved. The sound reference is now connected to the event slot and case file.
                </p>
                {syncWarning ? (
                  <p className="mt-4 border border-warningOrange p-3 text-sm text-warningOrange">{syncWarning}</p>
                ) : null}
                <div className="mt-6 flex flex-wrap gap-3">
                  {createdBookingId ? (
                    <Link href={`/booking/details/${createdBookingId}`} className="room-button-solid">
                      Open Case
                    </Link>
                  ) : null}
                  <Link href="/dashboard" className="room-button">
                    View Dashboard
                  </Link>
                  <Link href="/dashboard/events" className="room-button">
                    Event Desk
                  </Link>
                  <Link href="/explore" className="room-button">
                    Explore More DJs
                  </Link>
                </div>
              </div>
            ) : (
              <form className="border border-roomBorder bg-[#1A1A1A] p-8" onSubmit={handleSubmit}>
                <div className="mb-6 border-b border-roomBorder pb-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="room-tiny">Event Details</p>
                    {sourceEvent ? (
                      <span className="border border-acidGreen px-3 py-2 font-mono text-[10px] uppercase text-acidGreen">
                        Loaded from Event Desk
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                  <Field id="event_date" label="Event Date">
                    <input
                      id="event_date"
                      type="date"
                      className="room-input"
                      value={form.event_date}
                      onChange={(event) => setForm({ ...form, event_date: event.target.value })}
                      required
                    />
                  </Field>
                  <Field id="expected_set_time" label="Expected Set Time">
                    <input
                      id="expected_set_time"
                      className="room-input"
                      value={form.expected_set_time}
                      onChange={(event) => setForm({ ...form, expected_set_time: event.target.value })}
                      placeholder="02:00 - 04:00"
                    />
                  </Field>
                  <Field id="venue_name" label="Venue Name">
                    <input
                      id="venue_name"
                      className="room-input"
                      value={form.venue_name}
                      onChange={(event) => setForm({ ...form, venue_name: event.target.value })}
                      required
                    />
                  </Field>
                  <Field id="city" label="City">
                    <input
                      id="city"
                      className="room-input"
                      value={form.city}
                      onChange={(event) => setForm({ ...form, city: event.target.value })}
                      required
                    />
                  </Field>
                  <Field id="event_type" label="Event Type">
                    <input
                      id="event_type"
                      className="room-input"
                      value={form.event_type}
                      onChange={(event) => setForm({ ...form, event_type: event.target.value })}
                      placeholder="Warehouse Party"
                      required
                    />
                  </Field>
                  <Field id="capacity" label="Capacity">
                    <input
                      id="capacity"
                      className="room-input"
                      value={form.capacity}
                      onChange={(event) => setForm({ ...form, capacity: event.target.value })}
                      placeholder="1200"
                    />
                  </Field>
                  <Field id="budget" label="Budget / Fee EUR">
                    <input
                      id="budget"
                      className="room-input"
                      value={form.budget}
                      onChange={(event) => setForm({ ...form, budget: event.target.value })}
                      placeholder="Offer amount"
                    />
                  </Field>
                </div>

                <div className="mt-8">
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <label className="room-label mb-0" htmlFor="message">
                      Message / Proposal
                    </label>
                    <span className="font-mono text-[10px] uppercase text-acidGreen">Auto-generated from evidence</span>
                  </div>
                  <textarea
                    id="message"
                    className="room-input min-h-40 resize-y border-l-4 border-l-acidGreen bg-[#050505] font-mono text-[12px] leading-6"
                    value={form.message}
                    onChange={(event) => setForm({ ...form, message: event.target.value })}
                    placeholder="Add additional details about the booking..."
                  />
                </div>

                {error ? <p className="mt-5 border border-line p-3 text-sm text-red-300">{error}</p> : null}

                <div className="mt-8 border border-roomBorder p-6">
                  <div className="grid grid-cols-[auto_1fr_auto_1fr_auto_1fr_auto_1fr_auto] items-center gap-3">
                    <BookingStep active={!success && !isSubmitting} label="Draft" value="1" />
                    <div className="h-px bg-roomBorder" />
                    <BookingStep active={isSubmitting} label="Sending" value="2" />
                    <div className="h-px bg-roomBorder" />
                    <BookingStep active={success} label="Sent" value="3" />
                    <div className="h-px bg-roomBorder" />
                    <BookingStep active={false} label="Pending" value="4" />
                    <div className="h-px bg-roomBorder" />
                    <BookingStep active={false} label="Decision" value="Flag" />
                  </div>
                </div>

                <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-roomBorder pt-6">
                  <Link href={`/dj/${dj.id}`} className="room-button">
                    Open Artist
                  </Link>
                  {sourceWork ? (
                    <Link href={`/track/${sourceWork.id}`} className="room-button">
                      Back to Track
                    </Link>
                  ) : null}
                  <button className="room-button-solid ml-auto min-w-[200px]" type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Sending..." : "Send Request"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function getBookingRequesterLabel(activeRoles: Role[]) {
  if (hasRoleAccess(activeRoles, ["venue"])) {
    return "VENUE";
  }

  if (hasRoleAccess(activeRoles, ["organizer"])) {
    return "ORGANIZER";
  }

  return "BOOKING";
}

function BookingStep({
  label,
  value,
  active
}: {
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div className="text-center">
      <div className={`mx-auto grid h-8 min-w-8 place-items-center border px-2 font-mono text-[12px] font-black uppercase ${
        active ? "border-acidGreen bg-acidGreen text-black" : "border-roomBorder bg-[#111111] text-mutedText"
      }`}>
        {value}
      </div>
      <p className={`mt-2 font-mono text-[10px] uppercase ${active ? "text-acidGreen" : "text-mutedText"}`}>{label}</p>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label className="room-label" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

function EvidenceField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="room-tiny">{label}</p>
      <p className="mt-2 text-base text-paperWhite">{value}</p>
    </div>
  );
}

function SummaryLine({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-5 border-b border-roomBorder pb-3 text-sm">
      <span className="text-mutedText">{label}</span>
      <span className={accent ? "font-mono text-[11px] uppercase text-acidGreen" : "text-paperWhite"}>{value}</span>
    </div>
  );
}

function OrganizerGate({
  dj,
  isLoggedIn,
  nextPath
}: {
  dj: DjProfile;
  isLoggedIn: boolean;
  nextPath: string;
}) {
  const encodedNext = encodeURIComponent(nextPath);
  const unlockHref = `/dashboard/settings?unlock=organizer&next=${encodedNext}`;

  return (
    <main className="min-h-screen bg-[#111111] text-paperWhite">
      <header className="flex min-h-14 items-center justify-between border-b border-roomBorder px-6 font-mono text-[11px] uppercase text-mutedText">
        <Link className="flex items-center gap-3 text-paperWhite" href={`/dj/${dj.id}`}>
          <span className="text-lg leading-none">&lt;</span>
          <span className="text-acidGreen">.</span>
          <span>ROOM_9</span>
        </Link>
        <p>Booking Access / <span className="text-paperWhite">Verification</span></p>
      </header>
      <section className="mx-auto grid min-h-[calc(100vh-56px)] max-w-[1180px] items-center px-8 py-12">
        <div className="grid gap-8 border border-roomBorder bg-[#1A1A1A] p-8 lg:grid-cols-[1fr_360px]">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-mutedText">Booking access</p>
            <h1 className="mt-4 max-w-3xl font-display text-[48px] uppercase leading-[0.95] text-paperWhite md:text-[64px]">
            {isLoggedIn ? "Organizer account required" : "Create organizer access"}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-mutedText">
            To book {dj.stage_name || "this DJ"}, continue with an organizer or venue account. This
            keeps booking requests, statuses, and messages tied to the right profile.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {isLoggedIn ? (
                <Link href={unlockHref} className="room-button-solid">
                  Unlock Organizer Tools
                </Link>
              ) : (
                <>
                  <Link href={`/login?next=${encodedNext}`} className="room-button-solid">
                    Login as Booker
                  </Link>
                  <Link href={`/register?role=organizer&next=${encodedNext}`} className="room-button">
                    Register, then unlock booking
                  </Link>
                </>
              )}
              <Link href={`/dj/${dj.id}`} className="room-button">
                Back to Artist
              </Link>
            </div>
          </div>
          <aside className="border border-roomBorder bg-black p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-acidGreen">Access model</p>
            <div className="mt-5 space-y-4">
              <GateLine label="Listener" value="Listen, save, follow" />
              <GateLine label="Organizer" value="Requests, case files, chat" />
              <GateLine label="Venue" value="Events, lineup, calendar" />
            </div>
            <p className="mt-6 border-t border-roomBorder pt-5 text-sm leading-6 text-mutedText">
              The selected booking context is preserved after login or registration.
            </p>
          </aside>
          </div>
      </section>
    </main>
  );
}

function GateLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-5 border-b border-roomBorder pb-3">
      <span className="font-display text-base uppercase text-paperWhite">{label}</span>
      <span className="text-right font-mono text-[10px] uppercase text-mutedText">{value}</span>
    </div>
  );
}

function isMissingSoundMomentSchema(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const errorLike = error as { code?: string; message?: string; details?: string };
  const text = `${errorLike.code ?? ""} ${errorLike.message ?? ""} ${errorLike.details ?? ""}`.toLowerCase();

  return (
    text.includes("source_work_id") ||
    text.includes("source_timestamp") ||
    text.includes("source_track_title") ||
    text.includes("schema cache") ||
    text.includes("pgrst204")
  );
}

function isMissingBookingContextSchema(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const errorLike = error as { code?: string; message?: string; details?: string };
  const text = `${errorLike.code ?? ""} ${errorLike.message ?? ""} ${errorLike.details ?? ""}`.toLowerCase();

  return (
    text.includes("source_event_id") ||
    text.includes("source_slot_id") ||
    text.includes("source_saved_moment_id")
  );
}

function withoutBookingContextColumns<T extends {
  source_event_id?: unknown;
  source_slot_id?: unknown;
  source_saved_moment_id?: unknown;
}>(payload: T) {
  const { source_event_id: _sourceEventId, source_slot_id: _sourceSlotId, source_saved_moment_id: _sourceSavedMomentId, ...rest } = payload;
  void _sourceEventId;
  void _sourceSlotId;
  void _sourceSavedMomentId;
  return rest;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function buildRequestMessage(
  form: BookingForm,
  sourceWork: Work | null,
  sourceMomentSeconds: number,
  sourceEvent: EventPost | null
) {
  const lines = [
    form.message.trim(),
    sourceEvent ? `Event Desk: ${sourceEvent.title}` : "",
    form.expected_set_time ? `Expected set time: ${form.expected_set_time}` : "",
    form.capacity ? `Capacity: ${form.capacity}` : "",
    form.budget ? `Budget / fee: EUR ${form.budget}` : "",
    sourceWork
      ? `Atmosphere brief: ${formatTrackTime(sourceMomentSeconds)} in ${sourceWork.title || "attached track"}`
      : ""
  ].filter(Boolean);

  return lines.join("\n");
}
